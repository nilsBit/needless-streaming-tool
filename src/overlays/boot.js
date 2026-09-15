/*
 * The one copy of what used to sit in every overlay.
 *
 * Include as:  <script src="/overlay/boot.js" data-overlay="song"></script>
 *
 * The name decides which entry of `overrides` applies on top of `global`.
 */
(function () {
  var script = document.currentScript;
  var name = (script && script.getAttribute('data-overlay')) || '';
  var origin = window.location.origin || 'http://localhost:4000';

  window.__overlayOrigin = origin;
  window.__overlayWs = origin.replace(/^http/, 'ws');

  // Hidden until the config is on, so no overlay flashes its fallback colours
  // into a live stream.
  document.documentElement.style.visibility = 'hidden';

  var RGB_KEYS = ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'];

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ' ' + g + ' ' + b;
  }

  function apply(config) {
    var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
    var root = document.documentElement;
    Object.keys(vars).forEach(function (k) {
      root.style.setProperty(k, vars[k]);
    });
    RGB_KEYS.forEach(function (k) {
      if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
    });
    return vars;
  }

  function loadFonts(vars) {
    var fonts = [vars['--font-display'], vars['--font-body']].filter(Boolean);
    if (fonts.length === 0) return;
    var families = fonts.map(function (f) {
      return f.split(',')[0].replace(/'/g, '').trim();
    });
    // Italics are requested explicitly. The Entry Card sets secondary names and
    // empty-page notes in italic, and a browser-faked oblique on a serif face
    // is plainly visible.
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?' +
      families
        .map(function (f) {
          return 'family=' + encodeURIComponent(f) + ':ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600';
        })
        .join('&') +
      '&display=swap';
    document.head.appendChild(link);
  }

  fetch(origin + '/public/overlay-config')
    .then(function (r) {
      return r.json();
    })
    .then(function (config) {
      loadFonts(apply(config));
    })
    .catch(function () {})
    .finally(function () {
      document.documentElement.style.visibility = 'visible';
    });

  // The settings panel broadcasts `overlay-config`; each overlay re-applies
  // without a reload.
  window.__applyOverlayConfig = function (config) {
    apply(config);
  };
})();
