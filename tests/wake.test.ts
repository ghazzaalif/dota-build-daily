// The API sleeps on Render's free plan; sign-in and API calls must ride out the wake-up
// instead of failing on Render's "Application loading" page.
import { apiFetch } from '../src/discord/session';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (status = 200) => new Response('<html>APPLICATION LOADING</html>', { status, headers: { 'content-type': 'text/html' } });

describe('apiFetch (waiting for a sleeping server)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const noSleep = () => Promise.resolve();

  it("retries through Render's wake-up page, 503s and network errors, then returns the answer", async () => {
    const replies: (() => Response)[] = [() => html(), () => html(503), () => { throw new TypeError('Failed to fetch'); }, () => json({ access_token: 't' })];
    const f = vi.fn(async () => replies.shift()!());
    globalThis.fetch = f as unknown as typeof fetch;
    const onWaking = vi.fn();
    const res = await apiFetch('https://api/token', { method: 'POST' }, { onWaking, sleep: noSleep });
    expect(await res.json()).toEqual({ access_token: 't' });
    expect(f).toHaveBeenCalledTimes(4);
    expect(onWaking).toHaveBeenCalledTimes(3);
  });

  it('passes real API errors straight through (JSON 401 is not "waking")', async () => {
    globalThis.fetch = vi.fn(async () => json({ error: 'bad code' }, 401)) as unknown as typeof fetch;
    const res = await apiFetch('https://api/token', {}, { sleep: noSleep });
    expect(res.status).toBe(401);
  });

  it('gives up after the timeout', async () => {
    globalThis.fetch = vi.fn(async () => html(502)) as unknown as typeof fetch;
    const res = await apiFetch('https://api/x', {}, { timeoutMs: 0, sleep: noSleep });
    expect(res.status).toBe(502);
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(apiFetch('https://api/x', {}, { timeoutMs: 0, sleep: noSleep })).rejects.toThrow('Failed to fetch');
  });
});
