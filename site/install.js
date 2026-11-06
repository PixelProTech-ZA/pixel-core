/* Pixel Core — in-interface Install App button.
   Same-folder file (flat). No innerHTML, no inline styles: safe under strict CSP. */
(function () {
  'use strict';

  var deferred = null;
  var btn = null;
  var panel = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok/i.test(navigator.userAgent || '');
  }

  function platform() {
    var ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
  }

  var STEPS = {
    inapp: [
      'You are inside another app\u2019s browser (Facebook, Instagram, etc.). Apps cannot be installed from here.',
      'Tap the \u22EE or \u2026 menu at the top corner.',
      'Choose \u201COpen in Chrome\u201D (or \u201COpen in browser\u201D).',
      'Then tap Install App again.'
    ],
    android: [
      'Open this page in Chrome.',
      'Tap the \u22EE menu (top right).',
      'Tap \u201CInstall app\u201D. If you only see \u201CAdd to Home screen\u201D, tap that instead.',
      'Confirm. The Pixel Core icon appears on your home screen.'
    ],
    ios: [
      'Open this page in Safari.',
      'Tap the Share button (square with an arrow).',
      'Scroll down and tap \u201CAdd to Home Screen\u201D.',
      'Tap Add.'
    ],
    desktop: [
      'Look for the install icon at the right end of the address bar, or open the browser menu.',
      'Choose \u201CInstall Pixel Core\u201D (Chrome / Edge).',
      'Confirm. It opens in its own window.'
    ]
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function hideButton() {
    if (btn) btn.hidden = true;
    closeHelp();
  }

  function closeHelp() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function showHelp() {
    closeHelp();
    var key = isInAppBrowser() ? 'inapp' : platform();
    panel = el('div', 'install-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Install Pixel Core');
    panel.appendChild(el('h2', 'install-title', 'Install Pixel Core'));
    var list = el('ol', 'install-steps');
    STEPS[key].forEach(function (s) { list.appendChild(el('li', '', s)); });
    panel.appendChild(list);
    var close = el('button', 'install-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', closeHelp);
    panel.appendChild(close);
    document.body.appendChild(panel);
    close.focus();
  }

  function onClick() {
    if (deferred) {
      var ev = deferred;
      deferred = null;
      try {
        ev.prompt();
        ev.userChoice.then(function (c) {
          if (c && c.outcome === 'accepted') hideButton();
        }, function () {});
      } catch (e) {
        showHelp();
      }
    } else {
      showHelp();
    }
  }

  function build() {
    if (isStandalone()) return;
    btn = el('button', 'install-btn', 'Install App');
    btn.type = 'button';
    btn.id = 'installBtn';
    btn.addEventListener('click', onClick);
    var slot = document.getElementById('installSlot');
    if (slot) { slot.appendChild(btn); } else { btn.classList.add('install-floating'); document.body.appendChild(btn); }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hideButton();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeHelp();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
