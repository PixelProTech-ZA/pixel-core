/* Pixel Core — safe answer renderer.
 *
 * Turns plain model text into DOM nodes using ONLY createElement /
 * createTextNode / setAttribute. It never parses HTML strings, so HTML or
 * script in an answer (or in a user's message echoed back) is shown as
 * literal text and can never execute.
 *
 * Supported: paragraphs, "-" / "1." lists, ``` code blocks, `inline code`,
 * **bold**, http(s) URLs (auto-linked), and the four answer labels
 * (Answer / Steps / Useful URLs / Caution).
 */
(function (root) {
  'use strict';

  var SECTION_RE = /^(\u{1F50D}|\u{1F6E0}|\u{1F517}|⚠)️?\s*(?:\*\*)?(Answer|Steps|Useful URLs|Caution)\s*:?(?:\*\*)?\s*:?\s*(.*)$/iu;
  var SECTION_CLASS = { answer: 'answer', steps: 'steps', 'useful urls': 'urls', caution: 'caution' };
  var INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>"'`]+)/g;
  var TRAIL_RE = /[.,;:!?)\]]+$/;
  var BULLET_RE = /^\s*[-*•]\s+(.*)$/;
  var NUMBER_RE = /^\s*\d+[.)]\s+(.*)$/;

  function appendInline(doc, parent, text) {
    var last = 0;
    var m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(doc.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        var code = doc.createElement('code');
        code.appendChild(doc.createTextNode(m[1].slice(1, -1)));
        parent.appendChild(code);
      } else if (m[2]) {
        var b = doc.createElement('strong');
        b.appendChild(doc.createTextNode(m[2].slice(2, -2)));
        parent.appendChild(b);
      } else {
        var raw = m[3];
        var trail = (raw.match(TRAIL_RE) || [''])[0];
        var clean = trail ? raw.slice(0, raw.length - trail.length) : raw;
        var href = null;
        try {
          var u = new URL(clean);
          if (u.protocol === 'https:' || u.protocol === 'http:') href = u.href;
        } catch (e) { /* not a valid URL: leave as text */ }
        if (href) {
          var a = doc.createElement('a');
          a.setAttribute('href', href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.appendChild(doc.createTextNode(clean));
          parent.appendChild(a);
          if (trail) parent.appendChild(doc.createTextNode(trail));
        } else {
          parent.appendChild(doc.createTextNode(raw));
        }
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(doc.createTextNode(text.slice(last)));
  }

  function renderInto(container, text, doc) {
    doc = doc || root.document;
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var parent = container;
    var para = null; // current <p>
    var list = null; // current <ul>/<ol>
    var listType = null;
    var inCode = false;
    var codeEl = null;
    var codeBuf = [];

    function endPara() { para = null; }
    function endList() { list = null; listType = null; }

    function addPara(line) {
      if (!para) {
        para = doc.createElement('p');
        parent.appendChild(para);
      } else {
        para.appendChild(doc.createElement('br'));
      }
      appendInline(doc, para, line);
    }

    function addItem(type, line) {
      endPara();
      if (!list || listType !== type) {
        list = doc.createElement(type);
        listType = type;
        parent.appendChild(list);
      }
      var li = doc.createElement('li');
      appendInline(doc, li, line);
      list.appendChild(li);
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (/^\s*```/.test(line)) {
        if (!inCode) {
          endPara(); endList();
          inCode = true;
          codeBuf = [];
          var pre = doc.createElement('pre');
          codeEl = doc.createElement('code');
          pre.appendChild(codeEl);
          parent.appendChild(pre);
        } else {
          codeEl.appendChild(doc.createTextNode(codeBuf.join('\n')));
          inCode = false;
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      if (!line.trim()) { endPara(); endList(); continue; }

      var s = SECTION_RE.exec(line.trim());
      if (s) {
        endPara(); endList();
        var key = s[2].toLowerCase();
        var sect = doc.createElement('div');
        sect.className = 'sect sect-' + SECTION_CLASS[key];
        var label = doc.createElement('span');
        label.className = 'sect-label';
        label.appendChild(doc.createTextNode(s[1] + '️ ' + s[2]));
        sect.appendChild(label);
        container.appendChild(sect);
        parent = sect;
        if (s[3]) addPara(s[3]);
        continue;
      }

      var bm = BULLET_RE.exec(line);
      if (bm) { addItem('ul', bm[1]); continue; }
      var nm = NUMBER_RE.exec(line);
      if (nm) { addItem('ol', nm[1]); continue; }

      endList();
      addPara(line.trim());
    }

    // Unterminated code fence (e.g. cut off by the token limit): still show it.
    if (inCode && codeEl) codeEl.appendChild(doc.createTextNode(codeBuf.join('\n')));
    return container;
  }

  var api = { renderInto: renderInto };
  root.PixelRender = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
