// Frontend renderer tests, run against a minimal fake DOM so we can prove the
// renderer only builds elements/text nodes (never parses HTML).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderInto } = require('../../site/render.js');

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ''; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
}
const doc = { createElement: (t) => new El(t), createTextNode: (s) => ({ text: String(s) }) };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function ser(n) {
  if (n.text !== undefined) return esc(n.text);
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');
  return `<${n.tag}${n.className ? ` class="${n.className}"` : ''}${a}>${n.children.map(ser).join('')}</${n.tag}>`;
}
function tags(n, out = new Set()) {
  if (n.tag) { out.add(n.tag); n.children.forEach((c) => tags(c, out)); }
  return out;
}
function render(text) { const root = new El('div'); renderInto(root, text, doc); return root; }

test('HTML and script in text are shown literally, never created as elements', () => {
  const root = render('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>hi</b>');
  const t = tags(root);
  for (const bad of ['script', 'img', 'b', 'iframe', 'style']) assert.ok(!t.has(bad), `element ${bad} created`);
  const html = ser(root);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), html);
});

test('javascript: and data: URLs and markdown links are never turned into links', () => {
  const root = render('click javascript:alert(1) or [x](javascript:alert(1)) or data:text/html,<h1>x</h1>');
  assert.ok(!tags(root).has('a'));
});

test('http(s) URLs become safe links; trailing punctuation stays outside', () => {
  const root = render('See https://support.microsoft.com/windows.');
  const html = ser(root);
  assert.match(html, /<a href="https:\/\/support\.microsoft\.com\/windows" target="_blank" rel="noopener noreferrer">https:\/\/support\.microsoft\.com\/windows<\/a>\./);
});

test('URLs inside inline code or code blocks are not linked', () => {
  assert.ok(!tags(render('run `curl https://example.com`')).has('a'));
  assert.ok(!tags(render('```\ncurl https://example.com\n```')).has('a'));
});

test('code fences keep HTML as text; unterminated fences still render', () => {
  const html = ser(render('```\n<div onclick="x()">\n```'));
  assert.ok(html.includes('&lt;div onclick="x()"&gt;'));
  assert.ok(ser(render('```\nsudo apt update')).includes('sudo apt update'));
});

test('lists, numbered steps, bold and inline code render as structure', () => {
  const html = ser(render('Intro\n\n- one\n- two\n\n1. first\n2. second `df -h` **now**'));
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second <code>df -h<\/code> <strong>now<\/strong><\/li><\/ol>/);
});

test('answer labels become labelled sections', () => {
  const html = ser(render('🔍 **Answer:** Likely a startup app.\n\n🛠️ Steps:\n1. Open Task Manager\n\n⚠️ Caution: Back up first.'));
  assert.match(html, /sect sect-answer/);
  assert.match(html, /sect sect-steps/);
  assert.match(html, /sect sect-caution/);
  assert.match(html, /Likely a startup app\./);
  assert.match(html, /<ol><li>Open Task Manager<\/li><\/ol>/);
});

test('renderer source never uses unsafe HTML insertion', async () => {
  const fs = await import('node:fs');
  for (const f of ['../../site/render.js', '../../site/app.js']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(src), f);
  }
});

test('no secrets or provider keys in public site files', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../../site/', import.meta.url);
  const textExt = /\.(html|css|js|json|webmanifest|txt|md|svg)$/i;
  const walk = (rel) => {
    for (const ent of fs.readdirSync(new URL(rel, dir), { withFileTypes: true })) {
      const p = rel + ent.name;
      if (ent.isDirectory()) { walk(p + '/'); continue; }
      if (!textExt.test(ent.name)) continue; // skip binary files such as PNG icons
      const src = fs.readFileSync(new URL(p, dir), 'utf8');
      assert.ok(!/gsk_[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{20,}|GEMINI_API_KEY|Bearer\s+[A-Za-z0-9]/.test(src), `secret-like text in ${p}`);
    }
  };
  walk('');
});
