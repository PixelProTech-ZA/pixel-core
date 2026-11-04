// Pixel Core: in-interface INSTALL APP button.
// Add to site/index.html before </body>:  <script src="pwa-install.js" defer></script>
(function () {
  'use strict';

  // 1. Make sure the page has a manifest + theme colour (skips anything you already have)
  const head = document.head;
  if (!head.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link');
    l.rel = 'manifest'; l.href = 'manifest.webmanifest';
    head.appendChild(l);
  }
  if (!head.querySelector('meta[name="theme-color"]')) {
    const m = document.createElement('meta');
    m.name = 'theme-color'; m.content = '#07070a';
    head.appendChild(m);
  }

  // 2. Register a service worker only if the site doesn't already have one
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // 3. Already installed? Show nothing.
  const installed = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (installed()) return;

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isFirefox = /firefox/i.test(ua);

  // 4. Build the button, styled like the existing CLEAR CHAT button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'pc-install-btn';
  btn.textContent = 'INSTALL APP';

  function place() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const clear = buttons.find(b => /clear\s*chat/i.test(b.textContent));
    if (clear && clear.parentElement) {
      btn.className = clear.className;           // inherit your button look
      clear.parentElement.insertBefore(btn, clear);
      return true;
    }
    // Fallback: header, then top of body
    const host = document.querySelector('header') || document.body;
    btn.classList.add('pc-install-fallback');
    host.appendChild(btn);
    return false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  else place();

  // 5. Help dialog for browsers with no one-tap install
  const sheet = document.createElement('div');
  sheet.id = 'pc-install-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Install Pixel Core');
  sheet.innerHTML =
    '<div class="pc-card"><strong>Install Pixel Core</strong><p id="pc-install-steps"></p>' +
    '<button type="button" id="pc-install-close">GOT IT</button></div>';
  document.body.appendChild(sheet);
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.id === 'pc-install-close') sheet.hidden = true; });

  function showHelp() {
    let steps;
    if (isIOS) steps = '1. Tap the <b>Share</b> button in Safari<br>2. Choose <b>Add to Home Screen</b><br>3. Tap <b>Add</b>';
    else if (isAndroid) steps = '1. Open the browser menu (⋮)<br>2. Tap <b>Install app</b> or <b>Add to Home screen</b>';
    else if (isFirefox) steps = 'Desktop Firefox can’t install web apps. Open this page in <b>Chrome</b> or <b>Edge</b> and use Install.';
    else steps = 'Open the browser menu (⋮) and choose <b>Install Pixel Core</b>, or click the install icon in the address bar.';
    sheet.querySelector('#pc-install-steps').innerHTML = steps;
    sheet.hidden = false;
  }

  // 6. Wire up one-tap install where the browser supports it
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { btn.remove(); deferred = null; });

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) {}
      deferred = null;
    } else {
      showHelp();
    }
  });
})();
