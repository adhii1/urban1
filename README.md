# TORQQ

Carpool / shuttle platform. One Node backend, four frontends.

## Quickstart

```bash
npm install && npm run setup
```

`npm run setup` creates `.env.dev` from `.env.example` and generates the JWT secrets.
It leaves one blank you have to fill in — `MONGODB_URI`:

- Atlas: `mongodb+srv://<user>:<pass>@<cluster>/torqq`
- Local: `mongodb://127.0.0.1:27017/torqq`

Then:

```bash
npm run dev
```

That's it. The backend serves the two static frontends itself, so there is no second
server to start and nothing to configure:

| App | URL |
| --- | --- |
| Customer | http://localhost:4000 |
| Driver | http://localhost:4000/driver |
| API | http://localhost:4000/api/v1 |

The two Next.js apps run separately:

```bash
npm run dev:client
```

```bash
npm run dev:admin
```

| App | URL |
| --- | --- |
| Client (Next.js) | http://localhost:3000 |
| Admin (Next.js) | http://localhost:8000 |

Both need `npm run dev` going in another terminal — they call the same API.

## Opening it from a phone or another machine

Nothing extra to do. Find your machine's LAN address (`ipconfig getifaddr en0` on
macOS, `ipconfig` on Windows) and open `http://<that-address>:4000` from any device
on the same wifi.

This works because the frontends resolve the API from `window.location` at runtime
rather than hardcoding `localhost` — `localhost` on a phone means *the phone*, which
is why hardcoding it can never work off-machine.

## Pointing a frontend at a different backend

In the browser console on any static page:

```js
localStorage.setItem('torqq_api_origin', 'http://192.168.1.42:4000'); location.reload()
```

and to go back to the default:

```js
localStorage.removeItem('torqq_api_origin'); location.reload()
```

For the Next.js apps, set `NEXT_PUBLIC_API_BASE_URL` (client) or
`NEXT_PUBLIC_API_URL` (admin) instead.

## Checks

```bash
npm run check:startup
```

Verifies the things that silently differ between machines: that dev CORS accepts any
localhost/LAN origin on any port, that production CORS stays an exact allowlist, that
both static apps are served with a CSP their own assets can survive, and that no
frontend file has drifted back to a hardcoded `localhost:4000`. Needs no database.

```bash
node --test test/
```

Most of `test/` needs `MONGODB_URI` to point at a reachable database.

## Configuration

`.env.example` is the only committed env file — it documents every variable. The real
`.env.dev` / `.env.test` / `.env.prod` are gitignored, so a fresh clone has none of
them; that's what `npm run setup` is for.

In development, CORS accepts any `localhost`, `127.0.0.1` or private-LAN origin on any
port, so you never need to configure it. In production the allowlist is exact and
`CLIENT_URL` and `ADMIN_URL` are both required:

```
NODE_ENV=production
CLIENT_URL=https://app.example.com
ADMIN_URL=https://admin.example.com
CORS_EXTRA_ORIGINS=https://staging.example.com   # optional, comma-separated
```

## Troubleshooting

**`[FATAL] Required environment variable missing: MONGODB_URI`** — no env file. Run
`npm run setup`, then fill in `MONGODB_URI`.

**`No 'Access-Control-Allow-Origin' header` / `Failed to fetch`** — you're serving the
frontend from a separate static server on a port the backend doesn't recognise. Don't;
just open http://localhost:4000, which the backend serves itself. If you have a reason
to use a separate server, `npm run check:startup` will tell you whether your origin is
being accepted.

**`ERR_CONNECTION_REFUSED` on a CSS or JS file** — whatever was serving the page has
stopped. Again: `npm run dev`, then http://localhost:4000.

**Port 4000 already taken** — set `PORT` in `.env.dev` and open the new port. The
static frontends follow it automatically, because pages served by the backend call the
API on their own origin. Only a *separate* static server or the Next.js apps need
telling, via the `torqq_api_origin` / `NEXT_PUBLIC_*` overrides above.
