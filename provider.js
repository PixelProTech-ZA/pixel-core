// AI provider adapter. Everything Gemini-specific lives in this file.
// To switch provider, implement the same `complete()` contract here (any
// OpenAI-compatible chat-completions API works by changing BASE_URL/key).
//
// complete() resolves to a string (the assistant text) or throws a
// ProviderError with kind: 'auth' | 'rate' | 'upstream' | 'timeout' | 'bad_response'.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export class ProviderError extends Error {
  constructor(kind, status, retryAfter) {
    super(kind);
    this.kind = kind;
    this.status = status || 0;
    this.retryAfter = retryAfter || null;
  }
}

export async function complete({ apiKey, model, messages, maxTokens, temperature, timeoutMs }) {
  if (!apiKey) throw new ProviderError('auth', 0);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new ProviderError('timeout', 0);
    throw new ProviderError('upstream', 0);
  }

  try {
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', res.status);
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      throw new ProviderError('rate', 429, Number.isFinite(ra) ? Math.min(ra, 300) : null);
    }
    if (!res.ok) throw new ProviderError('upstream', res.status);

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new ProviderError('bad_response', res.status);
    }
    const text =
      data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError('bad_response', res.status);
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
