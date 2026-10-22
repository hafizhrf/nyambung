export interface PlatformAdapter {
  kind: 'browser' | 'discord';
  bootstrap(): Promise<void>;
  share(text: string): Promise<'shared' | 'copied'>;
}
export const browserPlatform: PlatformAdapter = {
  kind: 'browser',
  async bootstrap() { /* Browser identity uses an HttpOnly cookie. Discord gets its own adapter later. */ },
  async share(text) {
    if (navigator.share && /Android|iPhone|iPad/.test(navigator.userAgent)) {
      try { await navigator.share({ text }); return 'shared'; } catch (error) { if ((error as Error).name === 'AbortError') throw error; }
    }
    if (!navigator.clipboard) throw new Error('Salin teks hasil di bawah secara manual.');
    await navigator.clipboard.writeText(text); return 'copied';
  },
};
