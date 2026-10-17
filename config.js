/* Public configuration. Safe to commit: this holds the PUBLIC Worker URL only.
 * NEVER put an API key here — anything in this folder is visible to everyone.
 */
window.PIXEL_CORE_CONFIG = {
  API_URL: 'https://pixel-core-api.lindokuhlerojasmabika.workers.dev/api/chat',
  MAX_CHARS: 1000,
  HISTORY_MESSAGES: 8,
  REQUEST_TIMEOUT_MS: 30000,
  MIN_SECONDS_BETWEEN_SENDS: 1.5,

  /* Topic links: https://pixelprotech-za.github.io/pixel-core/?t=<key>
   * opens the app with that question already in the box. The person still
   * taps Send, so a link can never fire a request by itself. Only keys listed
   * here work; anything else in the URL is ignored. Add one line per new
   * Status/post, then republish. */
  TOPICS: {
    'slow-startup': 'My Windows 11 laptop is slow after startup. What should I check first?',
    'wifi-no-internet': 'My Wi-Fi connects but there is no internet. How do I troubleshoot it?',
    'ram-vs-storage': 'What is the difference between RAM and storage?',
    'ubuntu-disk': 'How do I check free disk space and what is using it on Ubuntu?',
    'pc-wont-start': 'My PC will not start up. What should I check before calling a technician?',
    'printer-offline': 'My printer shows offline in Windows. What should I check first?',
    'slow-wifi-rooms': 'My Wi-Fi is slow in some rooms. What can I do to improve it?',
    'phishing-check': 'How can I tell if an email or WhatsApp message is a phishing attempt?',
    'office-backup': 'What is a simple backup plan for a small office with three computers?',
  },
};
