#!/usr/bin/env node
/**
 * Startup self-check — catches "works on my machine" configuration drift.
 *
 * The bug this exists to prevent: the dev CORS allowlist was a hardcoded list of
 * ports (3000/3001/8000/5500/5501). Serving the frontend on any other port —
 * 5000, say — made every API call fail the preflight with "No
 * 'Access-Control-Allow-Origin' header", which looks like a backend outage but
 * is pure config. It worked on the machine whose port happened to be listed.
 *
 *   npm run check:startup
 *
 * Needs no database and binds no privileged port.
 */
const assert = require('assert');
const { EventEmitter } = require('events');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

let failures = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ✔ ${label}`);
  } catch (err) {
    failures++;
    console.log(`  ✖ ${label}\n      ${err.message.split('\n')[0]}`);
  }
};

console.log('\nCORS — development');
const config = require('../config/config');
[
  'http://localhost:5000',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://192.168.1.20:5000',
  'http://10.1.2.3:4200',
  'http://172.20.0.5:3000',
].forEach((origin) => {
  check(`allows ${origin}`, () => assert.strictEqual(config.cors.isAllowed(origin), true));
});
check('allows requests with no Origin (curl, Postman, native app)', () =>
  assert.strictEqual(config.cors.isAllowed(undefined), true));
check('allows "null" Origin (page opened via file://)', () =>
  assert.strictEqual(config.cors.isAllowed('null'), true));
check('rejects a public origin', () =>
  assert.strictEqual(config.cors.isAllowed('https://not-our-app.example.com'), false));

console.log('\nCORS — production (separate process, strict allowlist)');
check('rejects localhost and requires CLIENT_URL/ADMIN_URL', () => {
  const { execFileSync } = require('child_process');
  const script = `
    const c = require(${JSON.stringify(path.join(__dirname, '..', 'config', 'config'))});
    if (c.cors.isAllowed('http://localhost:5000')) throw new Error('localhost allowed in production');
    if (c.cors.isAllowed('null')) throw new Error('file:// origin allowed in production');
    if (!c.cors.isAllowed('https://app.example.com')) throw new Error('CLIENT_URL not allowed');
    if (!c.cors.isAllowed('https://admin.example.com')) throw new Error('ADMIN_URL not allowed');
  `;
  execFileSync(process.execPath, ['-e', script], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CLIENT_URL: 'https://app.example.com',
      ADMIN_URL: 'https://admin.example.com',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
      JWT_SECRET: 'x',
      REFRESH_SECRET: 'x',
    },
  });
});

console.log('\nStatic frontends');
[
  ['customer frontend', 'index.html'],
  ['customer frontend', 'js/config/apiBase.js'],
  ['driver frontend', 'pages/login.html'],
  ['driver frontend', 'js/apiBase.js'],
].forEach(([dir, file]) => {
  check(`${dir}/${file} exists`, () =>
    assert.ok(fs.existsSync(path.join(__dirname, '..', dir, file)), 'missing'));
});

check('no frontend file hardcodes localhost:4000', () => {
  const { execFileSync } = require('child_process');
  let out = '';
  try {
    out = execFileSync(
      'grep',
      ['-rn', '--include=*.js', '--include=*.ts', '--include=*.html', 'localhost:4000',
        path.join(__dirname, '..', 'customer frontend'),
        path.join(__dirname, '..', 'driver frontend'),
        path.join(__dirname, '..', 'client', 'lib'),
        path.join(__dirname, '..', 'admin', 'lib')],
      { encoding: 'utf8' },
    );
  } catch (err) {
    out = ''; // grep exits 1 when there are no matches
  }
  // The resolver files mention the old URL in their explanatory comments.
  const offenders = out.split('\n').filter((l) => l && !/apiBase\.(js|ts)/.test(l));
  assert.strictEqual(offenders.join('\n'), '', `still hardcoded:\n${offenders.join('\n')}`);
});

console.log('\nHTTP surface');
const app = require('../app');
const server = http.createServer(app);

// `send` is swapped for whichever transport we manage to get: a real TCP port,
// a local socket, or an in-process dispatch. The checks are about middleware
// wiring, so any of the three proves the same thing.
let send = null;

const overSocket = (options) => (method, urlPath, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ ...options, path: urlPath, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

/**
 * Dispatch straight into the Express app with a mocked request/response pair —
 * no listener, so it works in sandboxes and CI images that forbid binding.
 */
const inProcess = (method, urlPath, headers = {}) =>
  new Promise((resolve) => {
    // Node's HTTP client lowercases header names before they reach the server;
    // Express reads req.headers.origin, so the mock has to do the same or every
    // header-dependent middleware silently sees nothing.
    const normalizedHeaders = {};
    Object.keys(headers).forEach((k) => { normalizedHeaders[k.toLowerCase()] = headers[k]; });

    const req = new EventEmitter();
    Object.assign(req, {
      method,
      url: urlPath,
      headers: normalizedHeaders,
      httpVersion: '1.1',
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      socket: { remoteAddress: '127.0.0.1', encrypted: false },
      complete: true,
      readable: false,
      resume() { return this; },
      setEncoding() { return this; },
      pause() { return this; },
      unpipe() { return this; },
      pipe(dest) { dest.end(); return dest; },
    });
    req.connection = req.socket;

    const res = new EventEmitter();
    const store = {};
    const chunks = [];
    Object.assign(res, {
      statusCode: 200,
      headersSent: false,
      finished: false,
      writableEnded: false,
      setHeader(k, v) { store[k.toLowerCase()] = v; return this; },
      getHeader(k) { return store[k.toLowerCase()]; },
      getHeaders() { return { ...store }; },
      removeHeader(k) { delete store[k.toLowerCase()]; return this; },
      hasHeader(k) { return k.toLowerCase() in store; },
      writeHead(code, hdrs) { this.statusCode = code; if (hdrs) Object.assign(store, hdrs); return this; },
      write(c) { if (c) chunks.push(Buffer.from(c)); return true; },
      end(c) {
        if (c) chunks.push(Buffer.from(c));
        this.finished = true;
        this.writableEnded = true;
        resolve({ status: this.statusCode, headers: store, body: Buffer.concat(chunks).toString('utf8') });
        this.emit('finish');
        return this;
      },
      flushHeaders() {},
      cork() {},
      uncork() {},
    });

    app(req, res);
  });

const get = (urlPath, headers) => send('GET', urlPath, headers);

const preflight = (urlPath, origin) =>
  send('OPTIONS', urlPath, { Origin: origin, 'Access-Control-Request-Method': 'POST' });

async function runHttpChecks() {
  const asyncCheck = async (label, fn) => {
    try {
      await fn();
      console.log(`  ✔ ${label}`);
    } catch (err) {
      failures++;
      console.log(`  ✖ ${label}\n      ${err.message.split('\n')[0]}`);
    }
  };

  await asyncCheck('GET / serves the customer app', async () => {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(/<html/i.test(res.body), 'not HTML');
    assert.ok(res.body.includes('apiBase.js'), 'apiBase.js script tag not injected');
  });

  await asyncCheck('GET /js/config/apiBase.js serves the resolver', async () => {
    const res = await get('/js/config/apiBase.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('TORQQ_API_BASE'), 'resolver body unexpected');
  });

  await asyncCheck('GET /driver redirects to the driver login', async () => {
    const res = await get('/driver');
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.location, '/driver/pages/login.html');
  });

  await asyncCheck('GET /driver/pages/login.html serves the driver app', async () => {
    const res = await get('/driver/pages/login.html');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('apiBase.js'), 'apiBase.js script tag not injected');
  });

  await asyncCheck('the Socket.IO browser client is available to serve', async () => {
    if (send === inProcess) {
      // Socket.IO attaches to the HTTP server, not to the Express app, so an
      // in-process dispatch can't see that route. Check the underlying file
      // instead — that's what determines whether it can be served at all.
      assert.ok(
        fs.existsSync(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')),
        'socket.io client-dist missing — run npm install',
      );
      return;
    }
    const res = await get('/socket.io/socket.io.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('io'), 'unexpected client body');
  });

  await asyncCheck('served pages get a CSP that permits their own assets', async () => {
    const res = await get('/');
    const csp = res.headers['content-security-policy'] || '';
    assert.ok(csp.includes('fonts.googleapis.com'), 'Google Fonts blocked by CSP');
    assert.ok(csp.includes('fonts.gstatic.com'), 'font files blocked by CSP');
    assert.ok(csp.includes('unpkg.com'), 'Lucide icons blocked by CSP');
    assert.ok(!('cross-origin-embedder-policy' in res.headers), 'COEP set — blocks remote images');
  });

  await asyncCheck('preflight from a static server on :5000 is allowed', async () => {
    const res = await preflight('/api/v1/auth/send-otp', 'http://localhost:5000');
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5000');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  await asyncCheck('preflight from a LAN address is allowed', async () => {
    const res = await preflight('/api/v1/auth/send-otp', 'http://192.168.1.20:5500');
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://192.168.1.20:5500');
  });

  await asyncCheck('preflight from an unrelated public origin is refused', async () => {
    const res = await preflight('/api/v1/auth/send-otp', 'https://not-our-app.example.com');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
    assert.notStrictEqual(res.status, 500, 'rejection should not surface as a 500');
  });

  await asyncCheck('unknown API routes still return JSON, not the HTML app', async () => {
    const res = await get('/api/v1/definitely-not-a-route');
    assert.strictEqual(res.status, 404);
    assert.ok(/application\/json/.test(res.headers['content-type'] || ''), 'not JSON');
  });
}

const finish = () => {
  console.log(failures === 0
    ? '\nAll startup checks passed.\n'
    : `\n${failures} startup check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
};

// Prefer a real TCP port. Restricted environments (CI sandboxes) refuse to bind
// one, so fall back to a unix socket / named pipe — the checks are about
// middleware wiring, not about the transport.
const socketFallback = process.platform === 'win32'
  ? path.join('\\\\.\\pipe', `torqq-check-${process.pid}`)
  : path.join(os.tmpdir(), `torqq-check-${process.pid}.sock`);

server.once('error', (tcpErr) => {
  server.removeAllListeners('listening');
  console.log(`  … no TCP port available (${tcpErr.code}); trying a local socket`);
  const fallback = http.createServer(app);
  fallback.once('error', async (sockErr) => {
    console.log(`  … no local socket either (${sockErr.code}); dispatching in-process`);
    send = inProcess;
    await runHttpChecks();
    finish();
  });
  fallback.listen(socketFallback, async () => {
    send = overSocket({ socketPath: socketFallback });
    await runHttpChecks();
    fallback.close(() => {
      if (process.platform !== 'win32') fs.rmSync(socketFallback, { force: true });
      finish();
    });
  });
});

server.listen(0, '127.0.0.1', async () => {
  send = overSocket({ host: '127.0.0.1', port: server.address().port });
  await runHttpChecks();
  server.close(finish);
});

