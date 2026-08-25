/**
 * Runtime API origin resolution.
 *
 * The previous fallback was a hardcoded `http://localhost:4000`, which only
 * works when the browser is on the same machine as the backend. Open the app
 * from a phone or a second laptop on the same wifi and `localhost` resolves to
 * that device instead, so every request fails with a connection error.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_API_URL, if set (staging, prod).
 *   2. Server-side rendering: loopback, since it's the same host as the backend.
 *   3. Browser on a known dev-server port: same hostname, backend's port.
 *   4. Otherwise: same origin, i.e. the backend is serving this app or sits
 *      behind the same reverse proxy.
 */
const DEFAULT_API_PORT = '4000';

// Ports served by a dev server (next dev, Vite, Live Server, http.server) —
// cross-origin to the API, so they need an absolute URL. Anything else is
// assumed same-origin, which degrades safely instead of guessing a host.
const DEV_SERVER_PORTS = ['3000', '3001', '4200', '5000', '5001', '5173', '5500', '5501', '8000', '8080'];

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');

  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}/api/v1`;
  }

  const { protocol, hostname, port } = window.location;
  if (DEV_SERVER_PORTS.includes(port)) {
    return `${protocol}//${hostname}:${DEFAULT_API_PORT}/api/v1`;
  }
  return '/api/v1';
}

export const API_BASE_URL = resolveApiBase();

/** Socket.IO needs an absolute origin — a relative path would target the page. */
export const SOCKET_URL =
  API_BASE_URL.replace(/\/api\/v1$/, '') ||
  (typeof window === 'undefined' ? `http://localhost:${DEFAULT_API_PORT}` : window.location.origin);
