const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const fc = require('fast-check');

const customerFrontendDirectory = path.resolve(__dirname, '../customer frontend');
const apiBaseUrl = 'http://localhost:4000/api/v1';
const requiredSession = {
  accessToken: 'access-token',
  userName: 'OTP Customer',
  mobileNumber: '9876543210',
  isLoggedIn: 'true',
  userRole: 'Customer',
  userId: 'customer-id',
};

async function serveStaticCustomerFrontend() {
  const server = http.createServer(async (request, response) => {
    const relativePath = request.url === '/' ? 'index.html' : request.url.slice(1);
    const filePath = path.resolve(customerFrontendDirectory, relativePath);

    if (!filePath.startsWith(`${customerFrontendDirectory}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function createClassList(...names) {
  const values = new Set(names);
  return {
    add(...items) { items.forEach((item) => values.add(item)); },
    remove(...items) { items.forEach((item) => values.delete(item)); },
    contains(item) { return values.has(item); },
    toString() { return [...values].join(' '); },
  };
}

function createElement({ id, classes = [] } = {}) {
  const listeners = new Map();
  return {
    id,
    classList: createClassList(...classes),
    style: {},
    value: '',
    textContent: '',
    focused: false,
    resetCount: 0,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, overrides = {}) {
      const event = {
        target: this,
        preventDefault() {},
        key: undefined,
        ...overrides,
      };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    focus() { this.focused = true; },
    reset() { this.resetCount += 1; },
    listenerCount(type) { return (listeners.get(type) || []).length; },
  };
}

function createHarness({ responses = [], localValues = {} } = {}) {
  const elements = new Map();
  const add = (id, classes = []) => {
    const element = createElement({ id, classes });
    elements.set(id, element);
    return element;
  };

  const authModal = add('authModal', ['modal-overlay']);
  const loginButton = createElement({ classes: ['btn-login'] });
  const ctaButton = createElement({ classes: ['cta-btn'] });
  const cardButtons = [createElement({ classes: ['btn-card'] }), createElement({ classes: ['btn-card'] })];
  const otpBoxes = Array.from({ length: 6 }, () => createElement({ classes: ['otp-box'] }));
  const alerts = [];
  const requests = [];
  const domContentLoaded = [];
  const localStorage = createStorage(localValues);
  const sessionStorage = createStorage();

  [
    'modalCloseBtn', 'stepMobile', 'stepOTP', 'stepPassword', 'mobileForm', 'otpForm', 'passwordForm', 'nameGroup',
    'fullName', 'mobileNumber', 'passwordMobileNumber', 'password', 'passwordError',
    'otpSentNumber', 'btnChangeNumber', 'btnResendOTP',
  ].forEach((id) => add(id));

  const document = {
    addEventListener(type, listener) {
      if (type === 'DOMContentLoaded') domContentLoaded.push(listener);
    },
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) {
      if (selector === '.btn-login') return loginButton;
      if (selector === '.cta-btn') return ctaButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.btn-card') return cardButtons;
      if (selector === '.otp-box') return otpBoxes;
      return [];
    },
  };

  const context = {
    document,
    localStorage,
    sessionStorage,
    window: { location: { href: 'index.html', pathname: '/index.html' } },
    alert: (message) => alerts.push(message),
    console: { log() {}, error() {} },
    fetch: async (url, options) => {
      requests.push({ url, options: { ...options, headers: { ...options.headers } } });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return { json: async () => response || { success: false, message: 'Unexpected request' } };
    },
  };

  return {
    elements,
    authModal,
    loginButton,
    ctaButton,
    cardButtons,
    otpBoxes,
    alerts,
    requests,
    localStorage,
    sessionStorage,
    context,
    start() { domContentLoaded.forEach((listener) => listener()); },
  };
}

async function loadStaticAuth(authScript, options) {
  const harness = createHarness(options);
  vm.runInNewContext(authScript, harness.context, { filename: 'customer frontend/js/auth.js' });
  harness.start();
  return harness;
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function requestJson(request) {
  return JSON.parse(request.options.body);
}

async function advanceToOtp(harness, { phone = '9876543210', name = 'OTP Customer' } = {}) {
  harness.loginButton.dispatch('click');
  harness.elements.get('fullName').value = name;
  harness.elements.get('mobileNumber').value = phone;
  harness.elements.get('mobileForm').dispatch('submit');
  await settle();
}

function fillOtp(harness, value) {
  [...value].forEach((digit, index) => { harness.otpBoxes[index].value = digit; });
}

function assertUnauthenticated(harness) {
  assert.equal(harness.localStorage.getItem('isLoggedIn'), null);
  assert.equal(harness.context.window.location.href, 'index.html');
  assert.equal(harness.authModal.classList.contains('show'), true);
}

// Feature: customer-password-login-mismatch, Property 2: Preservation - OTP Flow and Legacy Session Continuity
// **Validates: Requirements 3.1, 3.2, 3.3**
test('preservation Property 2: successful OTP inputs retain the observed request, cookie, session, close, and redirect contract', async (t) => {
  const staticServer = await serveStaticCustomerFrontend();
  t.after(staticServer.close);
  const response = await fetch(`${staticServer.baseUrl}/js/auth.js`);
  assert.equal(response.status, 200);
  const authScript = await response.text();

  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 10 })
        .map((digits) => `${Math.max(1, digits[0])}${digits.slice(1).join('')}`),
      fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 6, maxLength: 6 })
        .map((digits) => digits.join('')),
      async (phone, otp) => {
        const harness = await loadStaticAuth(authScript, {
          responses: [
            { success: true },
            { success: true, data: { accessToken: requiredSession.accessToken, refreshToken: 'refresh-token', user: { name: requiredSession.userName, phone, role: requiredSession.userRole, id: requiredSession.userId } } },
          ],
        });
        await advanceToOtp(harness, { phone });
        assert.deepEqual(requestJson(harness.requests[0]), { phone, purpose: 'LOGIN' });
        assert.equal(harness.requests[0].url, `${apiBaseUrl}/auth/send-otp`);
        assert.equal(harness.requests[0].options.credentials, 'include');

        fillOtp(harness, otp);
        harness.elements.get('otpForm').dispatch('submit');
        await settle();

        assert.equal(harness.requests[1].url, `${apiBaseUrl}/auth/verify-otp`);
        assert.equal(harness.requests[1].options.method, 'POST');
        assert.equal(harness.requests[1].options.credentials, 'include');
        assert.deepEqual(requestJson(harness.requests[1]), { phone, otp, purpose: 'LOGIN', name: 'OTP Customer' });
        assert.deepEqual(harness.localStorage.snapshot(), { ...requiredSession, mobileNumber: phone, refreshToken: 'refresh-token' });
        assert.equal(harness.authModal.classList.contains('show'), false);
        assert.equal(harness.context.window.location.href, 'dashboard.html');
      }
    ),
    { numRuns: 25 }
  );
});

// Feature: customer-password-login-mismatch, Property 2: Preservation - OTP Flow and Legacy Session Continuity
// **Validates: Requirements 3.1, 3.2, 3.3**
test('preservation Property 2: incomplete and rejected OTPs retain denial with no session or redirect', async (t) => {
  const staticServer = await serveStaticCustomerFrontend();
  t.after(staticServer.close);
  const authScript = await (await fetch(`${staticServer.baseUrl}/js/auth.js`)).text();

  await fc.assert(
    fc.asyncProperty(
      fc.oneof(
        fc.constant({ kind: 'incomplete', otp: '12345', message: 'Please enter complete OTP' }),
        fc.constantFrom(
          { kind: 'rejected', otp: '000000', message: 'Invalid OTP code.' },
          { kind: 'rejected', otp: '111111', message: 'OTP expired.' },
          { kind: 'rejected', otp: '222222', message: 'OTP has not been verified.' }
        )
      ),
      async (caseInput) => {
        const responses = [{ success: true }];
        if (caseInput.kind === 'rejected') responses.push({ success: false, message: caseInput.message });
        const harness = await loadStaticAuth(authScript, { responses });
        await advanceToOtp(harness);
        fillOtp(harness, caseInput.otp);
        harness.elements.get('otpForm').dispatch('submit');
        await settle();

        assert.equal(harness.alerts.at(-1), caseInput.message);
        assertUnauthenticated(harness);
        assert.equal(harness.requests.length, caseInput.kind === 'incomplete' ? 1 : 2);
        if (caseInput.kind === 'rejected') assert.equal(harness.requests[1].url, `${apiBaseUrl}/auth/verify-otp`);
      }
    ),
    { numRuns: 25 }
  );
});

// Feature: customer-password-login-mismatch, Property 2: Preservation - OTP Flow and Legacy Session Continuity
// **Validates: Requirements 3.1, 3.2, 3.3**
test('preservation Property 2: resend, change-number, OTP focus, modal, returning-user, and non-auth interactions retain their observed state', async (t) => {
  const staticServer = await serveStaticCustomerFrontend();
  t.after(staticServer.close);
  const [htmlResponse, scriptResponse] = await Promise.all([
    fetch(`${staticServer.baseUrl}/index.html`),
    fetch(`${staticServer.baseUrl}/js/auth.js`),
  ]);
  const [indexHtml, authScript] = await Promise.all([htmlResponse.text(), scriptResponse.text()]);

  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 9 }), async (index, digit) => {
      const harness = await loadStaticAuth(authScript, { responses: [{ success: true }, { success: true }] });
      await advanceToOtp(harness);

      harness.otpBoxes[index].value = String(digit);
      harness.otpBoxes[index].dispatch('input');
      assert.equal(harness.otpBoxes[index + 1].focused, true);
      harness.otpBoxes[index + 1].value = '';
      harness.otpBoxes[index + 1].dispatch('keydown', { key: 'Backspace' });
      assert.equal(harness.otpBoxes[index].focused, true);

      harness.elements.get('btnResendOTP').dispatch('click');
      await settle();
      assert.equal(harness.requests[1].url, `${apiBaseUrl}/auth/send-otp`);
      assert.deepEqual(requestJson(harness.requests[1]), { phone: '9876543210', purpose: 'LOGIN' });
      assert.equal(harness.alerts.at(-1), 'OTP Resent!');

      harness.elements.get('btnChangeNumber').dispatch('click');
      assert.equal(harness.elements.get('stepMobile').classList.contains('active'), true);
      assert.equal(harness.elements.get('stepOTP').classList.contains('active'), false);
      assert.equal(harness.elements.get('mobileNumber').focused, true);
      assertUnauthenticated(harness);
    }),
    { numRuns: 25 }
  );

  for (const savedUser of [false, true]) {
    const localValues = savedUser ? { userName: 'Remembered', mobileNumber: '9123456789' } : {};
    const harness = await loadStaticAuth(authScript, { localValues });
    harness.ctaButton.dispatch('click');
    assert.equal(harness.elements.get('nameGroup').style.display, savedUser ? 'none' : 'block');
    assert.equal(harness.elements.get('mobileNumber').value, savedUser ? '9123456789' : '');
    harness.elements.get('modalCloseBtn').dispatch('click');
    assert.equal(harness.authModal.classList.contains('show'), false);
    harness.loginButton.dispatch('click');
    harness.authModal.dispatch('click', { target: harness.authModal });
    assert.equal(harness.authModal.classList.contains('show'), false);
  }

  assert.match(indexHtml, /class="logo-link"/);
  assert.equal(authScript.includes("querySelector('.logo-link')"), false, 'non-auth logo navigation has no auth-modal handler');
  assert.match(authScript, /\/auth\/login/, 'the supported password route may exist alongside preserved OTP behavior');

  const invalidPasswordAttempt = await loadStaticAuth(authScript, {
    responses: [{ success: false, message: 'Invalid password.' }],
  });
  invalidPasswordAttempt.loginButton.dispatch('click');
  invalidPasswordAttempt.elements.get('passwordMobileNumber').value = '9876543210';
  invalidPasswordAttempt.elements.get('password').value = 'wrong-password';
  invalidPasswordAttempt.elements.get('passwordForm').dispatch('submit');
  await settle();

  assert.equal(invalidPasswordAttempt.requests.length, 1);
  assert.equal(invalidPasswordAttempt.requests[0].url, `${apiBaseUrl}/auth/login`);
  assert.equal(invalidPasswordAttempt.requests[0].options.credentials, 'include');
  assert.deepEqual(requestJson(invalidPasswordAttempt.requests[0]), { phone: '9876543210', password: 'wrong-password' });
  assert.equal(invalidPasswordAttempt.elements.get('passwordError').textContent, 'Invalid password.');
  assertUnauthenticated(invalidPasswordAttempt);
});
