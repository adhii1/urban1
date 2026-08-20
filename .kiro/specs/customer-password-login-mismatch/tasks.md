# Implementation Plan

- [x] 1. Write bug-condition exploration test
  - **Property 1: Bug Condition** - Legacy Password Route Is Reachable
  - **IMPORTANT**: Write and run this test against the unfixed served static artifact before changing product code; its expected-behavior assertions MUST fail to confirm the defect.
  - Model `isBugCondition(input)`: `input.entrypoint === 'customer frontend/index.html'`, `input.selectedLoginMethod === 'otp'`, OTP verification returns `Please use password login for this account.`, and the open modal has no reachable password credential form.
  - Use a scoped property-based test across the legacy `.btn-login`, `.cta-btn`, and `.btn-card` entry actions. For each directed-account OTP response, assert that the modal exposes an accessible password route and that valid credentials can complete `POST /api/v1/auth/login` with accepted cookies, the compatible legacy session, and `dashboard.html` navigation.
  - Run it on the unfixed static customer page. Record the counterexamples: `#authModal` only renders `#stepMobile`/`#stepOTP`, no password control/form is reachable, and `js/auth.js` cannot submit the password endpoint.
  - Do not exercise or treat the React portal as the affected surface.
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - OTP Flow and Legacy Session Continuity
  - **IMPORTANT**: Use observation-first methodology: capture behavior from the unfixed static page for inputs where `isBugCondition(input)` is false, then encode those observations as properties before implementation.
  - Generate OTP-eligible account responses with valid unexpired OTPs and assert the existing `POST /auth/verify-otp` request, `credentials: 'include'` cookie acceptance, legacy local identity/access-token values, modal close, and `dashboard.html` navigation.
  - Generate malformed, incomplete, incorrect, expired, and unverified OTP cases and assert the current validation/failure outcome remains, with no authenticated session or dashboard redirect.
  - Cover OTP resend, change-number navigation, six-box auto-advance/backspace, returning-user name visibility, modal close/backdrop behavior, and non-auth landing-page actions; verify they pass on unfixed code.
  - Include invalid-password responses as a non-bug input: observe the existing password endpoint failure contract and require no `isLoggedIn` flag or dashboard redirect.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix the legacy customer password-login mismatch
  - Scope all implementation to `customer frontend/index.html`, `customer frontend/js/auth.js`, and `customer frontend/css/modal.css`; do not modify the React portal or redesign backend authentication.

  - [x] 3.1 Add the reachable legacy password-login modal UI
    - In `customer frontend/index.html`, add an accessible OTP/password method choice and a password step/form with phone, password, submit, and actionable switch controls while retaining the existing mobile/name and OTP element identifiers and behavior.
    - Ensure every existing static entry action (`.btn-login`, `.cta-btn`, and `.btn-card` through `checkAuthAndProceed()`) opens the same modal with both methods reachable by pointer and keyboard.
    - In `customer frontend/css/modal.css`, add only the necessary consistent control, focus, loading/error, and responsive styles; do not alter the OTP-box layout or unrelated landing-page styles.
    - _Bug_Condition: `isBugCondition(input)` holds when the static OTP flow is directed to password login and no password form is reachable._
    - _Expected_Behavior: `result.passwordFormIsReachable = true`._
    - _Preservation: Existing mobile/name, OTP controls, modal behavior, and non-auth page actions remain unchanged._
    - _Requirements: 2.1, 3.1, 3.2, 3.3_

  - [x] 3.2 Integrate the password branch with the existing legacy success handoff
    - In `customer frontend/js/auth.js`, bind method controls and the password form during the existing initialization; validate required phone/password values and deliberately reset/switch modal state without issuing unintended OTP requests or retaining stale OTP authentication state.
    - When OTP verification returns the password-login direction, present the password route instead of only a dead-end instruction.
    - Submit `{ phone, password }` to `${API_BASE_URL}/auth/login` using `POST`, JSON content, and `credentials: 'include'`; retain the server's existing validation, rate limiting, password comparison, error contract, and cookie issuance.
    - Extract a compatible shared successful-login completion path for OTP and password responses: use `data.data.user` and `data.data.accessToken` to preserve `accessToken`, `userName`, `mobileNumber`, `isLoggedIn`, `userRole`, and `userId`; retain a refresh-token local value only when actually returned; then close the modal and redirect to `dashboard.html` only on success.
    - Keep credential/network failures unauthenticated and visible through the established error style. Preserve `POST /auth/send-otp`, `POST /auth/verify-otp`, OTP validation, resend, and customer authorization boundaries.
    - _Bug_Condition: OTP verification directs a static customer attempt to password login with no actionable credential route._
    - _Expected_Behavior: Valid credentials call `POST /api/v1/auth/login`, accept auth cookies, establish the compatible legacy session, and redirect to `dashboard.html`; invalid credentials do not authenticate or redirect._
    - _Preservation: OTP success and failure behavior, static session keys, cookie-based session handling, dashboard navigation, and backend endpoint policy remain unchanged._
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.3 Verify the bug-condition exploration test now passes
    - **Property 1: Expected Behavior** - Legacy Password Route Is Reachable
    - **IMPORTANT**: Re-run the same Property 1 test from task 1; do not write a replacement test.
    - For every scoped bug-condition input and legacy entry action, verify a reachable password form; valid credentials make the existing password request, accept server cookies, establish the static legacy session, and navigate to `dashboard.html`.
    - Verify invalid or missing password submissions remain unauthenticated and do not navigate.
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - OTP Flow and Legacy Session Continuity
    - **IMPORTANT**: Re-run the same Property 2 tests from task 2; do not write replacement tests.
    - Confirm OTP-eligible valid cases retain `POST /auth/verify-otp`, existing session/cookie completion, modal close, and dashboard navigation; invalid/expired/unverified OTP cases retain denial with no session or redirect.
    - Confirm resend, change-number, OTP-box interaction, returning-user display, modal close/backdrop, and non-auth controls retain the observed baseline behavior.
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the focused static-customer exploration, preservation, unit, and integration checks against the served `customer frontend/index.html` artifact at desktop and mobile widths.
  - Confirm no product-code changes occurred outside `customer frontend/index.html`, `customer frontend/js/auth.js`, and `customer frontend/css/modal.css` unless separately approved for an authorization issue.
  - Ensure all tests pass and ask the user if questions arise.
