// Link guard. The model is NOT a retrieval system, so any URL it prints is
// unverified. We keep only links whose host is a known documentation/vendor
// domain; everything else is replaced with a neutral note. This does not
// prove a deep link exists — it only stops links to arbitrary/unknown sites.

const ALLOWED_HOST_SUFFIXES = [
  'microsoft.com',
  'apple.com',
  'ubuntu.com',
  'debian.org',
  'archlinux.org',
  'fedoraproject.org',
  'kernel.org',
  'mozilla.org',
  'cisa.gov',
  'nist.gov',
  'python.org',
  'w3.org',
  'rfc-editor.org',
  'cloudflare.com',
  'github.com',
  'intel.com',
  'amd.com',
  'nvidia.com',
  'dell.com',
  'hp.com',
  'lenovo.com',
  'pixelprotechsolutions.co.za',
];

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;

function hostAllowed(host) {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
}

export function guardUrls(text) {
  return String(text).replace(URL_RE, (match) => {
    const trailing = (match.match(TRAILING_PUNCT) || [''])[0];
    const clean = trailing ? match.slice(0, -trailing.length) : match;
    try {
      const u = new URL(clean);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && hostAllowed(u.hostname)) {
        return clean + trailing;
      }
    } catch (_) {
      /* fall through */
    }
    return '[link removed: unverified source]' + trailing;
  });
}
