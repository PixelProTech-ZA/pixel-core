/* Register the PWA worker only on secure origins or localhost. */
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch(function (error) {
        console.warn("Pixel Core offline support could not start.", error);
      });
  });
})();
