// Pixel Core — Cloudflare Worker (backend)
//   POST /api/chat   chat completion via the configured provider
//   GET  /health     liveness only; reveals no secrets or configuration
//
// Secrets (never in the repo):   GEMINI_API_KEY   (wrangler secret put GEMINI_API_KEY)
// Plain vars (wrangler.toml):    ALLOWED_ORIGIN, GEMINI_MODEL, and optional limits below.
// Optional KV binding:           USAGE  (enables the global DAILY_CAP; see wrangler.toml)
//
// NOTE: CORS only controls which *browser pages* may read responses. It is
// not authentication. Anyone can still call this endpoint directly, so add a
// Cloudflare rate-limiting rule before a public launch (see README).

import { SYSTEM_PROMPT } from './prompt.js';
import { complete, ProviderError } from './provider.js';
import { guardUrls } from './urlguard.js';

const DEFAULTS = {
  MAX_TOKENS: 700,
  TIMEOUT_MS: 20000,
  HISTORY_MESSAGES: 8,
  MAX_INPUT_CHARS: 1500, // per user message
  MAX_ASSISTANT_CHARS: 4000, // per prior assistant message
  MAX_TOTAL_CHARS: 12000,
  MAX_MESSAGES_ACCEPTED: 20,
  MAX_BODY_BYTES: 32768,
  RATE_LIMIT_PER_MIN: 20,
  DAILY_CAP: 200, // total chat requests per UTC day, only enforced when the USAGE KV binding exists
  MAX_CONCURRENT: 8,
  TEMPERATURE: 0.3,
};

function num(env, key) {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS[key];
}

// ---- in-memory protections (per Worker isolate; NOT a global limiter) -----
const hits = new Map(); // ip -> [timestamps]
let inFlight = 0;

function rateLimited(ip, limit) {
  const now = Date.now();
  const windowStart = now - 60000;
  const arr = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (arr.length >= limit) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => t > windowStart)) hits.delete(k);
  }
  return false;
}

// Global daily cap, stored in Workers KV (binding name: USAGE). This protects the
// provider's free quota when a post goes well. It is a cost guard, not exact
// accounting: KV is eventually consistent and read-then-write is not atomic, so
// the real count can overshoot slightly. One KV write per chat request.
// If USAGE is not bound, or KV errors, the cap is skipped (fail open) so a KV
// problem never takes the app down.
async function dailyCapReached(env) {
  if (!env.USAGE || typeof env.USAGE.get !== 'function') return null;
  const now = new Date();
  const key = 'chat:' + now.toISOString().slice(0, 10);
  const cap = num(env, 'DAILY_CAP');
  try {
    const used = parseInt((await env.USAGE.get(key)) || '0', 10) || 0;
    if (used >= cap) {
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
    }
    await env.USAGE.put(key, String(used + 1), { expirationTtl: 172800 });
  } catch (_) {
    console.warn('usage_kv_error');
  }
  return null;
}

// ---- helpers --------------------------------------------------------------
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

function err(status, code, message, extra = {}) {
  return json(status, { error: { code, message } }, extra);
}

function validate(body, env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object.';
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return 'Send at least one message.';
  if (msgs.length > num(env, 'MAX_MESSAGES_ACCEPTED')) return 'Too many messages in one request.';

  let total = 0;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') return 'Invalid message.';
    if (m.role !== 'user' && m.role !== 'assistant') return 'Invalid message role.';
    if (typeof m.content !== 'string') return 'Message content must be text.';
    const len = m.content.length;
    const max = m.role === 'user' ? num(env, 'MAX_INPUT_CHARS') : num(env, 'MAX_ASSISTANT_CHARS');
    if (len > max) return `A message is too long (limit ${max} characters).`;
    total += len;
  }
  if (total > num(env, 'MAX_TOTAL_CHARS')) return 'The conversation is too long. Clear the chat and try again.';

  const last = msgs[msgs.length - 1];
  if (last.role !== 'user') return 'The last message must come from the user.';
  if (!last.content.trim()) return 'Please type a question.';
  return null;
}

// ---- handlers -------------------------------------------------------------
async function handleChat(request, env) {
  const origins = allowedOrigins(env);
  const origin = request.headers.get('Origin');
  const allowNoOrigin = env.ALLOW_NO_ORIGIN === 'true';

  let cors = {};
  if (origin) {
    if (!origins.includes(origin.replace(/\/+$/, ''))) {
      return err(403, 'origin_not_allowed', 'This origin is not allowed to use Pixel Core.');
    }
    cors = corsHeaders(origin);
  } else if (!allowNoOrigin) {
    return err(403, 'origin_not_allowed', 'This origin is not allowed to use Pixel Core.');
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') {
    return err(405, 'method_not_allowed', 'Use POST.', { ...cors, Allow: 'POST, OPTIONS' });
  }

  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!ct.startsWith('application/json')) {
    return err(415, 'unsupported_content_type', 'Content-Type must be application/json.', cors);
  }

  const maxBody = num(env, 'MAX_BODY_BYTES');
  const declared = parseInt(request.headers.get('Content-Length') || '', 10);
  if (Number.isFinite(declared) && declared > maxBody) {
    return err(413, 'payload_too_large', 'Request is too large.', cors);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimited(ip, num(env, 'RATE_LIMIT_PER_MIN'))) {
    return err(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.', {
      ...cors,
      'Retry-After': '60',
    });
  }

  let raw;
  try {
    raw = await request.text();
  } catch (_) {
    return err(400, 'bad_request', 'Could not read the request.', cors);
  }
  if (new TextEncoder().encode(raw).length > maxBody) {
    return err(413, 'payload_too_large', 'Request is too large.', cors);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return err(400, 'invalid_json', 'Request body is not valid JSON.', cors);
  }

  const problem = validate(body, env);
  if (problem) return err(400, 'invalid_request', problem, cors);

  const capRetry = await dailyCapReached(env);
  if (capRetry) {
    return err(429, 'daily_cap_reached',
      "Pixel Core has reached today's free limit. It resets tomorrow, so please try again then.",
      { ...cors, 'Retry-After': String(capRetry) });
  }

  if (inFlight >= num(env, 'MAX_CONCURRENT')) {
    return err(503, 'busy', 'Pixel Core is busy. Please try again in a moment.', { ...cors, 'Retry-After': '5' });
  }

  const history = body.messages
    .slice(-num(env, 'HISTORY_MESSAGES'))
    .map((m) => ({ role: m.role, content: m.content }));
  // The model sees a system prompt we control; clients can never supply one.
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  inFlight++;
  try {
    const text = await complete({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      messages,
      maxTokens: num(env, 'MAX_TOKENS'),
      temperature: DEFAULTS.TEMPERATURE,
      timeoutMs: num(env, 'TIMEOUT_MS'),
    });
    return json(200, { reply: guardUrls(text) }, cors);
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : 'upstream';
    // Log only the category and status — never prompts, replies or keys.
    console.warn('provider_error', kind, e && e.status ? e.status : 0);
    switch (kind) {
      case 'rate':
        return err(429, 'provider_rate_limited',
          'Pixel Core has reached its free usage limit for now. Please try again shortly.',
          { ...cors, 'Retry-After': String(e.retryAfter || 30) });
      case 'timeout':
        return err(504, 'provider_timeout', 'The answer took too long. Please try again.', cors);
      case 'auth':
        return err(503, 'service_unavailable', 'Pixel Core is temporarily unavailable.', cors);
      case 'bad_response':
        return err(502, 'provider_bad_response', 'Pixel Core got an unusable answer. Please try again.', cors);
      default:
        return err(502, 'provider_unavailable', 'The answer service is unavailable right now. Please try again later.', cors);
    }
  } finally {
    inFlight--;
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return err(405, 'method_not_allowed', 'Use GET.', { Allow: 'GET, HEAD' });
        }
        return json(200, { status: 'ok' });
      }
      if (url.pathname === '/api/chat') return await handleChat(request, env);
      return err(404, 'not_found', 'Not found.');
    } catch (_) {
      return err(500, 'internal_error', 'Something went wrong. Please try again.');
    }
  },
};
