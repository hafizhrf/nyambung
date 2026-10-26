import type { DiscordAuthResult, RunView } from '@nyambung/shared';
import { api, apiBase, setDiscordSession } from './api';
import { downloadImage } from './shareImage';
export type ActivityLayout = 'focused'|'pip'|'grid';
export interface PlatformAdapter {
  kind: 'browser' | 'discord';
  instanceId?: string;
  userId?: string;
  layoutMode?:ActivityLayout;
  onLayoutChanged?(listener:(layout:ActivityLayout)=>void):()=>void;
  bootstrap(): Promise<void>;
  share(file: File): Promise<'shared' | 'downloaded'>;
  invite?(): Promise<void>;
  updatePresence?(run: RunView | null): Promise<void>;
  onParticipantsChanged?(listener: () => void): () => void;
}
export const browserPlatform: PlatformAdapter = {
  kind: 'browser',
  async bootstrap() { /* Browser identity uses an HttpOnly cookie. */ },
  async share(file) {
    if (navigator.share && navigator.canShare?.({files:[file]})) {
      await navigator.share({files:[file],title:'Hasil Nyambung'}); return 'shared';
    }
    downloadImage(file); return 'downloaded';
  },
};
export class DiscordPlatformAdapter implements PlatformAdapter {
  readonly kind = 'discord';
  instanceId?: string;
  userId?: string;
  layoutMode:ActivityLayout='focused';
  private layouts=new Set<(layout:ActivityLayout)=>void>();
  private layoutSubscribed=false;
  private notifyLayout=({layout_mode}:{layout_mode:number})=>{
    const mode=layout_mode===0?'focused':layout_mode===1?'pip':layout_mode===2?'grid':undefined;
    if(!mode||mode===this.layoutMode)return;
    this.layoutMode=mode;for(const listener of this.layouts)listener(mode);
  };
  onLayoutChanged(listener:(layout:ActivityLayout)=>void){this.layouts.add(listener);listener(this.layoutMode);return()=>{this.layouts.delete(listener);};}
  private sdk?: import('@discord/embedded-app-sdk').DiscordSDK;
  private initializing?: Promise<void>;
  private expiresAt = 0;
  private participants = new Set<() => void>();
  private presenceAllowed = true;
  private participantsSubscriptionPending = false;
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
    if(!this.layoutSubscribed){
      this.layoutSubscribed=true;
      void sdk.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE',this.notifyLayout).catch(()=>{this.layoutSubscribed=false;});
    }
    if (!this.participantsSubscribed && !this.participantsSubscriptionPending) {
      // Participant events are optional. Some mobile clients never acknowledge
      // this RPC; polling already keeps the roster current, so don't block play.
      this.participantsSubscriptionPending=true;
      void sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', this.notifyParticipants)
        .then(()=>{this.participantsSubscribed=true;})
        .catch(()=>{ /* Older clients still receive room updates through polling. */ })
        .finally(()=>{this.participantsSubscriptionPending=false;});
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
  async share(file: File): Promise<'shared' | 'downloaded'> {
    return browserPlatform.share(file);
  }
  async updatePresence(run: RunView | null) {
    if (!this.sdk || !this.presenceAllowed) return;
    const label = run ? run.mode === 'daily' ? `Daily #${String(run.number).padStart(3, '0')}` : 'Mode Acak' : 'Daily & Acak';
    try { await this.sdk.commands.setActivity({ activity: { type: 0, details: label, state: run ? run.completed ? `Selesai · ${run.total.toLocaleString('id-ID')} poin` : `Babak ${Math.min(5, run.results.length + 1)}/5` : 'Siap bermain' } }); }
    catch { this.presenceAllowed = false; /* Presence is optional; gameplay remains usable. */ }
  }
}
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window || !!window.opener || /^\d+\.discordsays\.com$/.test(location.hostname) || params.get('platform')==='mobile';
export const platform: PlatformAdapter = embedded && params.has('frame_id') && params.has('instance_id') ? new DiscordPlatformAdapter() : browserPlatform;
