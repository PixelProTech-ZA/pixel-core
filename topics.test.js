// Topic links (?t=key): loads app.js against a tiny fake DOM and checks that a
// link only ever PREFILLS the question box, never sends, and ignores bad input.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const site = new URL('../../site/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, site), 'utf8');

function el() {
  const e = {
    children: [], value: '', textContent: '', className: '', hidden: false, style: {}, disabled: false,
    scrollHeight: 20, scrollTop: 0, attrs: {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {}, focus() {}, remove() {},
    querySelector() { return el(); },
    closest() { return null; },
  };
  return e;
}

function boot(search, topics) {
  const ids = {};
  const document = {
    getElementById(id) { return (ids[id] = ids[id] || el()); },
    createElement() { return el(); },
    createTextNode(t) { return { textContent: t }; },
  };
  const messages = [];
  const fetchCalls = [];
  const win = {
    location: { search },
    addEventListener() {},
    innerHeight: 800,
    PIXEL_CORE_CONFIG: { API_URL: 'https://api.example.com/api/chat', MAX_CHARS: 1000, TOPICS: topics },
    PixelRender: { renderInto(body, text) { messages.push(text); } },
  };
  const ctx = vm.createContext({
    window: win, document, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    navigator: { onLine: true },
    fetch: (...a) => { fetchCalls.push(a); return new Promise(() => {}); },
  });
  vm.runInContext(read('app.js'), ctx);
  return { input: ids.input, messages, fetchCalls };
}

const TOPICS = { 'slow-startup': 'My laptop is slow after startup. What should I check?' };

test('?t=known-key prefills the box and does NOT send a request', () => {
  const { input, messages, fetchCalls } = boot('?t=slow-startup&src=wa', TOPICS);
  assert.equal(input.value, TOPICS['slow-startup']);
  assert.ok(messages.some((m) => /Tap Send/.test(m)));
  assert.equal(fetchCalls.filter((c) => /api\/chat/.test(c[0])).length, 0);
});

test('unknown, missing and prototype keys are ignored', () => {
  for (const s of ['?t=nope', '', '?t=', '?t=__proto__', '?t=constructor', '?q=hello', '?t=<script>']) {
    const { input } = boot(s, TOPICS);
    assert.equal(input.value, '', `prefilled for ${JSON.stringify(s)}`);
  }
});

test('every topic in the real config.js is a non-empty question within the length limit', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read('config.js'), ctx);
  const topics = ctx.window.PIXEL_CORE_CONFIG.TOPICS;
  const keys = Object.keys(topics);
  assert.ok(keys.length >= 5);
  for (const k of keys) {
    assert.match(k, /^[a-z0-9-]{3,30}$/, k);
    assert.ok(topics[k].trim().length > 10 && topics[k].length <= 1000, k);
  }
});
