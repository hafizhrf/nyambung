export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, method: body !== undefined ? 'POST' : 'GET', body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Koneksi sedang terganggu. Coba lagi, ya.');
  return data as T;
}
