// Pixel Core install button. Include with: <script src="pwa-install.js" defer></script>
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(console.error);
    });
  }

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return; // already installed, show nothing

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Button
  const btn = document.createElement('button');
  btn.id = 'pc-install-btn';
  btn.type = 'button';
  btn.hidden = true;
  btn.textContent = 'INSTALL APP';
  document.body.appendChild(btn);

  // iOS help sheet
  const sheet = document.createElement('div');
  sheet.id = 'pc-ios-sheet';
  sheet.hidden = true;
  sheet.innerHTML =
    '<div class="pc-card"><strong>Install Pixel Core</strong>' +
    '<p>1. Tap the <b>Share</b> button in Safari<br>2. Choose <b>Add to Home Screen</b><br>3. Tap <b>Add</b></p>' +
    '<button type="button" id="pc-ios-close">GOT IT</button></div>';
  document.body.appendChild(sheet);
  sheet.querySelector('#pc-ios-close').onclick = () => (sheet.hidden = true);

  let deferred = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    deferred = null;
  });

  btn.addEventListener('click', async () => {
    if (isIOS && !deferred) { sheet.hidden = false; return; }
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });

  // iOS never fires beforeinstallprompt, so always show the button there
  if (isIOS) btn.hidden = false;
})();
