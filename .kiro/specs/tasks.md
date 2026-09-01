# Implementation Plan

## Overview

Ordering follows the design's sections A–H: prerequisites first, then the exploration and
preservation tests that must run against the **unfixed** code, then shared modules before their
consumers, then the surfaces, then the contract assertions and the full verification sweep. Scope
covers the three defect families — rider identity, the boarding OTP, and mounted-but-unwired server
capability — plus the **unified upcoming view** that merges subscription/booking trips and on-demand
Flexy rides into one chronological list carrying each journey's own boarding code (2.20–2.22).

**Blocking legend**

- `[BLOCKED: client-install]` — cannot start before task 1.2 (`npm --prefix client install`) **and**
  task 1.3 (Next 16 guides read). Every task that writes a file under `client/` carries this tag.
- `[BLOCKED: doc-serving-approval]` — cannot start before the user approves design Decision 2 in
  section F (authenticated owner-or-Admin serving vs a public `/uploads` mount). Task 13.1 is that
  gate.

**Baseline every verification compares against** (confirmed against a clean `git archive HEAD`,
design Testing Strategy):

| Command | Baseline |
|---|---|
| `npm run check:contract` | passes |
| `npm run test:unit` | passes |
| `npm run test:integration` | **14 pre-existing failures** (Subscription validation: `pickupTime` / `subscriptionType` / coordinates required) |
| `npm run check:startup` | **1 pre-existing failure** (Socket.IO browser client) |
| `client`: `tsc --noEmit`, `npm run lint`, `next build` | **not runnable today** — no baseline until task 1.2 |

Never chase the 14 + 1 known failures. A run is green when the failure set and count match the
table above exactly.

---

## Tasks

- [ ] 1. Prerequisites — environment, client dependencies, Next 16 guides

  **No task below task 1 may start before all three sub-tasks are done. No task that writes a file
  under `client/` may start before 1.2 and 1.3.**

  - [x] 1.1 Create a local backend env so any test run can connect
    - No `.env.dev` exists in this clone; copy `.env.example` to `.env` at the repo root
    - Set `MONGODB_URI`, `JWT_SECRET` and `REFRESH_SECRET` to local development values
    - Confirm `node -e "require('./config/config')"` loads without throwing
    - Confirm the baseline with `npm run check:contract` (expect pass) and `npm run test:unit`
      (expect pass) before changing any source file
    - _Requirements: 3.14_

  - [x] 1.2 Install the client dependencies
    - Run `npm --prefix client install` from the repo root
    - `client/node_modules` is absent today, which is why `tsc --noEmit`, `npm run lint` and
      `next build` cannot run and why the Next 16 docs cannot be read
    - Record the baseline for the client half immediately after install by running
      `npm --prefix client exec tsc -- --noEmit`, `npm --prefix client run lint` and
      `npm --prefix client run build` on the **unmodified** tree, so later runs have something to
      compare against
    - _Requirements: 3.14_

  - [ ] 1.3 Read the Next 16.2.10 guides named in design section H
    - `client/AGENTS.md` is authoritative: this is Next **16.2.10** with React **19.2.4** and pre-16
      App Router conventions must not be assumed
    - Read the relevant guides under `client/node_modules/next/dist/docs/` and confirm, in writing,
      each area design section H flags:
      - server vs client component boundaries and current `'use client'` directive placement — every
        new component in section D is interactive (clipboard, focus trap, react-query)
      - data fetching and caching: that `@tanstack/react-query` on the client remains the sanctioned
        pattern and that no default caching applies to the client-side `fetch` in
        `client/lib/api/client.ts`
      - how `params` is passed on the `client/app/customer/(dashboard)/rides/[rideId]/page.tsx`
        route (it became a Promise in 15) before touching that page
      - the current `next/link` API and client-navigation behaviour, needed by
        `RiderName variant="own"`
    - Do not "fix" the marketing page's raw `<img>` to `next/image`; it is out of scope
    - _Requirements: 3.14_

---

- [ ] 2. Write bug condition exploration test
  - **Property 1: Bug Condition** - Identity, Boarding Code and Wiring Are Correct Under C
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after
    implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug and confirm (or refute) each root
    cause in the design's Hypothesized Root Cause section
  - **Scoped PBT Approach**: these defects are deterministic, so scope each property to the concrete
    failing input (a specific phone, a seeded `User 3210` customer, a specific route literal) for
    reproducibility; the broad generated domains belong to tasks 3, 5, 11
  - Create `test/clientPortalIdentityAndOtp.exploration.test.js` using `node --test` with
    `mongodb-memory-server`, following the shape of
    `test/customerOtpAccountRoleCorrection.exploration.test.js`
  - Register it in `package.json` under `test:integration` (it is DB-backed)
  - Implement the nine cases from the design's Exploratory Bug Condition Checking, each with a
    failure message naming the defect and the file:line:
    1. **Blank name at sign-up is refused** — `authService.verifyOtp(phone, otp, 'LOGIN', '')` for an
      unseen phone throws 400 and creates no `Customer`. Expect FAIL today: it succeeds and persists
      `User <last4>` (`services/authService.js:145-147`)
    2. **Supplied name replaces a placeholder** — seed a `Customer` named `User 3210`, then
      `verifyOtp(..., name: 'Priya Sharma')`; stored name is `Priya Sharma`. Expect FAIL: the
      existing-user branch (`services/authService.js:148-153`) discards it
    3. **Name is correctable through the profile endpoint** — `PUT /api/v1/customer/profile` with
      `{ name: 'Priya Sharma' }` returns 200 and persists. Expect FAIL: `name` is not destructured
      (`controllers/customerController.js:227`) so the response echoes the old name back — success
      shaped like success
    4. **No fabricated label in any payload** — create a trip and a ride for a customer with no
      resolvable name, serialize through `utils/tripView.js`, `services/shuttleMatchingService.js`
      and `services/shuttleLifecycleService.js`, and assert no emitted value equals `Unknown`,
      `Passenger`, `Customer` or `Rider` in a rider-identity position. Expect FAIL at
      `services/shuttleMatchingService.js:46,90`, `services/shuttleLifecycleService.js:57`,
      `sockets/customerEvents.js:37,159`
    5. **Mounted routes have client callers** — fs+regex scan of `client/lib/hooks/**` for
      `PUT /api/v1/driver/trips/status`, `GET /api/v1/rides/my`, `GET /api/v1/rides/active`,
      `GET /api/v1/wallet`, `POST /api/v1/wallet/add`. Expect FAIL: all five have zero callers
    6. **`matchedDrivers` withheld from the customer** — the customer ride projection in
      `controllers/rideController.js` (`getMyRides`, `getRideById`, `getActiveRide`) omits
      `matchedDrivers` while retaining `otp.code` and `acceptedDriverId`. Expect FAIL: all three
      return it
    7. **Upload path exists and the recorded URL resolves** — `config.uploads.documentsPath` is
      absolute and exists after `middleware/uploadMiddleware.js` loads, and the URL
      `controllers/documentController.js` records is served by a route mounted on `app`. Expect FAIL
      on both counts: `config/config.js:132` is the relative, absent `'src/uploads'` and `app.js`
      mounts no `/uploads`
    8. **Edge case — a deliberately-set name is never clobbered** — seed `Priya Sharma`, sign in
      supplying `Someone Else`; stored name is still `Priya Sharma`. **Expected to PASS today**
      (the unfixed branch discards every supplied name) and it MUST keep passing after the fix —
      this is where an over-broad overwrite rule would break 3.1
    9. **Both journey sources appear under Upcoming, with both codes** — seed one customer with a
      `SCHEDULED` subscription `Trip` carrying `passengers[i].otp.code` and one `ACCEPTED` on-demand
      `RideRequest` carrying `otp.code`. Fetch `GET /api/v1/customer/trips` and `GET /api/v1/rides/my`
      as that customer, run both payloads through the merge specified in design section C item 11b,
      and assert the result contains **both** journeys, in ascending time order, with distinct
      `source: 'SUBSCRIPTION' | 'ON_DEMAND'` discriminators and both boarding codes present. Expect
      FAIL today on the client half: nothing under `client/` calls `/rides/my`
      (`client/app/customer/(dashboard)/my-trips/page.tsx` reads only `useCustomerTrips`), so the
      on-demand half of the merge does not exist, and the `upcoming` filter at
      `client/app/customer/(dashboard)/my-trips/page.tsx:108` would exclude the `ACCEPTED` ride even
      if it did. The two server halves of the fixture pass, which localises the defect to the client —
      that is the point of asserting it here
  - Keep the four permanent `contractCheck.js` sections out of this task. They land in task 15 after
    the fix, so `npm run check:contract` (and therefore `pretest`) stays at its passing baseline
    while the exploration test is red. Cases 5, 6 and 7 above are the exploration-phase equivalents
    and need no server and no browser beyond the in-process `app`
  - Run `npm run test:integration` on UNFIXED code
  - **EXPECTED OUTCOME**: cases 1–7 and 9 FAIL, case 8 PASSES, and the 14 known Subscription failures
    are unchanged
  - Document every counterexample found (e.g. `Customer.name === 'User 3210'` after a blank-name
    sign-up; `PUT /customer/profile` → 200 with the name unchanged) and note whether it confirms or
    refutes the matching root cause
  - Mark complete when the test is written, run, and the failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.13, 1.18, 1.19, 1.20, 2.1, 2.2, 2.3, 2.4, 2.5, 2.13, 2.14, 2.17, 2.19, 2.20, 2.21_

---

- [ ] 3. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Behaviour Outside the Bug Condition Is Byte-Identical
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code for inputs where
    `isBugCondition` is false, record the actual outputs, then assert those recorded outputs
  - Create `test/clientPortalIdentityAndOtp.preservation.test.js`, `fast-check` generators following
    `test/tripGenerator.property.test.js`, and register it in `package.json` under
    `test:integration` (the profile, admin and controller cases are DB-backed)
  - Implement the ten cases from the design's Preservation Checking:
    1. **Real names survive verbatim (3.1)** — property over arbitrary non-placeholder stored names:
      signing in supplying any other name leaves the stored name unchanged
    2. **Placeholder predicate is exactly `/^User \d{4}$/` (3.1, 3.4)** — property over generated
      strings plus the explicit negatives `'User 12345'`, `'User 123'`, `'user 1234'`,
      `'Users 1234'`, `'User  1234'`, `'User 1234 '`, `'Priya User 1234'`, and unicode names
    3. **Location-only profile updates are unchanged (3.3)** — property over valid and invalid
      `homeLocation` / `pickupLocation` / `dropLocation` bodies with **no** `name` key: identical
      status, identical `ValidationError` messages, identical persisted document. Record the exact
      messages from `controllers/customerController.js` on unfixed code and assert them literally
    4. **Admin-created names are untouched (3.4)** — property over admin-created customers with
      explicit names: no path rewrites them
    5. **OTP disclosure scoping, asserted not assumed (2.13, 3.5, 3.6, 3.7)** — `fast-check`
      generates a shared trip with 2–8 passengers each holding a distinct code, plus an arbitrary
      viewer:
      - `viewer: 'customer'` with `customerId = P_i` ⇒ `myEntry.otp.code === code_i`, and for every
        `j != i`, `passengers[j].otp.code === undefined` with `passengers[j].otp.verified` present
      - `viewer: 'driver'` and `viewer: 'admin'` ⇒ every `passengers[k].otp.code` is present
      - **deep-scan the entire serialized customer view** for any `code_j` where `j != i` — walk
        every key and array element, not only the fields expected to carry a code, so a leak through
        a newly added key fails the property. This is the specific mechanism requirement 2.13 asks
        for
      - run the same property at the controller level with two customers in the store against
        `getMyRides` / `getRideById` / `getActiveRide`: customer A can never retrieve B's ride or
        code by id
    6. **Verification still rejects a wrong code (3.8)** — property over wrong codes: `verify-otp`
      and manifest `board` both reject and the passenger is not boarded
    7. **Existing PATCH guards hold (3.9)** — completion is still refused while a boarded passenger
      is undropped; `updateTripStatus` is not modified by this work and the test pins that
    8. **Legacy trip aliases survive (3.15)** — `manifest`, `tripDate`, `legacyStatus` and `myEntry`
      keep the shapes both static frontends read; `contractCheck.js` sections 3 and 5 keep passing
    9. **Static-frontend returning-user sign-in still works (3.15)** — `verifyOtp` with `name: ''`
      for an **existing** customer succeeds and leaves the stored name alone. This is the exact trap
      at `customer frontend/js/auth.js:150`, which hides the name field and posts `name: ''` for a
      returning user, so the new-signup name requirement must apply only to the account-creation
      branch
    10. **Subscription-only customers see today's list, and the booking response keeps its shape
      (3.16, 3.17)** — two parts, both aimed at the merge introduced for 2.20:
      - Property over customers holding only subscription trips and **no** on-demand rides: the merged
        upcoming list produced by `client/lib/hooks/useUpcomingJourneys.ts` (task 8.8) equals the
        pre-fix `useCustomerTrips`-only list **element for element and in the same order**, with the
        filter tabs and pagination behaviour of
        `client/app/customer/(dashboard)/my-trips/page.tsx` unchanged. An on-demand source
        contributing zero rows must be a no-op, never a reordering. Record the pre-fix list from the
        unfixed `my-trips` filter at :108 and assert against that recording
      - `GET /api/v1/booking` keeps returning the primary subscription **flattened at the top level**
        *and* `data.subscriptions`, asserted directly on the response shape from
        `controllers/bookingController.js:135-160`, because
        `client/app/customer/(dashboard)/subscribe/page.tsx:170` reads that flattened form after a
        purchase and the task 9.9 change to that page is render-only
  - Also pin, in the same file, that password sign-in and the non-customer OTP redirect are
    untouched (3.12, 3.13) and that subscription purchase / pause / cancel / relocate and the
    customer ride-request socket path behave as recorded (3.10, 3.11)
  - Run `npm run test:integration` on UNFIXED code
  - **EXPECTED OUTCOME**: all preservation cases PASS (this is the baseline behaviour to preserve),
    with the 14 known Subscription failures unchanged
  - Mark complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.15, 3.16, 3.17_

---

- [ ] 4. Section A — `utils/riderIdentity.js`, the single source of truth

  - [ ] 4.1 Create `utils/riderIdentity.js`
    - Export `PLACEHOLDER_NAME_PATTERN = /^User \d{4}$/`, `isPlaceholderName(name)`,
      `isRealName(name)`, `resolveRiderName(ref)` and
      `shouldAdoptSuppliedName(storedName, suppliedName)`
    - Trim before matching; `''` and `null` are **absent**, not placeholders
    - `resolveRiderName` returns `string | null` and never a label; it accepts a populated object, a
      bare `ObjectId`, `null` and `undefined`
    - `shouldAdoptSuppliedName` is a pure two-argument function — true iff `isRealName(supplied)` and
      not `isRealName(stored)` — so Property 3 can be tested without a database
    - Nothing else in the codebase may contain the placeholder regex or a name fallback literal
    - _Bug_Condition: `isIdentityBug(input)` — fabricated label reaches a surface / no owner for "is
      this a real name?"_
    - _Expected_Behavior: `resolveRiderName` returns a real name or `null`, never a label_
    - _Preservation: `null`-return contract of `utils/tripView.js` `displayName()`_
    - _Requirements: 2.5, 3.2_

  - [ ] 4.2 Delegate `utils/tripView.js` `displayName()` to `resolveRiderName`
    - `displayName()` becomes a thin delegation; its signature, its `null` return and every key
      `toTripView` emits stay exactly as they are
    - Both static frontends and `contractCheck.js` sections 3 and 5 depend on those keys
    - _Preservation: 3.2, 3.15 — no emitted key changes_
    - _Requirements: 2.5, 3.2, 3.15_

  - [ ] 4.3 Add `test/riderIdentity.unit.test.js` and register it under `test:unit`
    - Cover `isPlaceholderName`, `isRealName`, `shouldAdoptSuppliedName`, `resolveRiderName` across
      empty, whitespace, placeholder-shaped, near-miss (`'User 12345'`, `'User abcd'`,
      `'Users 1234'`, `'user 1234'`) and unicode inputs
    - Cover `displayName()` after delegation: identical return contract including `null` for a
      missing, empty or whitespace name
    - No DB, so this belongs in `test:unit`
    - _Requirements: 2.5, 3.1, 3.2, 3.4_

- [ ] 5. Property test for the overwrite rule
  - **Property 3: Fix Checking** - Placeholder Overwrite Is Exactly Scoped
  - `fast-check` property over arbitrary `(storedName, suppliedName)` pairs in
    `test/riderIdentity.unit.test.js` (no DB, `test:unit`)
  - Assert the overwrite fires **iff** the supplied name is real and the stored one is not —
    including when the supplied name is blank, whitespace-only, or itself placeholder-shaped
  - This is the single rule both 2.2 and 3.1 depend on, so it gets the strongest test in the suite
  - Run `npm run test:unit`; **EXPECTED OUTCOME**: PASSES against the new module
  - _Requirements: 2.2, 3.1, 3.4_

---

- [ ] 6. Section B — name capture and correction

  - [ ] 6.1 `[BLOCKED: client-install]` Require a name in the customer sign-in modal
    - `client/app/customer/(marketing)/page.tsx:72` — add `required` and `minLength={2}` to the Full
      Name input, matching the mobile-number input beside it
    - Trim before submit and block submission on a whitespace-only value
    - _Bug_Condition: `input.action = 'OTP_SIGNUP' AND isBlank(input.payload.name)`_
    - _Requirements: 2.1_

  - [ ] 6.2 Require a real name in the account-creation branch of `services/authService.js`
    - New-user branch (`:145-147`): `if (!isRealName(name))` throw 400
      `'A full name is required to create your account.'` with machine-readable `code:
      'NAME_REQUIRED'`
    - **Delete** the generated `User ${phone.slice(-4)}` fallback — this is the only site that mints
      placeholders
    - _Bug_Condition: blank name at sign-up accepted and replaced by a generated label_
    - _Expected_Behavior: no rider is ever persisted under a generated placeholder_
    - _Requirements: 2.1_

  - [ ] 6.3 Adopt a supplied name for an existing customer, scoped exactly
    - Existing-user branch (`services/authService.js:148-153`):
      `if (shouldAdoptSuppliedName(customer.name, name)) { customer.name = name.trim(); await customer.save(); }`
      then resolve `profileName` from the possibly-updated record
    - **Static-frontend guard (3.15)**: the requirement in 6.2 applies **only** to the
      account-creation branch. `customer frontend/js/auth.js:150` hides the name field and posts
      `name: ''` for a returning user; that request must keep succeeding untouched
    - A returning user with a stale `localStorage.mobileNumber` but no account now gets a 400; the
      `NAME_REQUIRED` code lets the Next client re-open the name step and the static frontend
      surfaces the message through its existing `alert`
    - _Expected_Behavior: `shouldAdoptSuppliedName` from section A decides, nothing else_
    - _Preservation: 3.1, 3.4, 3.12, 3.13, 3.15 — preservation cases 1, 4, 9_
    - _Requirements: 2.2, 3.1, 3.4, 3.15_

  - [ ] 6.4 Accept `name` on `PUT /api/v1/customer/profile`
    - `controllers/customerController.js:227` — destructure `name` alongside `homeLocation`,
      `pickupLocation`, `dropLocation`
    - Add a `validateName` helper mirroring `validateLocation`'s style: must be a string, trimmed
      length 2–80, rejected with `ValidationError` if placeholder-shaped (a customer must not be able
      to re-enter the broken state)
    - Apply with `if (name !== undefined) customer.name = name.trim();`
    - Leave every existing location validation and message **byte-identical** (3.3); no new Joi
      schema — the in-controller validation style is preserved rather than introducing a second
      mechanism for one field
    - _Bug_Condition: `input.action = 'UPDATE_PROFILE' AND payload CONTAINS 'name' AND storedNameUnchanged`_
    - _Preservation: 3.3 — preservation case 3, plus the `updateProfile`-over-arbitrary-bodies
      property (unknown keys ignored, no-`name` body persists identically)_
    - _Requirements: 2.3, 3.3_

  - [ ] 6.5 Add the `updateProfile` arbitrary-body property test
    - In `test/clientPortalIdentityAndOtp.preservation.test.js`: property over any combination of the
      four accepted fields plus arbitrary extra keys — unknown keys ignored, accepted keys validate
      identically to today, a body without `name` produces a persisted document identical to the
      pre-fix recording from task 3 case 3
    - _Requirements: 2.3, 3.3_

- [ ] 7. Section B — remove every fabricated label from the write paths

  - [ ] 7.1 Replace the five server-side fabricated defaults with `resolveRiderName`
    - `services/shuttleMatchingService.js:46` and `:90` (`'Unknown'`),
      `services/shuttleLifecycleService.js:57` (`'Passenger'`),
      `sockets/customerEvents.js:37` (`'Unknown'`) and `:159` (`'Customer'`)
    - Carry `null` onward rather than a label
    - Where a ride is created and `ride.customerName` is absent, resolve from the `Customer` record
      **before** denormalizing rather than defaulting
    - _Bug_Condition: `resolvedRiderName(input) = null AND displayedRiderLabel(input) != UNRESOLVED_STATE`_
    - _Expected_Behavior: Property 4 — no payload contains `Unknown`, `Passenger`, `Customer` or
      `Rider` in a rider-identity position_
    - _Preservation: 3.1, 3.2 — real names still flow verbatim_
    - _Requirements: 2.4, 2.5, 3.1, 3.2_

  - [ ] 7.2 Add the rider-identity serialization property test
    - Property over arbitrary customer refs (populated object, bare `ObjectId`, `null`, `undefined`,
      name present / absent / whitespace / placeholder-shaped): output is always a real name or
      `null`, never a fabricated label
    - Lives in `test/clientPortalIdentityAndOtp.preservation.test.js`
    - _Requirements: 2.5, 2.6, 3.2_

  - [ ] 7.3 Add the read-only placeholder report script
    - `scripts/migrations/reportPlaceholderNames.js` — counts and lists `Customer` documents whose
      `name` matches `PLACEHOLDER_NAME_PATTERN`. It **writes nothing**
    - Record the design's migration decision in the script header: no mutating backfill
      (`Customer.name` is `required: true` at `models/Customer.js:11-15`, and a real name cannot be
      invented), correction happens on next sign-in via task 6.3, in-app prompting via task 10.2,
      and driver surfaces are unblocked immediately because a placeholder is recognised at
      serialization time and carried as `null`
    - Do not register it under any `npm test` script
    - _Requirements: 2.4, 2.5, 2.7_

---

- [ ] 8. Section C — ride, wallet and driver data layer

  - [ ] 8.1 Narrow the customer ride projection in `controllers/rideController.js`
    - `getMyRides`, `getRideById` and `getActiveRide` add `.select('-matchedDrivers')` — driver-
      internal dispatch data with zero readers in `client/` or either static frontend
    - The `customerId: req.user.id` filter on all three is **untouched** (3.7); `otp.code` continues
      to be returned — it is the requester's own code, which is the point
    - _Bug_Condition: exploration case 6_
    - _Preservation: 3.7 — a field is removed, no filter is widened; preservation case 5 covers this_
    - _Requirements: 2.13, 3.7_

  - [ ] 8.2 `[BLOCKED: client-install]` Extend `client/lib/api/queryKeys.ts`
    - Add `wallet.balance()` and `wallet.transactions()`
    - Adopt the existing `ride.my`, `ride.active`, `ride.detail` keys as-is; tighten `ride.my(params)`
      from `any` to `{ page?: number; limit?: number; status?: string }`
    - _Requirements: 2.8, 2.17_

  - [ ] 8.3 `[BLOCKED: client-install]` Create `client/lib/hooks/useRideQueries.ts`
    - Follow the exact conventions in `client/lib/hooks/useCustomerQueries.ts`: `enabled: isLoggedIn`
      from `useCustomerStore`, `select: (d) => d.data`, `api.get<T>`
    - Types `RideOtp = { code?: string; verified?: boolean; expiresAt?: string }` and `RideEntry`
      (`_id`, `status`, `pickupLocation`, `dropLocation`, `acceptedDriverId?`, `otp?`, `fare?`,
      `createdAt`, …) with **no** `matchedDrivers`
    - `useMyRides(page, limit, status?)` staleTime 30s; `useActiveRide()` staleTime 15s;
      `useRide(id)` staleTime 15s
    - `useActiveRide` sets `refetchInterval` to 20s **only** while the ride is pre-boarding
      (`PENDING`, `ACCEPTED`, `DRIVER_ARRIVING`) and `false` otherwise, plus
      `refetchOnWindowFocus: true`; a completed or cancelled ride polls nothing. It runs
      unconditionally on mount so a reload re-reads the code from the server instead of depending on
      socket replay
    - _Bug_Condition: `hasIssuedBoardingCode(storedState) AND NOT codeReadableAfterReload(surface)`_
    - _Requirements: 2.8, 2.10_

  - [ ] 8.4 `[BLOCKED: client-install]` Socket-driven invalidation in `client/lib/hooks/useRideBooking.ts`
    - Add `useQueryClient` and invalidate `queryKeys.ride.active()` (and `ride.detail(id)` when
      known) on `ride:accepted`, `ride:rematching`, `ride:started`, `ride:completed`,
      `ride:cancelled` and `ride:expired`
    - Keep the toast — it is a good notification — but it is no longer the only disclosure
    - Invalidation is primary; the polling in 8.3 is the fallback for a reload before the socket
      connects and for a dropped socket
    - _Requirements: 2.9, 2.10_

  - [ ] 8.5 `[BLOCKED: client-install]` Correct `DriverProfile` in `client/lib/hooks/useDriverQueries.ts`
    - Add the six fields `controllers/driverController.js:49-67` already returns: `userId: string`,
      `isOnline: boolean`, `isAvailable: boolean`, `rating: number`, `totalRatings: number`,
      `completedTrips: number`
    - _Requirements: 2.16_

  - [ ] 8.6 `[BLOCKED: client-install]` Add `useUpdateTripStatus()`
    - `PUT /driver/trips/status` with `{ tripId, status: 'ARRIVING' | 'ARRIVED' | 'STARTED' | 'COMPLETED' }`
      in `client/lib/hooks/useDriverQueries.ts`
    - Invalidate `queryKeys.driver.trip(tripId)` **and** `queryKeys.driver.trips()` — the same pair
      `useUpdateManifest` invalidates, because the list carries per-passenger status too
    - The response is a full `toTripView` driver view, so `setQueryData` on `driver.trip(tripId)`
      seeds the detail cache before the invalidation settles
    - _Bug_Condition: `endpointIsMounted(action) AND clientCallerCount(action) = 0`_
    - _Preservation: 3.9 — `updateTripStatus` itself is not modified; its guards are reused_
    - _Requirements: 2.14_

  - [ ] 8.7 `[BLOCKED: client-install]` Create `client/lib/hooks/useWalletQueries.ts`
    - `useWallet()` → `GET /wallet`, typed `{ balance: number; currency: string; transactions: WalletTransaction[] }`
      matching `controllers/bookingController.js:301-305`
    - `useAddToWallet()` → `POST /wallet/add` with `{ amount }`, client-side guard
      `1 ≤ amount ≤ 50000` mirroring the server's `:316-318` so the error is immediate; invalidate
      `queryKeys.wallet.*` and `queryKeys.customer.profile()` on success
    - _Requirements: 2.17_

  - [ ] 8.8 `[BLOCKED: client-install]` Create `client/lib/hooks/useUpcomingJourneys.ts` — the unified
    upcoming view
    - **Depends on task 8.3**: `client/lib/hooks/useRideQueries.ts` must exist first, since this hook
      composes `useMyRides` from it with the existing `useCustomerTrips` from
      `client/lib/hooks/useCustomerQueries.ts`
    - **Client-side merge, no new backend endpoint** (design section C item 11a): both sources are
      already returned by mounted, customer-scoped endpoints; a new aggregate endpoint would duplicate
      the scoping logic and the `toTripView` contract for no gain. Per the design Glossary there is no
      third "booking" source to fetch — `GET /api/v1/booking` returns subscriptions, not journeys
    - Export the `UpcomingJourney` view model (design section C item 11b):
      `{ id: string; source: 'SUBSCRIPTION' | 'ON_DEMAND'; at: Date; status: string; active: boolean;
      pickup; drop; driver; fare; code: string | null; verified: boolean | undefined }`
    - `source` is the discriminator that drives the per-row source label (2.20)
    - `at`: subscription → scheduled pickup; on-demand → `scheduledPickupAt ?? requestedAt ?? createdAt`
    - `active` is `NOT terminal`, where terminal is `COMPLETED | CANCELLED | EXPIRED | NO_SHOW`
    - Sort **once**: active journeys before terminal ones, then ascending by `at`
    - `code` is the only source-dependent field: `myEntry.otp` for subscription trips (already scoped
      by `scopeOtp`, 3.5), `otp` for on-demand rides. Never fabricate a code; carry `null` and let
      `BoardingCode` pick the `NOT_YET_ISSUED` state
    - **Port the proven shaping** from `customer frontend/js/my-trips.js` — `shapeScheduledTrip` (:66)
      and `shapeRide` (:109) normalize into one display object and a single sort merges them
      (:307-313). Port that shaping rather than inventing a second opinion, so the static and Next
      portals stay consistent (the same argument as `BoardingCode`)
    - Keep the hook pure of rendering decisions so task 10.1 can property-test the merge and sort
    - _Bug_Condition: `EXISTS journey WHERE hasIssuedBoardingCode(journey) AND NOT isTerminal(journey) AND journey NOT IN upcomingView(surface)`_
    - _Expected_Behavior: Property 8 — the Upcoming tab holds exactly the non-terminal journeys from
      both sources, each with its `source` label and its own code_
    - _Preservation: 3.16 — a customer with no on-demand rides gets a merged list identical to today's_
    - _Requirements: 2.20, 2.21, 3.16_

---

- [ ] 9. Section D — shared components

  - [ ] 9.1 `[BLOCKED: client-install]` Create `client/components/shared/BoardingCode.tsx`
    - Placed under `components/shared/` alongside `RouteMap`, `DriverMap`, `TripManifestMap`,
      `ToastContainer`, so all three customer surfaces reach it by the same import
    - Props `{ code: string | null | undefined; verified?: boolean; terminal: boolean; compact?: boolean; label?: string }`
    - Extract the state selection into a pure exported function
      `resolveBoardingCodeState(code, verified, terminal): 'VERIFIED' | 'ISSUED' | 'NOT_YET_ISSUED' | 'HIDDEN'`
      in its own module `client/lib/boardingCodeState.ts`, using only erasable TypeScript syntax so
      task 11 can property-test it from the root `node --test` suite
    - Four visually distinct states, matching `customer frontend/js/my-trips.js` `boardingCodeBlock()`
      (:136-180) and `customer frontend/js/dashboard.js` `otpMarkup()` (:110-133) so a customer moving
      between the static and Next portals sees the same thing:
      - **VERIFIED** — green confirmation, no digits ("Boarding confirmed by your driver")
      - **ISSUED** — digit tiles on a green-tinted panel, monospaced tabular numerals, plus a copy
        control
      - **NOT_YET_ISSUED** — dashed grey panel, "Issued once a driver is assigned to this ride",
        differing from the error state in border style and colour, not only in wording
      - **HIDDEN** — renders nothing for a terminal ride
    - **Copy control**: a real `<button>`, `navigator.clipboard.writeText` with a feature-checked
      `document.execCommand` fallback, result announced in an `aria-live="polite"` region
      ("Boarding code copied"), reverting to "Copy" after ~1.8s like the static frontend's
      `bindCopyButtons`
    - **Screen-reader treatment**: the tile row is a `role="group"` with a single accessible name
      spelling the code digit-by-digit (`aria-label="Boarding code 4 8 1 9 2 0"`) and every tile is
      `aria-hidden="true"`, so it is announced as digits rather than as "four hundred eighty-one
      thousand nine hundred twenty". Generalise the pattern already in
      `client/app/customer/(dashboard)/my-trips/page.tsx` rather than inventing a different one
    - _Bug_Condition: `surfaceRendersOtp AND NOT surfaceOffersCopy`; `NOT hasIssuedBoardingCode AND NOT surfaceDistinguishes('NOT_YET_ISSUED','LOAD_FAILED')`_
    - _Requirements: 2.11, 2.12_

  - [ ] 9.2 `[BLOCKED: client-install]` Migrate the three customer surfaces onto it
    - `client/app/customer/(dashboard)/my-trips/page.tsx` — delete the local `BoardingCode` (:37-95),
      keep the subscription `myEntry.otp` source and **add** the on-demand source via `useMyRides`.
      This closes the missing copy control without changing scheduled-trip behaviour
    - `client/app/customer/(dashboard)/dashboard/page.tsx` — render from `useActiveRide`, next to the
      step-3 copy at :168 that already promises an OTP; the already-imported `Key` icon finally has a
      use
    - `client/components/customer/CustomerPortalScreens.tsx` `CustomerRideDetailsPage` (:60) — render
      from `myEntry.otp`, and from `useRide(rideId)` for on-demand rides. Confirm how `params` reaches
      `client/app/customer/(dashboard)/rides/[rideId]/page.tsx` in Next 16 (task 1.3) before touching
      that route
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 2.12_

  - [ ] 9.3 `[BLOCKED: client-install]` Create `client/components/shared/RiderName.tsx`
    - The single client-side rendering decision for rider identity; wraps `riderDisplayName()` from
      `client/lib/geo.ts` (returns `string | null`)
    - A resolved name renders as text; `null` renders a muted italic "Rider details unavailable" chip
      with a distinct background — deliberately not a bare string, so it cannot be mistaken for a name
    - `variant="own"` renders "Add your name" as a link to the profile screen for the customer's own
      unset name; confirm the current `next/link` API from task 1.3
    - _Requirements: 2.6, 2.7_

  - [ ] 9.4 `[BLOCKED: client-install]` Convert every bypass site to `<RiderName />`
    - **Driver-side sites (1.22, 2.23) — no surface under `client/app/driver/**` is exempt:**
      - `client/app/driver/(dashboard)/ride-queue/page.tsx:817,888,955,1012,1033,1064` (raw
        `customerName`) — line **888** feeds a map marker `label`, so it takes `riderDisplayName()`
        directly with an explicit unresolved label rather than the component
      - `client/app/driver/(dashboard)/assigned-trips/page.tsx:117` (`'Customer'`)
      - After converting, grep both files for any remaining raw `customerName` render or `'Customer'`
        fallback; 2.23 admits no exempt surface, and task 14.2 (contract section 7) is what keeps it
        true afterwards
    - `client/app/customer/(dashboard)/layout.tsx:66` and
      `client/app/customer/(marketing)/page.tsx:44` (`'Rider'`) — the customer's own surfaces use
      `variant="own"`, calling `isPlaceholderName` on their own stored name so a placeholder prompts
      "Add your name" instead of being greeted (2.7)
    - _Bug_Condition: 1.22 — driver-side rider identity in `client/` rendered without the resolver_
    - _Expected_Behavior: Property 4 — no fabricated label reaches any surface_
    - _Requirements: 2.6, 2.7, 2.23_

  - [ ] 9.5 `[BLOCKED: client-install]` Replace the hardcoded driver rating
    - `client/app/driver/(dashboard)/layout.tsx:78` — render `profile.rating` / `profile.totalRatings`
      from the corrected `DriverProfile`, showing "New driver" when `totalRatings === 0` rather than
      `★ 0.00`
    - _Bug_Condition: `surfaceDisplaysHardcodedValue(surface)`_
    - _Requirements: 2.16_

  - [ ] 9.6 `[BLOCKED: client-install]` Create `client/components/driver/BoardingCodeEntry.tsx`
    - Replaces `window.prompt` at `client/app/driver/(dashboard)/current-trip/page.tsx:228`
    - Built from the existing primitives in `client/components/ui/` (`input.tsx`, `button.tsx`,
      `card.tsx`) so it matches the rest of the driver portal
    - Modal `<div role="dialog" aria-modal="true" aria-labelledby>` naming the passenger via
      `<RiderName />`
    - Six single-character inputs with `inputMode="numeric"`, `autoComplete="one-time-code"`,
      per-input `aria-label`, auto-advance, Backspace-to-previous and paste-splitting of a full
      six-digit string — the same interaction as the customer sign-in OTP boxes
      (`client/app/customer/(marketing)/page.tsx` `updateOtp`)
    - Keyboard accessible throughout: focus to the first input on open, focus trapped in the dialog,
      Escape cancels and restores focus to the triggering button, Enter submits
    - Server rejection rendered in the dialog with `role="alert"` and wired via `aria-describedby`,
      so an incorrect code is announced and the dialog stays open for a retry
    - The mutation still goes through `useUpdateManifest` with `action: 'board', otp`, so the
      server-side verification guard is unchanged
    - _Preservation: 3.8 — only how the code is collected changes; preservation case 6 pins the
      rejection_
    - _Requirements: 2.15, 3.8_

  - [ ] 9.7 `[BLOCKED: client-install]` Add "En route" / "Arrived" controls
    - On `client/app/driver/(dashboard)/current-trip/page.tsx`, calling `useUpdateTripStatus` and
      reflecting the resulting `DRIVER_EN_ROUTE` / `DRIVER_ARRIVED` passenger states
    - `updateTripStatus` returns `_NOOP` events for a no-op transition, so a repeat tap renders as
      "already recorded", not as a failure
    - _Requirements: 2.14_

  - [ ] 9.8 `[BLOCKED: client-install]` Merge both journey sources into my-trips and fix the `upcoming`
    filter
    - **Depends on task 8.8**: `client/lib/hooks/useUpcomingJourneys.ts` must exist first
    - `client/app/customer/(dashboard)/my-trips/page.tsx` — replace the `useCustomerTrips`-only data
      source with `useUpcomingJourneys()`, so subscription/booking trips and on-demand Flexy rides
      render in **one chronological list** (2.20). Each row is labelled with its
      `source: 'SUBSCRIPTION' | 'ON_DEMAND'` and carries its own `<BoardingCode />` from task 9.1
    - `client/app/customer/(dashboard)/my-trips/page.tsx:108` — the `upcoming` filter today admits only
      `status === 'SCHEDULED' || 'IN_PROGRESS'` over subscription trips, which is why an on-demand ride
      in `PENDING`, `ACCEPTED` or `DRIVER_ARRIVING` never appears and its code is reachable nowhere in
      the app. Widen it to admit those three on-demand pre-boarding states alongside the two
      subscription states, driving the decision off `journey.active` and `journey.source` from the view
      model rather than off a hardcoded status list (2.21)
    - Scope the "exactly the non-terminal journeys" guarantee to the **Upcoming tab**; the Completed
      and Cancelled tabs continue to show terminal rows from the same merged list (design Property 8)
    - **Preservation (3.16)**: for a customer with no on-demand rides the rendered list, its filter
      tabs and its pagination behaviour must be element-for-element what they are today — the
      on-demand source contributing zero rows is a no-op, not a reordering. Task 3 case 10 is the
      recording this is checked against
    - _Bug_Condition: 1.19, 1.20 — no single upcoming view; the `upcoming` filter excludes on-demand
      pre-boarding states_
    - _Expected_Behavior: Property 8 from design_
    - _Preservation: 3.16_
    - _Requirements: 2.8, 2.20, 2.21, 3.16_

  - [ ] 9.9 `[BLOCKED: client-install]` Give the post-purchase subscribe block a boarding code and a
    my-trips link
    - `client/app/customer/(dashboard)/subscribe/page.tsx:517` — the "Upcoming Trips" block renders
      bare date chips today, with no code and no route to one (1.21). Each chip gains
      `<BoardingCode compact />` (design section D item 18):
      - `ISSUED` when the generated trip already carries `myEntry.otp.code`
      - `NOT_YET_ISSUED` — "Issued closer to your service day" — when it does not, because
        `services/DailyTripGenerator.js:64` mints codes per generated `Trip` rather than at purchase
        time
    - Add a link from the block to my-trips, so the codes are always one navigation away — this is the
      second half of 2.22
    - **Render-only change**: `GET /api/v1/booking`'s response shape is read unchanged at
      `client/app/customer/(dashboard)/subscribe/page.tsx:170`, which needs the primary subscription
      flattened at the top level alongside `data.subscriptions` (3.17). Do not reshape that read and do
      not touch `controllers/bookingController.js`
    - _Bug_Condition: 1.21 — post-purchase trips rendered as bare date chips with no code and no link_
    - _Expected_Behavior: Property 8 — each upcoming trip shows its code or an explicit
      not-yet-issued state, and links to where codes can be read_
    - _Preservation: 3.17 — the booking response shape at :170 is untouched_
    - _Requirements: 2.11, 2.12, 2.22, 3.17_

- [ ] 10. Property test for the boarding-code state machine
  - **Property 4: Fix Checking** - Boarding-Code State Selection Is Total and Unambiguous
  - `fast-check` property over arbitrary `(code, verified, terminal)` triples asserting
    `resolveBoardingCodeState` resolves to exactly one of `VERIFIED | ISSUED | NOT_YET_ISSUED |
    HIDDEN`, and that `NOT_YET_ISSUED` is never produced for a triple that also satisfies the
    load-failure condition
  - There is no test runner under `client/`. Load `client/lib/boardingCodeState.ts` from a root
    `test/boardingCodeState.property.test.js` using Node's built-in type stripping (Node 25 is in
    use here); the module must contain only erasable syntax — no enums, no parameter properties.
    Verify the loader works before relying on it; if it does not, add the explicit
    `--experimental-strip-types` flag to the script entry rather than duplicating the state table in
    plain JS
  - Register under `test:unit` (no DB)
  - _Requirements: 2.11, 2.12, 2.18_

  - [ ] 10.1 Property test for the unified upcoming view
    - **Property 8: Fix Checking** - The Upcoming View Holds Every Non-Terminal Journey, With Its Code
    - **Depends on task 8.8**: extract the pure merge and sort out of
      `client/lib/hooks/useUpcomingJourneys.ts` into a sibling module
      `client/lib/upcomingJourneys.ts` (e.g. `mergeUpcomingJourneys(trips, rides)`), using only
      erasable TypeScript syntax — no enums, no parameter properties — so a root
      `test/upcomingJourneys.property.test.js` can load it the same way task 10 loads
      `client/lib/boardingCodeState.ts`
    - `fast-check` property over arbitrary sets of subscription trips (with and without
      `myEntry.otp.code`) and on-demand rides (statuses drawn from `PENDING`, `ACCEPTED`,
      `DRIVER_ARRIVING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `NO_SHOW`), asserting:
      - the **Upcoming tab** projection contains exactly the non-terminal journeys from both sources —
        no non-terminal journey is dropped and no terminal journey is admitted. Terminal rows may still
        be present in the merged list for the Completed and Cancelled tabs
      - every row carries a `source` discriminator of exactly `'SUBSCRIPTION'` or `'ON_DEMAND'`, and
        the count per source equals the count of non-terminal inputs from that source
      - the order is total and stable: all `active` rows precede all terminal rows, and within each
        group `at` is non-decreasing
      - `code` equals `myEntry.otp.code` for subscription rows and `otp.code` for on-demand rows, and
        is `null` — never a fabricated value — when the source carried none
      - on-demand rides in `PENDING`, `ACCEPTED` and `DRIVER_ARRIVING` are always admitted (2.21)
      - **3.16 no-op**: for any input where the ride set is empty, the projection equals the
        subscription-only projection element for element and in the same order
    - Register under `test:unit` (no DB)
    - _Requirements: 2.20, 2.21, 2.22, 3.16_

---

- [ ] 11. Section E — error, empty and loading states

  - [ ] 11.1 `[BLOCKED: client-install]` Rebuild the customer dashboard's data flow
    - `client/app/customer/(dashboard)/dashboard/page.tsx` — replace the hand-rolled
      `Promise.all(...).catch(() => {})` at :28 with react-query, consistent with the rest of the
      client: `useCustomerSubscriptions`, `useActiveRide` and a `useMyBooking` hook
    - Render four distinct states: loading skeleton, error panel with the message and a Retry button,
      genuinely-empty "No Active Commute" with a call to action, and the populated card
    - Keep today's "Loading your commute dashboard…" text but make it unreachable while an error is
      pending
    - _Bug_Condition: `requestFailed(input) AND renderedState(surface) = EMPTY_STATE`_
    - _Expected_Behavior: Property 6 — loading, failure, empty and not-yet-issued are four distinct
      renderings_
    - _Requirements: 2.11, 2.18_

  - [ ] 11.2 `[BLOCKED: client-install]` Make the wallet real
    - `client/components/customer/CustomerPortalScreens.tsx` `CustomerWalletPage` (:31) — replace the
      hardcoded `₹ 0.00` and the disabled Add Money button (titled "not available in this API yet")
      with `useWallet()` and `useAddToWallet()`
    - The ledger tab, currently derived from `useCustomerTrips`, takes the real `transactions` array
      from the wallet endpoint
    - Add Money opens a small amount dialog with the same 1–50,000 bound the server enforces
    - Loading, error and empty are three distinct renderings here too
    - _Requirements: 2.17, 2.18_

---

- [ ] 12. Section F — document upload storage and serving

  - [ ] 12.1 **APPROVAL GATE — do not implement 12.2–12.5 until this is answered**
    - Design section F Decision 2 chooses **authenticated, owner-or-Admin serving** over a public
      `app.use('/uploads', express.static(...))` mount. These files are driver licences, vehicle RCs
      and insurance certificates — government identity documents — and the filenames
      (`<field>-<timestamp>-<random>.<ext>`) are obscurity, not access control
    - Ask the user to confirm authenticated serving, or to state that public serving is wanted
      instead. Do not proceed silently on either reading
    - Also surface the collision: a public mount would need an explicit `/uploads` mount ordered
      **before** `app.js`'s existing static mount of `customer frontend` at `/`
    - Record the answer in this file before continuing
    - _Requirements: 2.19_

  - [ ] 12.2 `[BLOCKED: doc-serving-approval]` One absolute upload constant in `config/config.js`
    - `uploads.path` becomes `path.resolve(__dirname, '..', process.env.UPLOAD_PATH || 'uploads')`;
      remove the relative `'src/uploads'` default at :132 — `src/` does not exist in this repo and a
      relative multer destination resolves against the process CWD, so it silently depended on where
      `npm start` was run from
    - Add `uploads.documentsPath = path.join(uploads.path, 'documents')` so there is exactly one
      constant
    - Add `uploads/` to `.gitignore`
    - _Bug_Condition: `NOT directoryExists(configuredUploadPath())`_
    - _Requirements: 2.19_

  - [ ] 12.3 `[BLOCKED: doc-serving-approval]` Point multer at it
    - `middleware/uploadMiddleware.js` — destination becomes `config.uploads.documentsPath`, with
      `fs.mkdirSync(..., { recursive: true })` at module load so the directory exists before the
      first request (multer does not create it)
    - _Requirements: 2.19_

  - [ ] 12.4 `[BLOCKED: doc-serving-approval]` Fix the recorded URL in `controllers/documentController.js`
    - Delete the local `UPLOAD_DIR` at :9 and its IIFE (it pointed one level above the project root);
      import `config.uploads.documentsPath`
    - The recorded URL changes from the unserved `/uploads/documents/<file>` to the authenticated
      `/api/v1/driver/documents/<type>/file`
    - Persist only the filename internally and derive the URL, so a future storage move needs no data
      migration
    - _Bug_Condition: `recordedUrl(input) NOT RESOLVED BY anyMountedRoute()`_
    - _Requirements: 2.19_

  - [ ] 12.5 `[BLOCKED: doc-serving-approval]` Serve documents behind authorization
    - `routes/v1/driverRoutes.js` — new `GET /driver/documents/:type/file` behind `authenticate`,
      resolving the requesting driver's own document, plus an Admin-authorized variant for
      verification review
    - Stream via `res.sendFile` from `config.uploads.documentsPath` with a `path.resolve`-based
      containment check so a crafted filename cannot escape the directory
    - Set `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
    - _Expected_Behavior: Property 7 — the file exists at the one configured location, the recorded
      URL is served by a mounted route, and only the owner or an Admin can retrieve it_
    - _Requirements: 2.19_

- [ ] 13. `[BLOCKED: doc-serving-approval]` Integration test for document URLs
  - **Property 5: Fix Checking** - Recorded Document URLs Resolve and Authorize
  - In `test/clientPortalIdentityAndOtp.exploration.test.js` (extending exploration case 7): upload a
    document, assert the file exists at `config.uploads.documentsPath`, then fetch the recorded URL
    as the owning driver (**200**), as another driver (**403**) and unauthenticated (**401**)
  - _Requirements: 2.19_

---

- [ ] 14. Section G — permanent contract assertions in `scripts/contractCheck.js`
  - Add these **after** the fix so `npm run check:contract` (and `pretest`, which gates `npm test`)
    stays at its passing baseline while tasks 2 and 3 are red. The exploration-phase equivalents live
    in the exploration test file
  - The script runs with no server and no database, which is why it is the right home for the
    client-side assertions
  - Sections 1–5 already exist and must keep passing unchanged

  - [ ] 14.1 Section 6 — mounted routes have client callers
    - For each of `PUT /api/v1/driver/trips/status`, `GET /api/v1/rides/my`,
      `GET /api/v1/rides/active`, `GET /api/v1/wallet`, `POST /api/v1/wallet/add`: scan
      `client/lib/hooks/**` for the literal path and fail when a mounted route has zero callers
    - This is the assertion whose absence let "server work landing ahead of client work" stay
      invisible
    - _Requirements: 2.14, 2.17_

  - [ ] 14.2 Section 7 — no placeholder identity literals
    - Scan the identity sites for `'Unknown' | 'Passenger' | 'Customer' | 'Rider'` appearing as a
      fallback on a name expression (`|| '...'` / `?? '...'`), with a small explicit allowlist for
      the legitimate uses (role comparisons such as `authorize('Customer')`, the `'Customer'` role
      string in `services/authService.js`)
    - Fails on a new placeholder literal, which is what keeps Property 4 true over time
    - _Requirements: 2.5, 2.6, 2.7_

  - [ ] 14.3 Section 8 — placeholder predicate table
    - Assert `isPlaceholderName` / `shouldAdoptSuppliedName` against the table in the design's
      Testing Strategy, including that `'User 12345'`, `'User abcd'`, `'Users 1234'` and
      `'user 1234'` are **not** placeholders
    - _Requirements: 2.2, 3.1, 3.4_

  - [ ] 14.4 Section 9 — `matchedDrivers` withheld
    - Assert the customer ride projection excludes `matchedDrivers` while retaining `otp.code` and
      `acceptedDriverId`
    - _Requirements: 2.13, 3.7_

  - [ ] 14.5 Extend the existing section 4 rather than replacing it
    - Section 4 already covers the serializer half of viewer scoping; extend it to cover the new
      projection. Sections 3 and 5 (legacy aliases the static frontends read) stay untouched
    - _Requirements: 2.13, 3.5, 3.6, 3.15_

---

- [ ] 15. Integration tests from the design's Integration Tests section
  - Add to `test/clientPortalIdentityAndOtp.exploration.test.js` (fix-checking half) or
    `test/clientPortalIdentityAndOtp.preservation.test.js` as each case fits; both are registered
    under `test:integration`

  - [ ] 15.1 Full identity flow
    - Sign up with a real name, book a ride, read the driver-facing manifest, assert the driver sees
      that name; then a second customer with an uncorrected placeholder, assert the driver sees the
      unresolved state and not a name
    - This is the assertion that "a full vehicle appears to hold the same person" is gone
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.1, 3.2_

  - [ ] 15.2 Full boarding-code flow
    - Customer requests a Flexy ride, driver accepts, customer reads the code from `/rides/active`, a
      simulated reload (cache cleared, hooks re-run) re-reads it, driver boards with it, the
      customer's surface flips to the verified state
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 2.12_

  - [ ] 15.3 Cross-customer disclosure
    - Two customers with active rides; each `/rides/my`, `/rides/active` and `/rides/:id` call
      returns only the requester's ride and code, and a direct `GET /rides/:otherId` for another
      customer's ride 404s
    - _Requirements: 2.13, 3.7_

  - [ ] 15.4 Driver trip-status flow
    - `ARRIVING` then `ARRIVED` through the client hook's endpoint, then boarding by code, then
      `COMPLETED`, asserting the documented passenger transitions and the completion guard
    - _Requirements: 2.14, 3.9_

  - [ ] 15.5 Wallet flow
    - Read balance, top up, re-read; assert the persisted `walletBalance` and the rejection of an
      out-of-range amount
    - _Requirements: 2.17_

---

- [ ] 16. Verify the exploration and preservation tests against the fixed code

  - [ ] 16.1 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Identity, Boarding Code and Wiring Are Correct Under C
    - **IMPORTANT**: Re-run the SAME test from task 2 — do NOT write a new test
    - The test from task 2 encodes the expected behavior; when it passes, the expected behavior is
      satisfied
    - **EXPECTED OUTCOME**: cases 1–7 and 9 now PASS and case 8 still PASSES (an over-broad overwrite
      rule would break case 8 and requirement 3.1)
    - Case 9 passing is the end-to-end confirmation that tasks 8.8, 9.8 and 9.9 landed: both journey
      sources under Upcoming, in time order, with both codes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.13, 2.14, 2.17, 2.19, 2.20, 2.21, 2.22_

  - [ ] 16.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Behaviour Outside the Bug Condition Is Byte-Identical
    - **IMPORTANT**: Re-run the SAME tests from task 3 — do NOT write new tests
    - **EXPECTED OUTCOME**: all ten cases still PASS, no regressions. Pay particular attention to
      case 9 (`verifyOtp` with `name: ''` for an existing customer, the
      `customer frontend/js/auth.js:150` trap), case 3 (location validation messages byte-identical)
      and case 10 (the merge is a no-op for subscription-only customers, and `GET /api/v1/booking`
      still flattens the primary subscription at the top level)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.15, 3.16, 3.17_

- [ ] 17. Full verification sweep against the baseline

  - [ ] 17.1 Backend gates
    - `npm run check:contract` — expect **pass**, now including new sections 6–9
    - `npm run test:unit` — expect **pass**, including `test/riderIdentity.unit.test.js`,
      `test/boardingCodeState.property.test.js` and `test/upcomingJourneys.property.test.js`
    - `npm run test:integration` — expect exactly the **14 pre-existing** Subscription validation
      failures (`pickupTime` / `subscriptionType` / coordinates required) and nothing else
    - `npm run check:startup` — expect exactly the **1 pre-existing** failure (Socket.IO browser
      client)
    - Do not fix the 14 + 1 known failures; confirm the counts match and stop
    - _Requirements: 3.14_

  - [ ] 17.2 `[BLOCKED: client-install]` Client gates
    - `npm --prefix client exec tsc -- --noEmit` — clean
    - `npm --prefix client run lint` — clean (`eslint-config-next@16.2.10` is pinned)
    - `npm --prefix client run build` (`next build`) — clean
    - Compare each against the post-install baseline recorded in task 1.2, not against zero
    - _Requirements: 3.14_

  - [ ] 17.3 Static frontends still work
    - `npm run check:startup` allowing the 1 known failure, plus a manual pass over the
      `customer frontend/` and `driver frontend/` pages that read boarding codes and manifests —
      requirement 3.15 protects behaviour fixed for them in a previous session and there is no
      automated browser suite here
    - Specifically re-check returning-user sign-in through `customer frontend/js/auth.js`, which
      posts `name: ''`
    - _Requirements: 3.15_

- [ ] 18. Checkpoint - Ensure all tests pass
  - Confirm the failure set matches the baseline table exactly: `check:contract` pass, `test:unit`
    pass, `test:integration` 14 known failures, `check:startup` 1 known failure, and the three client
    gates clean
  - Confirm the document-serving decision in task 12.1 was answered by the user and the
    implementation matches the answer
  - Ask the user if questions arise.

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| 2.1 | 2, 6.1, 6.2, 15.1, 16.1 |
| 2.2 | 2, 5, 6.3, 14.3, 16.1 |
| 2.3 | 2, 6.4, 6.5, 16.1 |
| 2.4 | 2, 7.1, 7.3, 15.1, 16.1 |
| 2.5 | 2, 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 14.2, 15.1 |
| 2.6 | 7.2, 9.3, 9.4, 14.2, 15.1 |
| 2.7 | 7.3, 9.3, 9.4, 14.2 |
| 2.8 | 8.2, 8.3, 8.8, 9.2, 9.8, 15.2 |
| 2.9 | 8.4, 9.2, 15.2 |
| 2.10 | 8.3, 8.4, 9.2, 15.2 |
| 2.11 | 9.1, 9.2, 9.9, 10, 11.1, 15.2 |
| 2.12 | 9.1, 9.2, 9.9, 10, 15.2 |
| 2.13 | 2 (case 6), 3 (case 5), 8.1, 14.4, 14.5, 15.3 |
| 2.14 | 2 (case 5), 8.6, 9.7, 14.1, 15.4 |
| 2.15 | 9.6 |
| 2.16 | 8.5, 9.5 |
| 2.17 | 2, 8.7, 11.2, 14.1, 15.5 |
| 2.18 | 10, 11.1, 11.2 |
| 2.19 | 2 (case 7), 12.1, 12.2, 12.3, 12.4, 12.5, 13 |
| 2.20 | 2 (case 9), 8.8, 9.8, 10.1, 16.1 |
| 2.21 | 2 (case 9), 8.8, 9.8, 10.1, 16.1 |
| 2.22 | 9.9, 10.1, 16.1 |
| 2.23 | 9.3, 9.4, 14.2, 15.1 |
| 3.1 | 3 (cases 1, 2), 4.3, 5, 6.3, 7.1, 14.3, 15.1, 16.2 |
| 3.2 | 3, 4.2, 4.3, 7.1, 7.2, 15.1, 16.2 |
| 3.3 | 3 (case 3), 6.4, 6.5, 16.2 |
| 3.4 | 3 (case 4), 4.3, 5, 6.3, 14.3, 16.2 |
| 3.5 | 3 (case 5), 14.5, 16.2 |
| 3.6 | 3 (case 5), 14.5, 16.2 |
| 3.7 | 3 (case 5), 8.1, 14.4, 15.3, 16.2 |
| 3.8 | 3 (case 6), 9.6, 16.2 |
| 3.9 | 3 (case 7), 8.6, 15.4, 16.2 |
| 3.10 | 3, 16.2 |
| 3.11 | 3, 16.2 |
| 3.12 | 3, 6.3, 16.2 |
| 3.13 | 3, 6.3, 16.2 |
| 3.14 | 1.1, 1.2, 1.3, 17.1, 17.2, 18 |
| 3.15 | 3 (cases 8, 9), 4.2, 6.3, 8.8, 14.5, 17.3, 16.2 |
| 3.16 | 3 (case 10), 8.8, 9.8, 10.1, 16.2 |
| 3.17 | 3 (case 10), 9.9, 16.2 |

---

## Notes

- **Blocking legend** — the two tags used throughout the task list are defined in the Overview above:
  `[BLOCKED: client-install]` gates on tasks 1.2 and 1.3, and `[BLOCKED: doc-serving-approval]` gates
  on the user's answer to task 12.1. Every task that writes a file under `client/` carries the first
  tag; that now includes tasks 8.8, 9.8 and 9.9 for the unified upcoming view.
- **Baseline caveat** — every verification compares against the baseline table in the Overview, not
  against zero: `check:contract` passes, `test:unit` passes, `test:integration` has **14 pre-existing**
  Subscription validation failures, `check:startup` has **1 pre-existing** Socket.IO browser-client
  failure, and the three `client/` gates have **no baseline at all** until task 1.2 installs
  `client/node_modules`. A run is green when the failure set and count match that table exactly. Never
  chase the 14 + 1 known failures.
- **Dependency order added by the amendment** — 8.3 → 8.8 → 9.8, and 9.1 → 9.9. Task 10.1 depends on
  the pure merge module extracted in 8.8.
