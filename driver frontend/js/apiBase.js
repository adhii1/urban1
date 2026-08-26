/**
 * TORQQ - Runtime API base resolver
 *
 * Every API call in this app used to hardcode `http://localhost:4000/api/v1`,
 * which only works if you happen to be sitting at the machine running the
 * backend. Open the same page from a phone or a second laptop on the wifi and
 * `localhost` points at *that* device, so every request fails.
 *
 * This resolves the API origin at runtime instead. Load it before any other
 * script on the page; everything else reads `window.TORQQ_API_BASE`.
 *
 * To point a page at a different backend (staging, a colleague's machine):
 *   localStorage.setItem('torqq_api_origin', 'http://192.168.1.42:4000')
 *   location.reload()
 * and to go back to the default:
 *   localStorage.removeItem('torqq_api_origin')
 */
(function () {
  var OVERRIDE_KEY = 'torqq_api_origin';
  var DEFAULT_API_PORT = '4000';

  // Ports that belong to a *static* dev server (Live Server, `next dev`,
  // `python -m http.server`, Vite) rather than to this backend. A page on one of
  // these is cross-origin to the API and needs an absolute URL. Any other port
  // is assumed to be the backend serving its own frontend, which is the
  // supported setup — that way an unfamiliar port degrades to "same origin",
  // which works, instead of to a guess, which doesn't.
  var STATIC_DEV_PORTS = ['3000', '3001', '4200', '5000', '5001', '5173', '5500', '5501', '8000', '8080'];

  function readOverride() {
    try {
      return window.localStorage.getItem(OVERRIDE_KEY);
    } catch (err) {
      return null; // Safari private mode, file:// with storage disabled
    }
  }

  function resolveOrigin() {
    var override = readOverride();
    if (override) return override.replace(/\/+$/, '');

    var loc = window.location;

    // Opened straight off disk — no origin to be relative to.
    if (loc.protocol === 'file:') return 'http://localhost:' + DEFAULT_API_PORT;

    // Served by a separate static server: same host, but the API is on its own
    // port. Using loc.hostname (not "localhost") is what makes LAN devices work.
    if (STATIC_DEV_PORTS.indexOf(loc.port) !== -1) {
      return loc.protocol + '//' + loc.hostname + ':' + DEFAULT_API_PORT;
    }

    // Served by the backend itself, or by a reverse proxy in front of it. Stay
    // relative so the host, port and protocol are all inherited for free.
    return '';
  }

  var origin = resolveOrigin();

  window.TORQQ_API_ORIGIN = origin;
  window.TORQQ_API_BASE = origin + '/api/v1';
  // Socket.IO needs an absolute origin; '' would make it connect to the page.
  window.TORQQ_SOCKET_ORIGIN = origin || window.location.origin;
  // Served by the backend, so it always matches the server's socket.io version.
  window.TORQQ_SOCKET_CLIENT_URL = window.TORQQ_SOCKET_ORIGIN + '/socket.io/socket.io.js';

  /** Absolute URL for a path the API returned, e.g. an avatar upload. */
  window.TORQQ_ASSET_URL = function (assetPath) {
    if (!assetPath) return '';
    if (/^(https?:)?\/\//i.test(assetPath)) return assetPath;
    return window.TORQQ_API_ORIGIN + '/' + String(assetPath).replace(/^\/+/, '');
  };

  /** Refresh driver authentication token when expired */
  window.refreshDriverSession = async function () {
    var refreshToken = localStorage.getItem('driverRefreshToken');
    try {
      var res = await fetch((window.TORQQ_API_BASE || '/api/v1') + '/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(refreshToken ? { 'x-refresh-token': refreshToken } : {})
        },
        body: JSON.stringify({ refreshToken: refreshToken || '' }),
        credentials: 'include'
      });
      if (!res.ok) return false;
      var body = await res.json();
      var tokenData = body.data || body;
      if (tokenData && tokenData.accessToken) {
        localStorage.setItem('driverToken', tokenData.accessToken);
        if (tokenData.refreshToken) {
          localStorage.setItem('driverRefreshToken', tokenData.refreshToken);
        }
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };
})();
