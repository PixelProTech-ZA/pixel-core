# Pixel Core

A lightweight, **text-only** technology answer engine by **PixelProTech Solutions**.
Ask about Windows/Linux, hardware, Wi-Fi, software, programming basics, cybersecurity basics and backups.
Plain HTML/CSS/JS frontend on GitHub Pages → a small Cloudflare Worker → Gemini API through its OpenAI-compatible chat-completions endpoint.

> **Status: frontend published to GitHub Pages; backend not yet verified live.** The Cloudflare Worker still needs deployment and connection to the frontend. No real Gemini chat completion has been verified yet.

## Architecture

```
Browser (GitHub Pages, site/)  ──POST /api/chat──▶  Cloudflare Worker (worker/)  ──▶  Gemini API
  vanilla HTML/CSS/JS                                 validation · CORS allowlist        (key lives only
  safe text rendering                                 limits · link guard · prompt        here, as a secret)
```

```
pixel-core/
├── README.md
├── .gitignore
├── .github/workflows/pages.yml     publishes site/ to GitHub Pages
├── site/                           PUBLIC — contains no secrets
│   ├── index.html  style.css  app.js
│   ├── render.js                   safe renderer (no HTML parsing of answers)
│   └── config.js                   public Worker URL only
└── worker/
    ├── package.json  wrangler.toml  .dev.vars.example
    ├── src/
    │   ├── index.js                routes, validation, CORS, limits, error mapping
    │   ├── provider.js             the provider adapter for Gemini (swap providers here)
    │   ├── prompt.js               system prompt + official URL roots
    │   ├── knowledge.js            the verified PixelProTech facts (only company source)
    │   └── urlguard.js             removes links to unknown domains from answers
    └── test/                       automated tests (node --test)
```

Design follows the PixelProTech 2026 corporate profile: near-black `#07070a`, teal `#00d4aa` primary,
violet `#7b2fff` secondary, gold `#d8b96a` used sparingly (caution labels), monospace spaced-caps labels.

## Deploy

You need: a GitHub account, a free Cloudflare account, a Google AI Studio account with a Gemini API key, Node 20+.

### 1. Create the GitHub repository
Create a new repo (e.g. `pixel-core`) on GitHub, then from this folder:
```bash
git init && git add . && git commit -m "Pixel Core v1"
git branch -M main
git remote add origin https://github.com/<you>/pixel-core.git
git push -u origin main
```
Make sure `.dev.vars` / `.env` files are not committed (the `.gitignore` covers them).

### 2. Publish `site/` with GitHub Pages
Repo **Settings → Pages → Source: GitHub Actions**. The included workflow publishes only `site/` on every push
that changes it. Your site URL will be `https://<you>.github.io/pixel-core/`. Its **origin** (what the Worker must
allow) is `https://<you>.github.io` — no path, no trailing slash.

### 3–4. Install Wrangler and log in to Cloudflare
```bash
cd worker
npm install            # installs wrangler (the only dependency)
npx wrangler login
```

### 5. Add the Gemini key as an encrypted secret
Create a Gemini API key in Google AI Studio, then:
```bash
npx wrangler secret put GEMINI_API_KEY      # paste the key when prompted
```
Never put the key in a file, in `wrangler.toml`, or in `site/`.

### 6. Choose the model
Model availability changes. List what **your** account can use:
```bash
curl -s https://generativelanguage.googleapis.com/v1beta/openai/models -H "Authorization: Bearer $GEMINI_API_KEY"
```
Then set `GEMINI_MODEL` in `worker/wrangler.toml` to a chat model from that list. The default in the file
(`gemini-2.5-flash`) is a placeholder that I could **not** verify against your account.
Gemini API reference: https://ai.google.dev/gemini-api/docs/openai

### 7. Set the allowed origin
In `worker/wrangler.toml` set `ALLOWED_ORIGIN = "https://<you>.github.io"`
(comma-separate to add `http://localhost:8080` for local testing).

### 8. Deploy the Worker
```bash
npx wrangler deploy
```
Wrangler prints the Worker URL, e.g. `https://pixel-core-api.<subdomain>.workers.dev`.

### 9. Point the frontend at the Worker
Edit `site/config.js`:
```js
API_URL: 'https://pixel-core-api.<subdomain>.workers.dev/api/chat',
```
Commit and push; the Pages workflow republishes the site.

### 10. Test the live app
Run the **Live checklist** below.

### Before opening it to the public
CORS is **not** authentication — anyone can call the Worker directly. The Worker has an in-memory per-IP limit
and a concurrency cap, but those are per-isolate and are *not* enough on their own. In the Cloudflare dashboard
add a **Rate limiting rule** (Security → WAF → Rate limiting rules) for the Worker's `/api/chat` path, and keep
Gemini API quota and usage limits in mind. Also review the privacy text at the bottom of `site/index.html`.

## Run locally
```bash
cd worker
cp .dev.vars.example .dev.vars     # put your real key in .dev.vars (git-ignored)
npx wrangler dev                   # http://127.0.0.1:8787
# in another terminal:
cd ../site && python3 -m http.server 8080
```
Set `API_URL: 'http://127.0.0.1:8787/api/chat'` in `site/config.js` and open http://localhost:8080.

## Configuration (Worker)
| Name | Where | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | **secret** | — | Provider key |
| `ALLOWED_ORIGIN` | var | — | Comma-separated browser origins allowed to call `/api/chat` |
| `GEMINI_MODEL` | var | `gemini-2.5-flash` | Model id (never hard-coded elsewhere) |
| `MAX_TOKENS` | var | 700 | Max answer length |
| `TIMEOUT_MS` | var | 20000 | Provider timeout |
| `HISTORY_MESSAGES` | var | 8 | Conversation turns sent to the model |
| `RATE_LIMIT_PER_MIN` | var | 20 | Per-IP, in-memory (see above) |
| `DAILY_CAP` | var | 200 | Global chat requests per UTC day. Enforced only when the `USAGE` KV binding exists (see `wrangler.toml`). Set it below your Gemini quota |
| `USAGE` | KV binding | not bound | Optional. Holds the daily counter. Approximate, not exact accounting; fails open if KV errors |
| `ALLOW_NO_ORIGIN` | var | off | `true` allows requests with no `Origin` header (local curl testing only) |

## Topic links (for WhatsApp / Facebook posts)
`https://pixelprotech-za.github.io/pixel-core/?t=slow-startup` opens the app with that question already in the box.
The person still taps Send, so a link cannot fire a request on its own. Only keys listed in `TOPICS` in `site/config.js`
work; anything else in the URL (including `?q=`) is ignored. To add a topic, add one line to `TOPICS`, republish `site/`,
and bump `CACHE_NAME` in `site/sw.js` so installed copies refresh.

## How it behaves
- **Answers:** 🔍 Answer · 🛠️ Steps · 🔗 Useful URLs · ⚠️ Caution, under ~250 words, with exact commands where justified.
- **Not a search engine.** The provider cannot browse; the prompt forbids claiming otherwise. There is no retrieval layer yet.
  `provider.js` is isolated so a documentation-retrieval step can be added in `index.js` before the provider call.
- **Link guard:** links in answers to domains outside a documentation/vendor allowlist (`worker/src/urlguard.js`)
  are replaced with "[link removed: unverified source]". This blocks links to arbitrary sites but **cannot prove a deep
  link on an allowed domain exists** — the prompt asks the model to prefer official root pages.
- **PixelProTech facts** come only from `worker/src/knowledge.js` (taken from the 2026 corporate profile). No prices,
  guarantees or response times are included. Edit that file and redeploy to change what Pixel Core may say.
  Review the B-BBEE line before launch — it is repeated exactly as the profile states it.
- **Privacy/logging:** the Worker logs only error category and status, never questions or answers. Conversation history
  exists only in the browser tab. There are no accounts, analytics or storage.
- **Safe rendering:** answers are built with DOM text nodes only; HTML/script in an answer is shown as literal text.
- **Future sign-in (not implemented):** the frontend never trusts local state for identity. A later Supabase Auth layer
  should verify tokens **in the Worker** before calling the provider.

## Tests — what was actually run
Run on the build machine, Oct 2026.

| Suite | Result | Notes |
|---|---|---|
| `cd worker && npm test` — 34 unit tests (Node 22) | **34 / 34 passed** | The Gemini provider is **mocked**. Covers: answer returned; system prompt/model/key sent; history trimming; empty/whitespace/oversized/invalid messages; client `system` role rejected; invalid JSON; unsupported methods; wrong content type; unapproved/missing origin; preflight; missing and invalid key → safe errors with no leak; provider 429 → neutral message + Retry-After; timeout → 504; provider 500/network/malformed → safe 502; link guard; per-IP limiter; concurrency cap; `/health` leaks nothing; renderer escapes HTML and refuses `javascript:` links; no unsafe HTML APIs in site code; no key-like strings in `site/`. |
| Browser UI test — 52 checks, Chromium via Playwright, desktop 1280×800 and mobile 390×780 | **52 / 52 passed** | Server responses mocked. Covers: welcome, counter, empty send ignored, hostile answer rendered as text (no script runs), safe links, history carried, 429/503/offline/timeout messages with input restored and UI unlocked, over-limit blocked, clear chat, example chips, no horizontal overflow, no page errors, page works under its strict CSP. |
| `wrangler dev` smoke test | **Not run successfully** | The local Workers runtime is blocked by this system's GLIBC compatibility. Do not treat local runtime checks as passed. |

**Update, 17 Oct 2026:** `cd worker && npm test` now runs **42 / 42 passing** (Node, provider mocked). Added: 5 daily-cap tests (fake KV), 3 topic-link tests (fake DOM, no browser). The older "no secrets in site/" test was already failing before this change because `site/icons/` is a folder; it now scans recursively and skips PNGs. The browser (Playwright) suite above was **not re-run** for this update.

### Not run (be aware)
- **No real Gemini chat completion verified yet** — the API key was accepted by the model-list endpoint, but a real answer, model response, quota behaviour and latency remain unverified. Check these after deploying the Worker.
- **GitHub Pages is published.** The Cloudflare Worker has not yet been confirmed deployed and connected, so live chat is not yet verified.
- Cloudflare rate-limiting rules, Safari/Firefox, real phones and screen readers were not tested.
- The link guard and prompt reduce, but cannot eliminate, wrong or outdated answers.

### Live checklist (after deploying)
1. Open the Pages URL; ask "What is the difference between RAM and storage?" → a real answer arrives.
2. Ask a Windows question ("Windows 11 slow after startup") → numbered steps and a Microsoft link.
3. Ask a Linux question ("how do I check disk space on Ubuntu") → commands and an Ubuntu/Debian link.
4. `curl https://<worker>/health` → `{"status":"ok"}` only.
5. `curl -X POST https://<worker>/api/chat -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'` → 403.
6. View-source on the site and search for your key prefix → not present.
7. Ask a PixelProTech question ("Do you service Sandton?") → matches `knowledge.js`; ask for a price → it must decline to invent one.
8. Open on a phone → usable, no sideways scrolling.

## Known limitations
- Gemini API quota and model availability can change; the app shows a neutral message when the provider is unavailable or quota is exhausted.
- In-memory rate limiting is per Worker instance; use Cloudflare rules for real abuse control.
- No retrieval/search: answers come from the model's training and may be outdated.
- No accounts, saved chats, billing or analytics (by design for release 1).
