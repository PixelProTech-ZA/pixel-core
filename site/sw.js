/* Pixel Core PWA: registers the offline worker and powers the "Install app"
 * button. Chrome, Edge and Samsung Internet (Android and desktop) fire
 * `beforeinstallprompt`, which lets the button open the real install dialog.
 * iPhone/iPad Safari has no such event, so the button shows the manual steps.
 * The button never appears when the app is already installed and running. */
(function () {
  'use strict';

  var deferred = null; // the saved install prompt event (Chromium browsers)

  function el(id) { return document.getElementById(id); }

  function isStandalone() {
    try {
      var mm = window.matchMedia;
      return !!((mm && (mm('(display-mode: standalone)').matches ||
                        mm('(display-mode: window-controls-overlay)').matches ||
                        mm('(display-mode: minimal-ui)').matches)) ||
                window.navigator.standalone === true);
    } catch (e) { return false; }
  }

  function isIos() {
    var ua = navigator.userAgent || '';
    var iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
  }

  function showButton() {
    var row = el('install-row'), btn = el('install'), help = el('install-help');
    if (!row || !btn) return;
    btn.hidden = false;
    if (help) help.hidden = true;
    row.hidden = false;
  }

  function hideAll() {
    var row = el('install-row'), btn = el('install'), help = el('install-help');
    if (btn) btn.hidden = true;
    if (help) help.hidden = true;
    if (row) row.hidden = true;
  }

  function showHelp(text) {
    var row = el('install-row'), help = el('install-help');
    if (!row || !help) return;
    help.textContent = text;
    help.hidden = false;
    row.hidden = false;
  }

  // Must be attached immediately: the browser can fire this before `load`.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // keep the event so our own button can open the dialog
    deferred = e;
    if (!isStandalone()) showButton();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hideAll();
  });

  function onInstallClick() {
    if (deferred) {
      var d = deferred;
      deferred = null; // an install prompt can only be used once
      try {
        d.prompt();
        if (d.userChoice && d.userChoice.then) {
          d.userChoice.then(function () { hideAll(); }, function () { hideAll(); });
        } else {
          hideAll();
        }
      } catch (err) {
        showHelp('Open your browser menu and choose "Install app" or "Add to Home screen".');
      }
      return;
    }
    if (isIos()) {
      showHelp('To install: tap the Share button, then "Add to Home Screen".');
    } else {
      showHelp('Open your browser menu and choose "Install app" or "Add to Home screen".');
    }
  }

  function init() {
    var btn = el('install');
    if (btn) btn.addEventListener('click', onInstallClick);
    // iPhone/iPad never fires the install event, so offer the manual steps.
    if (isIos() && !isStandalone()) showButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Offline support (secure origins and localhost only).
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(function (error) {
          console.warn('Pixel Core offline support could not start.', error);
        });
    });
  }
})();
