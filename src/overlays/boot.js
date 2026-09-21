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
          return 'family=' + encodeURIComponent(f) + ':ital,wght@0,400;0,600;0,700;1,400;1,600';
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

  /*
   * Showcase mode: `?state=<name>` plays one state from
   * /overlay/showcase/states.json instead of listening to the server. Nothing
   * reaches OBS and nothing reads the database. Once the state has played, the
   * page is frozen — animations paused, timers cleared — and
   * `data-showcase-ready` marks it for the capture script.
   */
  var showcaseState = new URLSearchParams(window.location.search).get('state');
  if (showcaseState) installShowcase(name, showcaseState);

  function installShowcase(overlay, stateName) {
    var root = document.documentElement;
    var realFetch = window.fetch.bind(window);
    var realSetTimeout = window.setTimeout.bind(window);
    var realSetInterval = window.setInterval.bind(window);
    var realRaf = window.requestAnimationFrame.bind(window);
    var timeouts = [];
    var intervals = [];
    var frames = [];
    var frozen = false;

    function fail(message) {
      root.setAttribute('data-showcase-error', message);
    }

    var statePromise = realFetch(origin + '/overlay/showcase/states.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (all) {
        var entry = all.overlays[overlay];
        var state = entry && entry.states[stateName];
        if (!state) throw new Error('unknown state ' + overlay + ' / ' + stateName);
        return state;
      });
    statePromise.catch(function (e) {
      fail(String(e && e.message ? e.message : e));
    });

    // Timers the overlay starts are tracked so the freeze can stop them —
    // otherwise an alert would hide itself or a clock keep ticking mid-capture.
    window.setTimeout = function () {
      if (frozen) return 0;
      var id = realSetTimeout.apply(window, arguments);
      timeouts.push(id);
      return id;
    };
    window.setInterval = function () {
      if (frozen) return 0;
      var id = realSetInterval.apply(window, arguments);
      intervals.push(id);
      return id;
    };
    window.requestAnimationFrame = function (cb) {
      if (frozen) return 0;
      var id = realRaf(cb);
      frames.push(id);
      return id;
    };

    // The overlay config stays real so palette changes show up here too.
    window.fetch = function (input, init) {
      var url = new URL(typeof input === 'string' ? input : input.url, origin);
      if (url.pathname.indexOf('/public/') !== 0 || url.pathname === '/public/overlay-config') {
        return realFetch(input, init);
      }
      return statePromise.then(function (state) {
        var body = (state.public || {})[url.pathname];
        var json = { 'Content-Type': 'application/json' };
        if (body === undefined) return new Response('null', { status: 404, headers: json });
        return new Response(JSON.stringify(body), { status: 200, headers: json });
      });
    };

    function freeze() {
      if (frozen) return;
      document.getAnimations().forEach(function (a) {
        a.pause();
      });
      frozen = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      frames.forEach(cancelAnimationFrame);
      document.fonts.ready.then(function () {
        root.setAttribute('data-showcase-ready', '');
      });
    }

    function FakeSocket() {
      var socket = this;
      socket.readyState = 0;
      realSetTimeout(function () {
        socket.readyState = 1;
        if (socket.onopen) socket.onopen({});
        statePromise.then(function (state) {
          (state.events || []).forEach(function (e) {
            realSetTimeout(function () {
              if (!frozen && socket.onmessage) {
                socket.onmessage({ data: JSON.stringify({ event: e.event, data: e.data }) });
              }
            }, e.afterMs || 0);
          });
          realSetTimeout(freeze, state.freezeAfterMs || 0);
        });
      }, 0);
    }
    FakeSocket.prototype.send = function () {};
    FakeSocket.prototype.close = function () {};
    FakeSocket.prototype.addEventListener = function (type, fn) {
      this['on' + type] = fn;
    };
    FakeSocket.CONNECTING = 0;
    FakeSocket.OPEN = 1;
    FakeSocket.CLOSING = 2;
    FakeSocket.CLOSED = 3;
    window.WebSocket = FakeSocket;
  }
})();
