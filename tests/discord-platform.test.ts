import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  ready: vi.fn(), subscribe: vi.fn(), authorize: vi.fn(), authenticate: vi.fn(), setActivity: vi.fn(),
  shareLink: vi.fn(), openInviteDialog: vi.fn(), getChannelPermissions: vi.fn(),
}));
vi.mock('@discord/embedded-app-sdk', () => ({ DiscordSDK: class {
  instanceId = 'room-one'; ready = sdk.ready; subscribe = sdk.subscribe;
  commands = { authorize: sdk.authorize, authenticate: sdk.authenticate, setActivity: sdk.setActivity, shareLink: sdk.shareLink, openInviteDialog: sdk.openInviteDialog, getChannelPermissions: sdk.getChannelPermissions };
} }));
let fetcher: ReturnType<typeof vi.fn>, authCalls: number;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); authCalls = 0;
  vi.stubGlobal('window', { parent: {} });
  vi.stubGlobal('location', { search: '?frame_id=frame&instance_id=room-one', pathname: '/.proxy/' });
  sdk.ready.mockResolvedValue(undefined); sdk.subscribe.mockResolvedValue(undefined);
  sdk.authorize.mockResolvedValue({ code: 'oauth-code' }); sdk.authenticate.mockResolvedValue({ user: { id: 'alice' } });
  sdk.setActivity.mockResolvedValue({}); sdk.getChannelPermissions.mockResolvedValue({ permissions: '1' });
  sdk.openInviteDialog.mockResolvedValue({}); sdk.shareLink.mockResolvedValue({ success: true, didSendMessage: true });
  fetcher = vi.fn(async (input, init) => {
    const path = String(input);
    if (path.endsWith('/bootstrap')) return Response.json({ applicationId: 'app-id', nonce: 'nonce' });
    if (path.endsWith('/auth')) { authCalls++; return Response.json({ accessToken: 'oauth-token', sessionToken: `session-${authCalls}`, expiresAt: Date.now() + 3600000, user: { id: 'alice', name: 'Alice' }, instanceId: 'room-one' }); }
    return Response.json({ available: true });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); });
describe('Discord platform bootstrap', () => {
  it('uses the browser adapter outside an embedded Activity', async () => {
    const window: any = {}; window.parent = window; vi.stubGlobal('window', window);
    const { platform } = await import('../apps/web/src/platform');
    expect(platform.kind).toBe('browser'); await platform.bootstrap(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('recognizes Discord Activity popout windows', async () => {
    const window: any = { opener: {} }; window.parent = window; vi.stubGlobal('window', window);
    const { platform } = await import('../apps/web/src/platform');
    expect(platform.kind).toBe('discord'); await platform.bootstrap(); expect(platform.userId).toBe('alice');
  });
  it('recognizes top-level Discord mobile WebViews without a parent iframe',async()=>{
    const window:any={};window.parent=window;vi.stubGlobal('window',window);
    vi.stubGlobal('location',{search:'?frame_id=frame&instance_id=room-one&platform=mobile',pathname:'/.proxy/',hostname:'nyambung.web.id'});
    const {platform}=await import('../apps/web/src/platform');expect(platform.kind).toBe('discord');
    await platform.bootstrap();expect(platform.userId).toBe('alice');
  });
  it('opens the game when optional participant subscription is never acknowledged on mobile',async()=>{
    sdk.subscribe.mockImplementation(()=>new Promise(()=>{}));
    const {platform}=await import('../apps/web/src/platform');
    await platform.bootstrap();expect(platform.userId).toBe('alice');
    const {api}=await import('../apps/web/src/api');await api('/daily');
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe('Bearer session-1');
  });
  it('runs SDK authorization once for concurrent bootstraps and sends no guest cookie', async () => {
    const { platform } = await import('../apps/web/src/platform');
    await Promise.all([platform.bootstrap(), platform.bootstrap()]);
    expect(sdk.authorize).toHaveBeenCalledOnce();
    expect(sdk.authorize.mock.calls[0][0].scope).toEqual(['identify', 'rpc.activities.write']);
    expect(sdk.authenticate).toHaveBeenCalledWith({ access_token: 'oauth-token' });
    expect(platform.instanceId).toBe('room-one');
    const { api } = await import('../apps/web/src/api'); await api('/daily');
    expect(fetcher.mock.calls.at(-1)).toEqual(['/.proxy/api/daily', expect.objectContaining({ credentials: 'omit', headers: { Authorization: 'Bearer session-1' } })]);
  });
  it('refreshes an expired application session and retries the same answer without reload', async () => {
    const { platform } = await import('../apps/web/src/platform'); await platform.bootstrap();
    const remote = fetcher.getMockImplementation()!; let failed = false;
    fetcher.mockImplementation(async (path, init) => {
      if (String(path).includes('/answers') && !failed) { failed = true; return Response.json({ error: 'expired' }, { status: 401 }); }
      return remote(path, init);
    });
    const { api } = await import('../apps/web/src/api');
    await api('/runs/one/answers', { stage: 0, word: 'pohon' });
    expect(authCalls).toBe(2);
    const answers = fetcher.mock.calls.filter(([path]) => String(path).includes('/answers'));
    expect(answers).toHaveLength(2); expect(answers[0][1].body).toBe(answers[1][1].body);
    expect(answers[1][1].headers.Authorization).toBe('Bearer session-2');
  });
  it('does not expose a usable platform session if Discord authenticates a different user', async () => {
    sdk.authenticate.mockResolvedValueOnce({ user: { id: 'mallory' } });
    const { platform } = await import('../apps/web/src/platform');
    await expect(platform.bootstrap()).rejects.toThrow('Identitas Discord');
    expect(platform.userId).toBeUndefined();
  });
  it('keeps presence spoiler-free and shares PNG files while retaining Discord invitations', async () => {
    const { platform } = await import('../apps/web/src/platform'); await platform.bootstrap();
    await platform.updatePresence!({ mode: 'daily', number: 1, completed: false, results: [{ word: 'secret-answer' }], total: 1000 } as any);
    expect(sdk.setActivity.mock.calls[0][0].activity).toMatchObject({ details: 'Daily #001', state: 'Babak 2/5' });
    expect(JSON.stringify(sdk.setActivity.mock.calls)).not.toContain('secret-answer');
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator',{canShare:vi.fn().mockReturnValue(true),share});
    const file = new File(['png'],'nyambung.png',{type:'image/png'});
    expect(await platform.share(file)).toBe('shared');
    expect(share).toHaveBeenCalledWith({files:[file],title:'Hasil Nyambung'});
    expect(sdk.shareLink).not.toHaveBeenCalled();
    await platform.invite!(); expect(sdk.openInviteDialog).toHaveBeenCalledOnce();
    sdk.getChannelPermissions.mockResolvedValueOnce({ permissions: '0' });
    await expect(platform.invite!()).rejects.toThrow('izin');
  });
  it('tracks PiP, grid and focused layout events without leaking listeners',async()=>{
    const {platform}=await import('../apps/web/src/platform');await platform.bootstrap();
    const listener=vi.fn();const remove=platform.onLayoutChanged!(listener);
    const notify=sdk.subscribe.mock.calls.find(([event])=>event==='ACTIVITY_LAYOUT_MODE_UPDATE')![1];
    expect(listener).toHaveBeenLastCalledWith('focused');
    notify({layout_mode:1});expect(platform.layoutMode).toBe('pip');expect(listener).toHaveBeenLastCalledWith('pip');
    notify({layout_mode:2});expect(listener).toHaveBeenLastCalledWith('grid');
    notify({layout_mode:-1});expect(platform.layoutMode).toBe('grid');
    remove();const calls=listener.mock.calls.length;notify({layout_mode:0});expect(platform.layoutMode).toBe('focused');expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('supports participant listeners while optional client features fail gracefully', async () => {
    sdk.subscribe.mockRejectedValueOnce(new Error('old client'));
    const { platform } = await import('../apps/web/src/platform'); await platform.bootstrap();
    const listener = vi.fn(); const remove = platform.onParticipantsChanged!(listener);
    // Successful reauthorization retries subscribing on an older client.
    await (platform as any).bootstrap(true);
    const notify = sdk.subscribe.mock.calls.filter(([event])=>event==='ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE').at(-1)![1]; notify(); expect(listener).toHaveBeenCalledOnce();
    remove(); notify(); expect(listener).toHaveBeenCalledOnce();
    sdk.setActivity.mockRejectedValueOnce(new Error('scope denied'));
    await expect(platform.updatePresence!(null)).resolves.toBeUndefined();
  });
});
