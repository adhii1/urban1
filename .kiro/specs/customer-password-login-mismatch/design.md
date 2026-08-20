# Customer Password Login Mismatch Bugfix Design

## Overview

The affected customer sign-in surface is the static legacy landing page at `customer frontend/index.html`, not the React customer portal. That page loads `css/style.css`, `css/modal.css`, and `js/auth.js`; its authentication modal currently contains only a mobile/name step and an OTP-verification step. Consequently, when the backend directs an account to password login, the visible customer UI offers no way to enter a password and the account is blocked.

The fix will add a reachable password-login alternative to this legacy HTML/JavaScript/CSS modal. It will reuse the existing `POST /api/v1/auth/login` credential endpoint and its cookie/session response contract where compatible, then complete the same legacy customer success handoff used after OTP verification: persist the returned customer identity/token data expected by the static frontend, mark the legacy session as logged in, close the modal, and redirect to `dashboard.html`. The existing OTP send, resend, input, verification, validation, and failure behavior remain intact.

This design intentionally does not make the React portal (`client/app/customer/(marketing)/page.tsx`) the implementation target. It may be checked only as a separate surface if needed; it is not the page confirmed to reproduce this defect.

## Glossary

- **Bug_Condition (C)**: A legacy customer modal login attempt that receives the backend password-login direction while the rendered legacy modal has no reachable password credential path.
- **Property (P)**: The desired result for C: the legacy customer modal exposes a password path and valid credentials establish the existing customer session and reach `dashboard.html`.
- **Preservation**: Existing OTP send/verify behavior, OTP failure behavior, static-frontend session keys, and dashboard navigation that must not change.
- **Legacy customer entrypoint**: `customer frontend/index.html`, the confirmed affected landing page that defines the authentication modal and loads `js/auth.js`.
- **Legacy auth controller**: `customer frontend/js/auth.js`, which opens/resets the modal, sends and verifies LOGIN OTPs, writes legacy session values to `localStorage`, and redirects successful users to `dashboard.html`.
- **Legacy modal stylesheet**: `customer frontend/css/modal.css`, which styles the modal steps, form controls, and responsive modal layout.
- **Password login endpoint**: `POST /api/v1/auth/login` (registered as `POST /auth/login` beneath the API base URL), which accepts `{ phone, password }`, applies existing validation/rate limiting, establishes authentication cookies, and returns user data plus an access token.
- **Session contract**: The successful-authentication contract already used by the static frontend: `credentials: 'include'` receives the server-set auth cookies; the client uses `data.data.user` and `data.data.accessToken` to maintain its existing local `accessToken`, user identity/role, `isLoggedIn`, and `dashboard.html` redirect behavior.

## Bug Details

### Bug Condition

The bug manifests when a user starts from the legacy customer page, follows its only visible mobile/OTP flow, and the completed OTP verification returns the backend instruction to use password login. `index.html` renders only `#stepMobile` and `#stepOTP`, and `auth.js` handles only those two form submissions. Since neither a password form nor a mode-switch control exists, the instruction cannot be acted on in the affected UI.

Let `C(X)` denote the set of legacy customer authentication attempts for which the OTP verification result directs the user to password login and no password form is reachable from the open modal.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type LegacyCustomerLoginAttempt
  OUTPUT: boolean

  RETURN input.entrypoint = 'customer frontend/index.html'
         AND input.selectedLoginMethod = 'otp'
         AND input.otpVerificationResult.message = 'Please use password login for this account.'
         AND NOT input.modal.hasReachablePasswordCredentialForm
END FUNCTION
```

### Examples

- A user clicks **Login / Sign Up** on `customer frontend/index.html`, submits a mobile number, enters a valid six-digit LOGIN OTP, and receives “Please use password login for this account.” Actual behavior: only OTP controls remain available, so the user cannot sign in. Expected behavior: the modal offers a password method where the user can submit their phone and password.
- A user starts from either the hero **Book Your Commute Pass** control or a commute-card action, both of which call `checkAuthAndProceed()` in `js/auth.js`. Actual behavior: each opens the same OTP-only modal. Expected behavior: each opens the same modal with a reachable password-login choice as well as the preserved OTP flow.
- A user who is eligible for customer OTP login enters a valid OTP. Expected behavior: `auth.js` continues calling `POST /auth/verify-otp`, establishes the current legacy session values, and redirects to `dashboard.html` without requiring a password.
- A user submits an incorrect, expired, incomplete, or unverified OTP. Expected behavior: the existing alert/error outcome is retained and no authenticated session or dashboard redirect occurs.

## Expected Behavior

### Expected Result

The correct behavior for the bug condition is a usable credential route within the confirmed legacy modal. The route must reuse the password endpoint and the current static frontend’s successful-login contract rather than create a parallel client session.

**Formal Specification:**
```
FUNCTION expectedBehavior(result)
  INPUT: result of a legacy customer password-login attempt
  OUTPUT: boolean

  RETURN result.passwordFormIsReachable = true
         AND (result.credentialsAreValid IMPLIES
              result.endpoint = 'POST /api/v1/auth/login'
              AND result.authenticated = true
              AND result.authCookiesAccepted = true
              AND result.legacySessionEstablished = true
              AND result.redirectPath = 'dashboard.html')
         AND (NOT result.credentialsAreValid IMPLIES
              result.authenticated = false
              AND result.redirectPath != 'dashboard.html')
END FUNCTION
```

### Preservation Requirements

**Unchanged Behaviors:**
- Customer accounts already eligible for the legacy OTP path must continue to authenticate only after successful `POST /auth/verify-otp` verification, satisfying Requirement 3.1.
- Invalid, expired, incomplete, and unverified OTP values must continue to be denied with the current OTP-validation failure behavior and without a session, satisfying Requirement 3.2.
- Successful legacy OTP authentication must continue to accept auth cookies through `credentials: 'include'`, persist the existing local session/user values consumed by `js/app.js`, close the modal, and redirect to `dashboard.html`, satisfying Requirement 3.3.
- Existing OTP resend, change-number navigation, six-box auto-advance/backspace behavior, mobile/name behavior, and all non-auth page actions remain unchanged.
- The backend password endpoint, credential validation, rate limiting, password comparison, and cookie issuance remain unchanged; this is a legacy-customer UI integration fix, not an authentication-protocol redesign.

**Scope:**
All inputs that do **not** satisfy `isBugCondition` must be unaffected. This includes:
- Existing OTP send, resend, and verify requests for accounts that can use customer OTP login.
- Malformed, incorrect, expired, or incomplete OTP submissions.
- Other landing-page controls, modal close/backdrop behavior, and protected-page checks in `js/app.js`.
- Invalid password submissions, which must continue to use the existing endpoint failure contract and remain unauthenticated.

## Hypothesized Root Cause

Based on the confirmed page and code inspection, the defect is a frontend/channel mismatch rather than a defect in OTP entry handling:

1. **OTP-only legacy modal**: `customer frontend/index.html` defines only `#stepMobile` and `#stepOTP` inside `#authModal`.
   - The page has no password input, password form, or control to choose a login method.
   - `css/modal.css` styles phone and OTP controls but has no password-route-specific visual treatment because the associated markup is absent.

2. **Legacy controller has no credential branch**: `customer frontend/js/auth.js` maps the mobile form to `/auth/send-otp` and the OTP form to `/auth/verify-otp`.
   - Its reset state tracks returning users and name visibility but always returns to the mobile/OTP path.
   - It has no listener that submits `{ phone, password }` to the existing login endpoint or turns the backend direction into an accessible modal state.

3. **Existing backend already provides a compatible login contract**: `routes/v1/authRoutes.js` exposes `/auth/login`; `authController.login` calls `authService.login`, sets the same auth cookies, and returns `{ user, accessToken }` inside the standard response data.
   - The legacy page’s OTP success path already uses `credentials: 'include'`, `data.data.user`, `data.data.accessToken`, local session keys, and `dashboard.html` redirection.
   - A password success handler can share that compatible handoff without creating a new endpoint, storing cookie values directly, or changing the server session protocol.

4. **Session data handling needs contract-aware reuse**: The current legacy OTP handler attempts to persist a refresh token, while the inspected controller explicitly returns only an access token in the response body and supplies refresh authentication by cookie.
   - The implementation should use returned fields where present and preserve the existing static frontend’s required local identity/access-token keys and cookie-based session behavior.
   - It must not invent a different React-store handoff, change cookie policy, or use the password form to bypass authorization constraints. If the affected accounts are not valid customer-portal users after successful password authentication, that is a separate authorization issue to resolve explicitly.

## Correctness Properties

Property 1: Bug Condition - Legacy Password Route Is Reachable

_For any_ legacy customer login attempt where the bug condition holds (`isBugCondition` returns true), the fixed `index.html`/`auth.js` modal SHALL expose a reachable password credential form and, when valid required credentials are submitted, call the existing password login endpoint, establish the compatible legacy customer session, and redirect to `dashboard.html`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - OTP Flow and Legacy Session Continuity

_For any_ legacy customer login attempt where the bug condition does NOT hold (`isBugCondition` returns false), the fixed static customer flow SHALL produce the same result as the original flow, preserving successful OTP authentication for eligible accounts, existing denial behavior for invalid/expired/unverified OTPs, and the established authenticated customer session after successful OTP login.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is confirmed during implementation, changes are limited to the confirmed static customer frontend. The existing server endpoint/session contract is reused rather than modified.

**Primary files:**
- `customer frontend/index.html`
- `customer frontend/js/auth.js`
- `customer frontend/css/modal.css`

**Backend contract to reuse and verify, not redesign:**
- `routes/v1/authRoutes.js`
- `controllers/authController.js`
- `services/authService.js`

**Specific Changes:**
1. **Add a reachable login-method choice to the legacy modal markup**: Extend `#authModal` in `index.html` with an explicit, pointer- and keyboard-accessible OTP/password method control and a password-login form/step containing phone and password inputs plus a submit action.
   - The control must be available when the modal opens from `.btn-login`, `.cta-btn`, or any `.btn-card`; these all already route through `checkAuthAndProceed()`.
   - The existing mobile/name and OTP elements retain their identifiers and semantic behavior so OTP wiring is not disrupted.

2. **Add minimal modal styling for the new legacy password UI**: Extend `modal.css` only as needed to make the login-method control, password field, focus states, error/loading state, and mobile layout consistent with the existing modal.
   - Reuse established modal/form variables and responsive behavior.
   - Do not alter OTP box layout, OTP active-step behavior, or unrelated landing-page styles.

3. **Add a password branch to `auth.js`**: Bind the new legacy password form and method controls during the existing `DOMContentLoaded` initialization.
   - Reuse the modal’s existing phone-number conventions; require a password before submission.
   - Reset/switch steps deliberately so moving between OTP and password methods does not trigger an OTP request, lose required modal close behavior, or leave stale OTP data as an authentication result.
   - If OTP verification returns the password-login direction, present an actionable switch to the password route rather than only showing the dead-end message.

4. **Reuse `POST /auth/login` and its existing response/cookie contract**: Submit JSON `{ phone, password }` to `${API_BASE_URL}/auth/login` with `method: 'POST'`, `Content-Type: 'application/json'`, and `credentials: 'include'`.
   - Keep the server’s existing request validation, auth rate limiter, password comparison, error response, and `setAuthCookies` behavior intact.
   - Do not modify `verifyOtp` to accept rejected OTPs, introduce a second password endpoint, or send passwords through OTP endpoints.

5. **Centralize compatible legacy post-login completion**: Factor the existing OTP-success finalization into a shared legacy success handler used by OTP and password success responses where their returned fields are compatible.
   - Preserve the static app’s `localStorage` values for `accessToken`, `userName`, `mobileNumber`, `isLoggedIn`, `userRole`, and `userId`, using `data.data.user` and `data.data.accessToken` from the established response shape.
   - Continue accepting server-set access/refresh cookies through `credentials: 'include'`; only retain a refresh-token local value if the response actually supplies one, rather than assuming a new body field.
   - Close the modal and redirect to `dashboard.html` only after successful authentication; credential failures and network failures must leave the user unauthenticated and show the established user-facing error style.

6. **Verify portal authorization without broadening it**: Confirm that an account guided to password login is permitted to use the customer dashboard after successful credential authentication.
   - The generic endpoint’s returned role must not be ignored to create a cross-portal login bypass.
   - Any required server-side role-policy change is outside this UI-focused fix unless separately scoped and approved.

## Testing Strategy

### Validation Approach

Testing follows two phases: first demonstrate the missing password route in the confirmed static `customer frontend/index.html` flow, then verify the password route works for every bug-condition input while OTP behavior and the legacy session handoff are unchanged. Tests must target the served static legacy artifact, not only the React customer portal.

### Exploratory Bug Condition Checking

**Goal**: Surface the pre-fix counterexample and confirm the problem is the absent legacy password route rather than OTP-input behavior or a React-only concern.

**Test Plan**: Load the static customer `index.html`, open the auth modal from each entry action, use an account/response that receives the password-login direction during OTP verification, and inspect the rendered modal and available requests. Run these checks on the unfixed legacy flow before implementing the UI addition.

**Test Cases**:
1. **OTP-directed legacy modal test**: From **Login / Sign Up**, submit a valid OTP that receives the password-login direction and verify no password credential form is reachable on unfixed code (will fail the expected behavior on unfixed code).
2. **All legacy-entrypoint reachability test**: Open the modal from the login button, hero CTA, and each commute-card button; verify the same modal currently exposes only mobile/OTP steps and, after the fix, exposes the password route from all of them (will fail on unfixed code).
3. **Credential completion test**: Select the password method, submit valid affected-account credentials, and verify `POST /auth/login`, accepted cookies, legacy session values, and `dashboard.html` navigation (will fail on unfixed code because no form exists).
4. **Invalid-password edge test**: Submit a valid phone with an invalid or missing password and verify the existing endpoint error is presented with no `isLoggedIn` flag or dashboard redirect (may reveal state leakage).

**Expected Counterexamples**:
- The rendered `#authModal` has only `#stepMobile` and `#stepOTP` and no password credential control.
- `auth.js` sends only `/auth/send-otp` and `/auth/verify-otp` requests, so the backend’s password instruction is not actionable.
- A successful credential response cannot currently reach the legacy local-session/dashboard completion path.

### Fix Checking

**Goal**: Verify that every input satisfying the bug condition produces the desired legacy password-login behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  modal := openLegacyCustomerModal(input.entryAction)
  ASSERT modal.hasReachablePasswordCredentialForm = true

  result := submitPasswordLogin_fixed(input.phone, input.validPassword)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that all inputs outside the bug condition retain their observable original behavior.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT observableLegacyBehavior_original(input) = observableLegacyBehavior_fixed(input)
END FOR
```

**Testing Approach**: Use property-based tests for OTP variations, modal-state transitions, and success/failure response combinations. Capture the current static flow’s endpoint calls, session storage changes, alerts/errors, and redirects, then require the same outcomes after the password alternative is added.

**Test Cases**:
1. **OTP success preservation**: For OTP-eligible customer accounts and valid unexpired OTPs, verify `POST /auth/verify-otp` remains the request, accepted auth cookies and existing local session values are established, and `dashboard.html` is reached.
2. **OTP failure preservation**: For malformed, incorrect, expired, and unverified OTPs, verify the current failure message/alert remains and no session values or dashboard redirect are produced.
3. **OTP interaction preservation**: Verify resend, change-number, six-box auto-advance/backspace, returning-user name visibility, and modal close/backdrop actions behave as before.
4. **Legacy session preservation**: Verify a successful OTP login and a successful password login each use accepted cookies plus the same required legacy local identity/access-token values that `js/app.js` checks before dashboard access.

### Unit Tests

- Test that the static modal renders an accessible OTP/password selector and password form from every initial and reset state.
- Test password-form validation and the exact `POST /auth/login` payload/options, including `credentials: 'include'`.
- Test the shared legacy success handler for compatible OTP/password responses, expected `localStorage` values, modal close, and `dashboard.html` redirect.
- Test that OTP send, verification, resend, change-number, incomplete OTP validation, and OTP failure behavior are unchanged.

### Property-Based Tests

- Generate valid directed-account credential attempts across legacy entry actions and verify a reachable password path invokes the established password endpoint and creates the expected session only after valid success responses.
- Generate valid, malformed, incorrect, and expired OTP cases for OTP-eligible accounts and verify only valid OTP responses authenticate, matching the pre-fix static flow.
- Generate login-method switches, modal opens/closes, and API success/failure responses to verify no non-bug input creates an unintended endpoint call, session, or redirect.

### Integration Tests

- Test the complete static customer journey from `customer frontend/index.html`: open every auth entry action, select password login, submit valid affected-account credentials, accept the server session cookies, and reach `dashboard.html`.
- Test the existing static OTP journey end-to-end after the change, including valid OTP success, invalid/expired OTP denial, resend, and change-number behavior.
- Test protected legacy pages with the resulting session to confirm the unchanged `js/app.js` `isLoggedIn` check and dashboard navigation behavior.
- Test the served legacy HTML/CSS/JS artifact—not the React portal alone—to confirm the password route is visible, operable, and styled correctly on desktop and mobile widths.
