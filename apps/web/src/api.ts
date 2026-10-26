let token: string | undefined;
let refreshSession: (() => Promise<void>) | undefined;
export function setDiscordSession(value: string, refresh: () => Promise<void>) { token = value; refreshSession = refresh; }
export function apiBase() { return location.pathname.startsWith('/.proxy/') ? '/.proxy/api' : '/api'; }
export async function api<T>(path: string, body?: unknown, retried = false): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { credentials: token ? 'omit' : 'same-origin', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, method: body !== undefined ? 'POST' : 'GET', body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (response.status === 401 && token && refreshSession && !retried && !path.startsWith('/discord/auth')) {
    await refreshSession(); return api<T>(path, body, true);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Koneksi sedang terganggu. Coba lagi, ya.');
  return data as T;
}
export async function uploadAvatar(file:File|null):Promise<import('@nyambung/shared').GuestProfile>{
 const response=await fetch(`${apiBase()}/mabar/avatar`,{method:'POST',credentials:'same-origin',headers:token?{Authorization:`Bearer ${token}`}:{},body:file??new Uint8Array()});
 const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
