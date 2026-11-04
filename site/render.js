/* Pixel Core — safe answer renderer.
 *
 * Turns plain model text into DOM nodes using ONLY createElement /
 * createTextNode / setAttribute. It never parses HTML strings, so HTML or
 * script in an answer (or in a user's message echoed back) is shown as
 * literal text and can never execute.
 *
 * Supported: paragraphs, "-" / "1." lists, ``` code blocks, `inline code`,
 * **bold**, [title](https://url) links, http(s) URLs (auto-linked), and the
 * four answer labels (Answer / Steps / Useful URLs / Caution).
 *
 * Text and links only: no image element is ever created. An image-style
 * link ![alt](url) is shown as an ordinary text link.
 * The Worker's link guard replaces unverified URLs with a short note; that
 * note is never shown to the person (see REMOVED below).
 */
(function (root) {
  'use strict';

  var SECTION_RE = /^(\u{1F50D}|\u{1F6E0}|\u{1F517}|⚠)️?\s*(?:\*\*)?(Answer|Steps|Useful URLs|Caution)\s*:?(?:\*\*)?\s*:?\s*(.*)$/iu;
  var SECTION_CLASS = { answer: 'answer', steps: 'steps', 'useful urls': 'urls', caution: 'caution' };
  var REMOVED = '[link removed: unverified source]';
  var REMOVED_RE = /\[link removed: unverified source\]/g;
  // groups: 1 code | 2 bold | 3 [title](url) -> 4 title, 5 url | 6 [title]([link removed]) -> 7 title
  //         | 8 bare [link removed] note | 9 bare URL
  var INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(!?\[([^\]\n]+)\]\((https?:\/\/[^\s)<>"'`]+)\))|(!?\[([^\]\n]+)\]\(\[link removed: unverified source\]\))|(\[link removed: unverified source\])|(https?:\/\/[^\s<>"'`]+)/g;
  var TRAIL_RE = /[.,;:!?)\]]+$/;
  var BULLET_RE = /^\s*[-*•]\s+(.*)$/;
  var NUMBER_RE = /^\s*\d+[.)]\s+(.*)$/;

  function safeHref(u) {
    try {
      var p = new URL(u);
      if (p.protocol === 'https:' || p.protocol === 'http:') return p.href;
    } catch (e) { /* not a valid URL */ }
    return null;
  }

  function addLink(doc, parent, href, label) {
    var a = doc.createElement('a');
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.appendChild(doc.createTextNode(label));
    parent.appendChild(a);
  }

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
      } else if (m[3]) {
        // [title](https://url): a clean clickable title (never an image)
        var h = safeHref(m[5]);
        if (h) addLink(doc, parent, h, m[4]);
        else parent.appendChild(doc.createTextNode(m[4]));
      } else if (m[6]) {
        // [title]([link removed]): keep the words, drop the broken brackets
        parent.appendChild(doc.createTextNode(m[7]));
      } else if (m[8]) {
        // bare removal note: show nothing
      } else {
        var raw = m[9];
        var trail = (raw.match(TRAIL_RE) || [''])[0];
        var clean = trail ? raw.slice(0, raw.length - trail.length) : raw;
        var href = safeHref(clean);
        if (href) {
          addLink(doc, parent, href, clean);
          if (trail) parent.appendChild(doc.createTextNode(trail));
        } else {
          parent.appendChild(doc.createTextNode(raw));
        }
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(doc.createTextNode(text.slice(last)));
  }

  // A line that only existed to carry a link the guard removed. Nothing useful
  // is left to show, so it is dropped instead of rendering an empty bullet.
  function isDeadLine(line, inUrls) {
    if (line.indexOf(REMOVED) === -1) return false;
    if (!line.replace(REMOVED_RE, '').replace(/[\s\-*•.,;:()\[\]]|\d+[.)]/g, '')) return true;
    return inUrls && line.indexOf('http') === -1; // a Useful URLs entry with no live link left
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
    var sectEl = null;   // current answer section
    var sectKey = null;
    var sectItems = 0;   // lines actually rendered inside it

    // A Useful URLs block whose every link was removed would be a lonely label.
    function closeSect() {
      if (sectEl && sectKey === 'useful urls' && sectItems === 0 && sectEl.parentNode === container) {
        container.removeChild(sectEl);
      }
      sectEl = null; sectKey = null; sectItems = 0;
    }

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
      sectItems++;
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
      sectItems++;
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
        closeSect();
        var key = s[2].toLowerCase();
        var sect = doc.createElement('div');
        sect.className = 'sect sect-' + SECTION_CLASS[key];
        sectEl = sect; sectKey = key; sectItems = 0;
        var label = doc.createElement('span');
        label.className = 'sect-label';
        label.appendChild(doc.createTextNode(s[1] + '️ ' + s[2]));
        sect.appendChild(label);
        container.appendChild(sect);
        parent = sect;
        if (s[3] && !isDeadLine(s[3], key === 'useful urls')) addPara(s[3]);
        continue;
      }

      if (isDeadLine(line, sectKey === 'useful urls')) { endPara(); continue; }

      var bm = BULLET_RE.exec(line);
      if (bm) { addItem('ul', bm[1]); continue; }
      var nm = NUMBER_RE.exec(line);
      if (nm) { addItem('ol', nm[1]); continue; }

      endList();
      addPara(line.trim());
    }

    // Unterminated code fence (e.g. cut off by the token limit): still show it.
    if (inCode && codeEl) codeEl.appendChild(doc.createTextNode(codeBuf.join('\n')));
    closeSect();
    return container;
  }

  var api = { renderInto: renderInto };
  root.PixelRender = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
