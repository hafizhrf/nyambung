/** Public Cloudflare entry point; gameplay and SQLite stay on the origin server. */
export default {
  async fetch(request, env) {
    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = env.ORIGIN_HOST;
    upstream.port = '';

    const proxyRequest = new Request(upstream, request);
    const headers = proxyRequest.headers;
    headers.delete('host');
    headers.set('X-Forwarded-Host', new URL(request.url).host);
    headers.set('X-Forwarded-Proto', 'https');

    try {
      return await fetch(new Request(proxyRequest, { redirect: 'manual' }), {
        cf: { cacheTtl: 0, cacheEverything: false },
      });
    } catch {
      return new Response('Nyambung sedang tidak bisa dihubungi. Coba lagi sebentar.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  },
};
