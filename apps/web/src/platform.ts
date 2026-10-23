import type { DiscordAuthResult, RunView } from '@nyambung/shared';
import { api, apiBase, setDiscordSession } from './api';
export interface PlatformAdapter {
  kind: 'browser' | 'discord';
  instanceId?: string;
  userId?: string;
  bootstrap(): Promise<void>;
  share(text: string): Promise<'shared' | 'copied'>;
  invite?(): Promise<void>;
  updatePresence?(run: RunView | null): Promise<void>;
  onParticipantsChanged?(listener: () => void): () => void;
}
export const browserPlatform: PlatformAdapter = {
  kind: 'browser',
  async bootstrap() { /* Browser identity uses an HttpOnly cookie. */ },
  async share(text) {
    if (navigator.share && /Android|iPhone|iPad/.test(navigator.userAgent)) {
      try { await navigator.share({ text }); return 'shared'; } catch (error) { if ((error as Error).name === 'AbortError') throw error; }
    }
    if (!navigator.clipboard) throw new Error('Salin teks hasil di bawah secara manual.');
    await navigator.clipboard.writeText(text); return 'copied';
  },
};
export class DiscordPlatformAdapter implements PlatformAdapter {
  readonly kind = 'discord';
  instanceId?: string;
  userId?: string;
  private sdk?: import('@discord/embedded-app-sdk').DiscordSDK;
  private initializing?: Promise<void>;
  private expiresAt = 0;
  private participants = new Set<() => void>();
  private presenceAllowed = true;
  bootstrap(force = false): Promise<void> {
    if (this.initializing) return this.initializing;
    if (!force && this.expiresAt > Date.now() + 60000) return Promise.resolve();
    this.initializing = this.initialize().finally(() => { this.initializing = undefined; });
    return this.initializing;
  }
  private async initialize() {
    const config = await api<{ applicationId: string; nonce: string }>('/discord/bootstrap');
    if (!this.sdk) {
      const { DiscordSDK } = await import('@discord/embedded-app-sdk');
      this.sdk = new DiscordSDK(config.applicationId);
    }
    const sdk = this.sdk;
    await Promise.race([sdk.ready(), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Discord belum siap. Tutup lalu buka kembali Activity.')), 15000); sdk.ready().then(() => clearTimeout(timer)); })]);
    const { code } = await sdk.commands.authorize({ client_id: config.applicationId, response_type: 'code', state: config.nonce, prompt: 'none', scope: ['identify', 'rpc.activities.write'] });
    const response = await fetch(`${apiBase()}/discord/auth`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, nonce: config.nonce, instanceId: sdk.instanceId }), signal: AbortSignal.timeout(20000) });
    const auth = await response.json() as DiscordAuthResult & { error?: string };
    if (!response.ok) throw new Error(auth.error || 'Gagal masuk melalui Discord.');
    const authenticated = await sdk.commands.authenticate({ access_token: auth.accessToken });
    if (!authenticated || authenticated.user.id !== auth.user.id) throw new Error('Identitas Discord tidak sesuai. Buka ulang Activity.');
    this.instanceId = auth.instanceId; this.userId = auth.user.id; this.expiresAt = auth.expiresAt;
    setDiscordSession(auth.sessionToken, () => this.bootstrap(true));
    if (!this.participantsSubscribed) {
      try { await sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', this.notifyParticipants); this.participantsSubscribed = true; }
      catch { /* Older clients still receive room updates through polling. */ }
    }
  }
  private participantsSubscribed = false;
  private notifyParticipants = () => { for (const listener of this.participants) listener(); };
  onParticipantsChanged(listener: () => void) { this.participants.add(listener); return () => { this.participants.delete(listener); }; }
  async invite() {
    await this.bootstrap();
    const { permissions } = await this.sdk!.commands.getChannelPermissions();
    if (!(BigInt(permissions) & (1n | 8n))) throw new Error('Kamu belum memiliki izin mengundang ke channel ini.');
    await this.sdk!.commands.openInviteDialog();
  }
  async share(text: string): Promise<'shared' | 'copied'> {
    await this.bootstrap();
    let result;
    try { result = await this.sdk!.commands.shareLink({ message: text }); }
    catch { return browserPlatform.share(text); }
    if (!result.success) throw new DOMException('Share dibatalkan.', 'AbortError');
    return result.didCopyLink ? 'copied' : 'shared';
  }
  async updatePresence(run: RunView | null) {
    if (!this.sdk || !this.presenceAllowed) return;
    const label = run ? run.mode === 'daily' ? `Daily #${String(run.number).padStart(3, '0')}` : 'Mode Acak' : 'Daily & Acak';
    try { await this.sdk.commands.setActivity({ activity: { type: 0, details: label, state: run ? run.completed ? `Selesai · ${run.total.toLocaleString('id-ID')} poin` : `Babak ${Math.min(5, run.results.length + 1)}/5` : 'Siap bermain' } }); }
    catch { this.presenceAllowed = false; /* Presence is optional; gameplay remains usable. */ }
  }
}
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window || !!window.opener || /^\d+\.discordsays\.com$/.test(location.hostname);
export const platform: PlatformAdapter = embedded && params.has('frame_id') && params.has('instance_id') ? new DiscordPlatformAdapter() : browserPlatform;
