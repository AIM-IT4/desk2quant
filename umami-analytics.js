(function () {
  'use strict';

  const WEBSITE_ID = '1a30fbff-9eea-4902-840d-0c5a2d63366e';
  const TRACKER_SRC = 'https://umami-analytics-p9pt.onrender.com/script.js';
  const PRODUCTION_HOST = 'desk2quant.com';

  // Keep local, preview and non-canonical hosts out of production analytics.
  if (String(window.location.hostname || '').toLowerCase() !== PRODUCTION_HOST) {
    return;
  }

  if (document.querySelector('script[data-website-id="' + WEBSITE_ID + '"]')) {
    if (window.umami && typeof window.umami.track === 'function') {
      window.dispatchEvent(new Event('d2q:umami-ready'));
    }
    return;
  }

  const script = document.createElement('script');
  script.id = 'd2q-umami-runtime';
  script.defer = true;
  script.src = TRACKER_SRC;
  script.setAttribute('data-website-id', WEBSITE_ID);
  script.setAttribute('data-domains', PRODUCTION_HOST);
  script.addEventListener('load', function () {
    window.dispatchEvent(new Event('d2q:umami-ready'));
  }, { once: true });

  document.head.appendChild(script);
}());
