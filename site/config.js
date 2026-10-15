/* Public configuration. Safe to commit: this holds the PUBLIC Worker URL only.
 * NEVER put an API key here — anything in this folder is visible to everyone.
 *
 * After deploying the Worker, set API_URL to its address, for example:
 *   https://pixel-core-api.YOUR-SUBDOMAIN.workers.dev/api/chat
 */
window.PIXEL_CORE_CONFIG = {
  API_URL: '',
  MAX_CHARS: 1000,
  HISTORY_MESSAGES: 8,
  REQUEST_TIMEOUT_MS: 30000,
  MIN_SECONDS_BETWEEN_SENDS: 1.5,
};
