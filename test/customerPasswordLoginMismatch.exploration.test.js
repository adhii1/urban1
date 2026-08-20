const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const fc = require('fast-check');

const customerFrontendDirectory = path.resolve(__dirname, '../customer frontend');
const directedOtpMessage = 'Please use password login for this account.';
const entryActions = ['.btn-login', '.cta-btn', '.btn-card'];

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

function hasClassEntryAction(html, entryAction) {
  const className = entryAction.slice(1);
  return new RegExp(`class=["'][^"']*\\b${className}\\b`).test(html);
}

function inspectDirectedAccountFlow(indexHtml, authScript, entryAction) {
  const modal = indexHtml.match(/<div class="modal-overlay" id="authModal">([\s\S]*?)<\/div>\s*<\/div>\s*<!-- Global App Logic -->/);
  const modalMarkup = modal?.[1] || '';
  const hasPasswordInput = /<input[^>]+type=["']password["']/i.test(modalMarkup);
  const hasPasswordForm = /<form[^>]+(?:id|class)=["'][^"']*password/i.test(modalMarkup);
  const hasPasswordMethodControl = /<(?:button|a|input)[^>]+(?:password|login-method)/i.test(modalMarkup);
  const usesEntryActionSelector = entryAction === '.btn-card'
    ? authScript.includes("document.querySelectorAll('.btn-card')")
    : authScript.includes(`document.querySelector('${entryAction}')`);

  return {
    entryAction,
    directedOtpMessage,
    modalExists: Boolean(modal),
    entryActionOpensLegacyModal: hasClassEntryAction(indexHtml, entryAction)
      && usesEntryActionSelector
      && authScript.includes('checkAuthAndProceed()'),
    renderedSteps: [...modalMarkup.matchAll(/id="(step[A-Za-z]+)"/g)].map((match) => match[1]),
    hasReachablePasswordCredentialForm: hasPasswordInput && hasPasswordForm && hasPasswordMethodControl,
    submitsPasswordEndpoint: /\/auth\/login/.test(authScript),
    usesCredentialCookies: /credentials:\s*['"]include['"]/.test(authScript),
    establishesLegacySession: /localStorage\.setItem\(['"]isLoggedIn['"],\s*['"]true['"]\)/.test(authScript),
    redirectsToDashboard: /window\.location\.href\s*=\s*['"]dashboard\.html['"]/.test(authScript),
  };
}

// Feature: customer-password-login-mismatch, Property 1: Bug Condition - Legacy Password Route Is Reachable
// **Validates: Requirements 1.1, 2.1, 2.2**
test('exploration Property 1: every static legacy entry action exposes a password route for OTP-directed accounts', async (t) => {
  const staticServer = await serveStaticCustomerFrontend();
  t.after(staticServer.close);

  const [indexResponse, authResponse] = await Promise.all([
    fetch(`${staticServer.baseUrl}/index.html`),
    fetch(`${staticServer.baseUrl}/js/auth.js`),
  ]);
  assert.equal(indexResponse.status, 200);
  assert.equal(authResponse.status, 200);

  const [indexHtml, authScript] = await Promise.all([indexResponse.text(), authResponse.text()]);

  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...entryActions), async (entryAction) => {
      const result = inspectDirectedAccountFlow(indexHtml, authScript, entryAction);

      assert.equal(result.entryActionOpensLegacyModal, true, `${entryAction} must open the shared legacy modal`);
      assert.equal(result.modalExists, true, 'the served static page must render #authModal');
      assert.equal(
        result.hasReachablePasswordCredentialForm,
        true,
        `${entryAction} is a dead end for an OTP-directed account (${directedOtpMessage}): `
          + `rendered steps are ${result.renderedSteps.join(', ') || 'none'}, with no reachable password control/form`
      );
      assert.equal(result.submitsPasswordEndpoint, true, 'valid credentials must invoke POST /api/v1/auth/login');
      assert.equal(result.usesCredentialCookies, true, 'password authentication must accept server cookies');
      assert.equal(result.establishesLegacySession, true, 'password authentication must establish the legacy session');
      assert.equal(result.redirectsToDashboard, true, 'password authentication must navigate to dashboard.html');
    }),
    { numRuns: entryActions.length, endOnFailure: true }
  );
});
