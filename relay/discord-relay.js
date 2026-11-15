// Cloudflare Worker: forwards the Dota Build Daily API's Discord requests to discord.com.
// Discord sometimes blocks Render's shared free IPs; Cloudflare's aren't affected.
// Only requests carrying the shared key (Worker secret RELAY_KEY) are forwarded, and only
// to Discord's API, so it can't be used as an open proxy.
//
// It also keeps the free Render API awake: a Cron Trigger (every 10 minutes, set in the
// Worker's Settings → Triggers) pings /health, since a sleeping API takes ~50 s to wake.
const API_HEALTH = 'https://dota-build-daily-api.onrender.com/health';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch(API_HEALTH, { headers: { 'user-agent': 'dota-discord-relay keep-awake' } }));
  },

  async fetch(request, env) {
    const key = request.headers.get('x-relay-key') || '';
    if (!env.RELAY_KEY || !(await same(key, env.RELAY_KEY))) return new Response('forbidden', { status: 403 });
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/v10/')) return new Response('not found', { status: 404 });

    const headers = new Headers();
    for (const h of ['authorization', 'content-type', 'user-agent', 'x-audit-log-reason']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    return fetch('https://discord.com' + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    });
  },
};

// Constant-time comparison of the relay key.
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
