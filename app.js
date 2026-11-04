/* Pixel Core — frontend logic (vanilla JS, no dependencies).
 * Conversation history exists only in memory for this tab. */
(function () {
  'use strict';

  var cfg = window.PIXEL_CORE_CONFIG || {};
  var MAX_CHARS = cfg.MAX_CHARS || 1000;
  var HISTORY = cfg.HISTORY_MESSAGES || 8;
  var TIMEOUT = cfg.REQUEST_TIMEOUT_MS || 30000;
  var MIN_GAP = (cfg.MIN_SECONDS_BETWEEN_SENDS || 1.5) * 1000;

  var chat = document.getElementById('chat');
  var form = document.getElementById('form');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('send');
  var clearBtn = document.getElementById('clear');
  var counter = document.getElementById('counter');
  var examples = document.getElementById('examples');
  var connectionStatus = document.getElementById('connection-status');
  var connectionLabel = document.getElementById('connection-label');

  var history = [];
  var busy = false;
  var lastSend = 0;
  var controller = null;
  var currentRun = null;

  var WELCOME =
    'Hello 👋 I\'m Pixel Core, a concise technology answer engine from PixelProTech Solutions.\n\n' +
    'Ask me about:\n' +
    '- Windows and Linux troubleshooting\n' +
    '- Hardware, storage, RAM and performance\n' +
    '- Wi-Fi, routers and networking\n' +
    '- Software setup, error messages and logs\n' +
    '- Programming basics, cybersecurity basics and backups\n' +
    '- PixelProTech services (verified company information only)\n\n' +
    'I\'m text-only and not a live web search, so I may be out of date. I\'ll point you to official documentation where it helps.';

  function scrollDown() { chat.scrollTop = chat.scrollHeight; }

  function addMessage(kind, text, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + kind + (opts.error ? ' error' : '');
    var who = document.createElement('span');
    who.className = 'who';
    who.textContent = kind === 'user' ? 'You' : (opts.error ? 'Notice' : 'Pixel Core');
    var body = document.createElement('div');
    body.className = 'body';
    if (kind === 'user') {
      body.textContent = text; // plain text only
    } else {
      window.PixelRender.renderInto(body, text, document); // safe DOM rendering
    }
    wrap.appendChild(who);
    wrap.appendChild(body);
    chat.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function showWelcome() { addMessage('bot', WELCOME); }

  function setConnection(state, label) {
    if (!connectionStatus || !connectionLabel) return;
    connectionStatus.setAttribute('data-state', state);
    connectionLabel.textContent = label;
  }

  function healthUrl() {
    try {
      var url = new URL(cfg.API_URL);
      url.pathname = '/health';
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (e) {
      return null;
    }
  }

  var healthCheck = null;

  function checkServer() {
    if (!navigator.onLine) {
      setConnection('offline', 'Device offline · waiting for network');
      return;
    }

    var url = healthUrl();
    if (!url) {
      setConnection('error', 'Server address is not configured');
      return;
    }

    if (healthCheck) healthCheck.abort();
    healthCheck = new AbortController();
    var activeCheck = healthCheck;
    var timer = setTimeout(function () { activeCheck.abort(); }, 6000);

    setConnection('checking', 'Checking Pixel Core server…');

    fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: activeCheck.signal
    })
      .then(function (res) {
        if (healthCheck !== activeCheck) return;
        if (res.ok) {
          setConnection('connected', 'Pixel Core server reachable');
        } else {
          setConnection('error', 'Network available · server returned ' + res.status);
        }
      })
      .catch(function () {
        if (healthCheck !== activeCheck) return;
        if (!navigator.onLine) {
          setConnection('offline', 'Device offline · waiting for network');
        } else {
          setConnection('error', 'Network available · server not responding');
        }
      })
      .then(function () {
        clearTimeout(timer);
        if (healthCheck === activeCheck) healthCheck = null;
      });
  }

  window.addEventListener('offline', function () {
    if (healthCheck) healthCheck.abort();
    setConnection('offline', 'Device offline · waiting for network');
  });

  window.addEventListener('online', function () {
    setConnection('checking', 'Network restored · checking server…');
    checkServer();
  });

  function updateCounter() {
    var n = input.value.length;
    counter.textContent = n + ' / ' + MAX_CHARS;
    counter.className = 'counter' + (n > MAX_CHARS ? ' over' : (n > MAX_CHARS * 0.9 ? ' warn' : ''));
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.3) + 'px';
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? 'Working…' : 'Send';
    chat.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function errorFor(status, code, serverMsg) {
    if (code === 'provider_rate_limited' || (status === 429 && code !== 'rate_limited')) {
      return 'Pixel Core has reached its free usage limit for now. Please try again in a little while.';
    }
    if (status === 429) return 'You are sending requests too quickly. Please wait a minute and try again.';
    if (status === 403) return 'This site is not allowed to use the Pixel Core server. The site owner needs to check the server\'s allowed-origin setting.';
    if (status === 413 || status === 400) return serverMsg || 'That message could not be sent. Try a shorter question.';
    if (status === 504) return 'The answer took too long. Please try again.';
    if (status === 503 || status >= 500) return 'Pixel Core could not answer just now. Your question is still in the box. Tap Send to try again.';
    return serverMsg || 'Something went wrong. Please try again.';
  }

  function validUrl(u) {
    try {
      var p = new URL(u);
      return p.protocol === 'https:' || p.protocol === 'http:';
    } catch (e) { return false; }
  }

  // ---- silent retry -------------------------------------------------------
  // The first request after a quiet spell can hit a cold or briefly unhappy
  // upstream. A second attempt a moment later almost always works, so transient
  // failures are retried quietly and the person only sees a notice if every
  // attempt fails.
  var RETRY_DELAYS = [1200, 2600]; // ms to wait before retry 1 and retry 2
  var RETRY_DEADLINE = 40000;      // never start a retry once this much time has passed

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function jitter(ms) { return ms + Math.floor(Math.random() * 400); }

  // How many silent retries a failure deserves. Only transient failures get any.
  function retryBudget(r) {
    if (r.code === 'client_timeout') return 0;               // already waited the full time
    if (r.status === 0) return navigator.onLine ? 2 : 0;     // dropped connection; pointless when offline
    if (r.code === 'provider_rate_limited' || (r.status === 429 && r.code !== 'rate_limited')) return 1;
    if (r.status === 429) return 0;                          // our own per-IP limiter: retrying makes it worse
    if (r.status >= 500) return 2;                           // busy / upstream hiccup / empty answer
    return 0;                                                // 4xx: retrying will not change the outcome
  }

  // One request. Never rejects: always resolves to a plain result object.
  function attempt(payload) {
    var ctrl = new AbortController();
    controller = ctrl;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, TIMEOUT);

    return fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = null;
          try { data = JSON.parse(raw); } catch (e) { /* non-JSON body */ }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              code: data && data.error && data.error.code,
              msg: data && data.error && data.error.message
            };
          }
          if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
            return { ok: false, status: 502, code: 'unreadable_answer' };
          }
          return { ok: true, reply: data.reply };
        });
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') {
          return timedOut ? { ok: false, status: 504, code: 'client_timeout' } : { ok: false, aborted: true };
        }
        return { ok: false, status: 0, code: 'network' };
      })
      .then(function (r) { clearTimeout(timer); return r; });
  }

  function sendWithRetry(payload, state, onRetrying) {
    var started = Date.now();
    var retries = 0;
    function go() {
      return attempt(payload).then(function (r) {
        if (state.cleared) return { ok: false, cleared: true };
        if (r.ok || r.aborted) return r;
        if (retries >= retryBudget(r) || Date.now() - started > RETRY_DEADLINE) return r;
        var delay = jitter(RETRY_DELAYS[retries] || RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        retries++;
        if (retries === 1 && onRetrying) onRetrying();
        return wait(delay).then(function () {
          return state.cleared ? { ok: false, cleared: true } : go();
        });
      });
    }
    return go();
  }


  function ask(text) {
    if (busy) return;
    text = text.trim();
    if (!text) { input.focus(); return; }
    if (text.length > MAX_CHARS) {
      addMessage('bot', 'That message is longer than ' + MAX_CHARS + ' characters. Please shorten it.', { error: true });
      return;
    }
    var now = Date.now();
    if (now - lastSend < MIN_GAP) return;

    if (!cfg.API_URL || !validUrl(cfg.API_URL)) {
      addMessage('bot', 'Pixel Core is not connected to its server yet. The site owner must set API_URL in config.js.', { error: true });
      return;
    }

    lastSend = now;
    addMessage('user', text);
    examples.hidden = true;
    history.push({ role: 'user', content: text });
    input.value = '';
    updateCounter();
    autosize();

    setBusy(true);
    setConnection('checking', 'Contacting Pixel Core…');
    var pending = addMessage('bot', 'Working on it…');
    pending.querySelector('.who').textContent = 'Pixel Core';

    var state = { cleared: false };
    currentRun = state;

    function fail(msg) {
      history.pop(); // the failed question is not part of the conversation
      pending.remove();
      addMessage('bot', msg, { error: true });
      input.value = text; // let the person resend without retyping
      updateCounter();
      autosize();
    }

    var payload = JSON.stringify({ messages: history.slice(-HISTORY) });

    sendWithRetry(payload, state, function () {
      var b = pending.querySelector('.body');
      if (b) b.textContent = 'Still working on it…'; // calm, not an error
    })
      .then(function (r) {
        if (state.cleared || r.cleared) return;
        if (r.ok) {
          setConnection('connected', 'Pixel Core server reachable');
          history.push({ role: 'assistant', content: r.reply });
          pending.remove();
          addMessage('bot', r.reply);
          return;
        }
        if (r.status === 0) {
          if (!navigator.onLine) {
            setConnection('offline', 'Device offline · your question is ready to retry');
          } else {
            setConnection('error', 'Could not reach Pixel Core · your question is ready to retry');
          }
          fail(navigator.onLine
            ? 'Cannot reach Pixel Core. Your question is still here. Check your connection and retry.'
            : 'Your device is offline. Your question is still here. Reconnect, then retry.');
          return;
        }
        setConnection('connected', 'Pixel Core server responded');
        fail(errorFor(r.status, r.code, r.msg));
      })
      .catch(function () {
        if (!state.cleared) fail('Something went wrong. Please try again.');
      })
      .then(function () {
        if (state.cleared) return; // the chat was cleared; a newer request may own the UI now
        setBusy(false);
        input.focus();
      });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  input.addEventListener('input', function () { updateCounter(); autosize(); });

  examples.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.chip') : null;
    if (b && b.getAttribute('data-q')) ask(b.getAttribute('data-q'));
  });

  clearBtn.addEventListener('click', function () {
    if (currentRun) currentRun.cleared = true;
    if (controller) controller.abort();
    setBusy(false);
    history = [];
    while (chat.firstChild) chat.removeChild(chat.firstChild);
    examples.hidden = false;
    showWelcome();
    input.value = '';
    updateCounter();
    autosize();
    input.focus();
  });

  showWelcome();
  updateCounter();
  checkServer();
})();
