import { createClient, createPkce, OpenRouterError } from './openrouter';

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('OpenRouter client', () => {
  it('posts image requests in the unified format', async () => {
    const { f, calls } = mockFetch(200, { data: [{ b64_json: 'AAA', media_type: 'image/png' }], usage: { cost: 0.006 } });
    const c = createClient({ apiKey: 'sk-test', fetch: f });
    const res = await c.images({ model: 'm', prompt: 'p', n: 1, background: 'transparent', input_references: ['data:x'] });
    expect(res).toEqual({ images: ['data:image/png;base64,AAA'], cost: 0.006 });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/images');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input_references).toEqual([{ type: 'image_url', image_url: { url: 'data:x' } }]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('asks chat for JSON and reports cost', async () => {
    const { f, calls } = mockFetch(200, { choices: [{ message: { content: '{"a":1}' } }], usage: { cost: 0.0002 } });
    const c = createClient({ apiKey: 'k', fetch: f });
    expect(await c.chat([{ role: 'user', content: 'hi' }], { model: 'deepseek/deepseek-v4.1-flash', json: true })).toEqual({ text: '{"a":1}', cost: 0.0002 });
    expect(JSON.parse(String(calls[0].init.body)).response_format).toEqual({ type: 'json_object' });
  });

  it('turns HTTP errors into friendly messages', async () => {
    const { f } = mockFetch(402, { error: { message: 'Insufficient credits' } });
    const c = createClient({ apiKey: 'k', fetch: f });
    await expect(c.images({ model: 'm', prompt: 'p' })).rejects.toThrow(/balance is too low/);
    await expect(c.images({ model: 'm', prompt: 'p' })).rejects.toBeInstanceOf(OpenRouterError);
  });

  it('fails clearly when no image comes back', async () => {
    const { f } = mockFetch(200, { data: [] });
    await expect(createClient({ apiKey: 'k', fetch: f }).images({ model: 'm', prompt: 'p' })).rejects.toThrow(/no images/);
  });
});

describe('PKCE', () => {
  it('creates a url-safe S256 challenge', async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
