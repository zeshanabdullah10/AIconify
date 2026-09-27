export const OPENROUTER_API = 'https://openrouter.ai/api/v1';
const KEY_STORAGE = 'aiconify.openrouter.key';
const VERIFIER_STORAGE = 'aiconify.oauth.verifier';

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatContent;
}

export interface ChatOptions {
  model: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  n?: number;
  quality?: string;
  background?: 'auto' | 'transparent' | 'opaque';
  aspect_ratio?: string;
  output_format?: 'png' | 'webp' | 'jpeg';
  input_references?: string[];
  signal?: AbortSignal;
}

export interface ImageResult {
  images: string[];
  cost: number | null;
}

export interface Client {
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<{ text: string; cost: number | null }>;
  images(req: ImageRequest): Promise<ImageResult>;
  keyInfo(): Promise<{ label?: string; limitRemaining?: number | null; usage?: number }>;
}

export interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  referer?: string;
}

async function readError(res: Response): Promise<OpenRouterError> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    message = body?.error?.message ?? body?.message ?? message;
  } catch {
    /* body wasn't JSON */
  }
  if (res.status === 401) message = 'Your OpenRouter key was rejected. Reconnect in Settings.';
  if (res.status === 402) message = 'Your OpenRouter balance is too low for this request. Add credits and try again.';
  if (res.status === 429) message = 'OpenRouter is rate limiting requests. Wait a moment and try again.';
  return new OpenRouterError(message, res.status);
}

export function createClient({ apiKey, fetch: f = globalThis.fetch.bind(globalThis), referer }: ClientOptions): Client {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': 'AIconify',
    ...(referer ? { 'HTTP-Referer': referer } : {}),
  };

  return {
    async chat(messages, opts) {
      const res = await f(`${OPENROUTER_API}/chat/completions`, {
        method: 'POST',
        headers,
        signal: opts.signal,
        body: JSON.stringify({
          model: opts.model,
          messages,
          max_tokens: opts.maxTokens ?? 1500,
          temperature: opts.temperature ?? 0.4,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          usage: { include: true },
        }),
      });
      if (!res.ok) throw await readError(res);
      const body = await res.json();
      const text: string = body?.choices?.[0]?.message?.content ?? '';
      if (!text) throw new OpenRouterError('The text model returned an empty answer.', 502);
      return { text, cost: typeof body?.usage?.cost === 'number' ? body.usage.cost : null };
    },

    async images({ signal, input_references, ...req }) {
      const res = await f(`${OPENROUTER_API}/images`, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          ...req,
          ...(input_references?.length
            ? { input_references: input_references.map((url) => ({ type: 'image_url', image_url: { url } })) }
            : {}),
        }),
      });
      if (!res.ok) throw await readError(res);
      const body = await res.json();
      const images: string[] = (body?.data ?? [])
        .filter((d: { b64_json?: string }) => d?.b64_json)
        .map((d: { b64_json: string; media_type?: string }) => `data:${d.media_type ?? 'image/png'};base64,${d.b64_json}`);
      if (images.length === 0) throw new OpenRouterError('The image model returned no images. Try again or pick another model.', 502);
      return { images, cost: typeof body?.usage?.cost === 'number' ? body.usage.cost : null };
    },

    async keyInfo() {
      const res = await f(`${OPENROUTER_API}/key`, { headers });
      if (!res.ok) throw await readError(res);
      const body = await res.json();
      return { label: body?.data?.label, limitRemaining: body?.data?.limit_remaining ?? null, usage: body?.data?.usage };
    },
  };
}

/* ---------- key storage ---------- */

export function loadKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function saveKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage blocked: key lives for this tab only */
  }
}

/* ---------- OAuth PKCE ("Connect OpenRouter") ---------- */

function base64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export async function authUrl(callbackUrl: string): Promise<string> {
  const { verifier, challenge } = await createPkce();
  sessionStorage.setItem(VERIFIER_STORAGE, verifier);
  const q = new URLSearchParams({ callback_url: callbackUrl, code_challenge: challenge, code_challenge_method: 'S256' });
  return `https://openrouter.ai/auth?${q}`;
}

export async function exchangeCode(code: string, f: typeof fetch = fetch): Promise<string> {
  // Only finish a sign-in this tab started. Without the verifier, a crafted ?code= link could log the
  // user into someone else's key (and send their logo and prompts to that account).
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE);
  sessionStorage.removeItem(VERIFIER_STORAGE);
  if (!verifier) throw new OpenRouterError('This sign-in link was not started from this tab. Click Connect to try again.', 400);
  const res = await f(`${OPENROUTER_API}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!res.ok) throw await readError(res);
  const body = await res.json();
  if (!body?.key) throw new OpenRouterError('OpenRouter did not return a key.', 502);
  return body.key as string;
}
