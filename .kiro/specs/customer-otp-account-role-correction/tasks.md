# Implementation Plan

- [x] 1. Write the expected-failure bug-condition exploration test before implementing the fix
  - **Property 1: Bug Condition** - `7019268918` is restored to an OTP-eligible Customer
  - **CRITICAL**: Write and run this property-based test against the unfixed `seedDatabase('test')` implementation. Its failure is expected and demonstrates the defect; do not alter product code while recording the failures.
  - Model the design's `isBugCondition(input)` only for the exact target phone `7019268918`: the User is absent or not a `Customer`, has no visible Customer profile, has a visible Driver profile, or forced Driver reconciliation has removed Customer data or subscriptions.
  - Generate/reproduce isolated test states: a fresh database; an existing target Driver with a visible Driver profile; an existing Customer with persisted Customer-profile fields and subscriptions; and a target with both visible Customer and Driver profiles. Run the unfixed seed for each state.
  - Assert the design's `expectedBehavior(result)`: `7019268918` is an active `Customer`, has a valid visible Customer profile, retains its existing Customer profile fields and subscriptions, has zero visible Driver profiles, and a valid `LOGIN` OTP completes the existing customer-authenticated flow.
  - Before running the seed, also snapshot the preserved Driver `9876543210`, its Driver-profile identity, and the HSR Layout - Electronic City trip's Driver reference. This snapshot is evidence for the preservation task, not a conversion target.
  - **EXPECTED OUTCOME**: On unfixed code, expected-behavior assertions fail with concrete counterexamples such as `7019268918` retaining/receiving `role: 'Driver'`, having a visible Driver profile, losing Customer data, or receiving the existing password-login rejection for a valid customer `LOGIN` OTP. Record every counterexample.
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation baseline property tests before implementing the fix
  - **Property 2: Preservation** - `9876543210`, non-target OTP authorization, and unrelated data remain unchanged
  - **IMPORTANT**: Follow observation-first methodology. Run the unfixed implementation for non-bug-condition inputs and encode its observed, stable outputs; exclude mutable timestamps from comparisons.
  - Establish the baseline that `9876543210` remains a `Driver`, retains the same Driver-profile identity, and the HSR Layout - Electronic City trip continues to reference that exact Driver profile after `seedDatabase('test')`.
  - Generate non-target `Driver` and `Admin` accounts, including `9876543210`, with valid `LOGIN` OTP records. Observe and assert the existing Customer-only `verifyOtp` outcome: rejection with the current password-login response and no Customer session. Do not modify the authorization guard.
  - Generate unrelated role-consistent Customer, Driver, and Admin records, including Customer profiles and subscriptions. Snapshot role, profile identity, persisted profile fields, and subscription associations; run the seed once and twice, then assert all snapshots remain unchanged.
  - Include the already-correct target state (`7019268918` is an active Customer with one valid Customer profile, retained subscriptions, and no visible Driver profile) in repeated-seed baseline coverage. Observe that re-running the seed neither duplicates nor resets Customer data and does not alter non-target records.
  - **EXPECTED OUTCOME**: The preservation properties pass on unfixed code, establishing the independent Driver/trip relationship, non-target OTP rejection, unrelated data integrity, and idempotent already-correct-state behavior that the fix must preserve.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Implement the idempotent `7019268918` Customer reconciliation in `config/database.js`
  - [~] 3.1 Reconcile only the exact target account in `seedDatabase(env)`
    - Define a named local target constant for `targetCustomerPhone = '7019268918'` and execute this correction only through the existing non-production seed path.
    - Find the target User by that exact phone. If absent, create it as an active `Customer` using the established development/test credential policy. If present, update only its role to `Customer` and required active status; retain its phone, credentials, password flags, email, tokens, push subscriptions, and unrelated User fields.
    - Inspect the target's Customer profiles and subscriptions before changing profile data. Retain an existing valid visible Customer profile and all existing Customer subscriptions exactly as stored; create one valid Customer profile only if none exists, and never recreate, reset, remove, or duplicate Customer data.
    - Query visible Driver profiles only for the target User ID and retire each using the project's established soft-delete convention. Do not change Driver profiles belonging to any other User.
    - Preserve the convergence invariant across repeated runs: `7019268918` is an active Customer with a valid visible Customer profile, retained Customer subscriptions, and zero visible Driver profiles. Preserve existing error propagation and log only safe, high-level reconciliation results.
    - _Bug_Condition: `isBugCondition(input)` applies only to phone `7019268918` when its User/profile/subscription state is missing, Driver-role inconsistent, or destructively reconciled._
    - _Expected_Behavior: `expectedBehavior(result)` yields an active Customer, retained Customer data, no visible target Driver profile, and success through the unchanged Customer `LOGIN` OTP flow._
    - _Preservation: Do not modify non-target User, Customer, Driver, Subscription, Trip, Route, OTP, credential, or historical records; preserve `9876543210` and its HSR trip association._
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [~] 3.2 Preserve the independent Driver seed, HSR trip association, and OTP authorization
    - Leave the existing seed/reconciliation behavior for `9876543210` unchanged: it remains the seeded Driver and retains its existing Driver profile.
    - Do not reassign, recreate, delete, or rewrite the HSR Layout - Electronic City trip's Driver reference; it must continue to reference `9876543210`'s existing Driver profile.
    - Make no behavioral changes to `services/authService.js`, OTP controllers, or OTP routes. The current Customer-only `LOGIN` OTP guard must naturally accept the corrected target role and continue rejecting every non-target Driver and Admin.
    - Do not broaden the correction into a role migration, trip reassignment, or cleanup for any phone other than `7019268918`.
    - _Bug_Condition: The defect is forced Driver reconciliation for `7019268918`, not the independent Driver or trip relationship for `9876543210`._
    - _Expected_Behavior: Only `7019268918` becomes Customer-eligible for normal customer `LOGIN` OTP; `9876543210` remains the HSR trip's Driver._
    - _Preservation: Keep `9876543210`, the HSR Layout - Electronic City trip association, and non-target Driver/Admin Customer-OTP rejection unchanged._
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [~] 3.3 Verify the bug-condition exploration test now passes
    - **Property 1: Expected Behavior** - `7019268918` is restored to an OTP-eligible Customer
    - **IMPORTANT**: Re-run the same property from task 1; do not write a replacement test.
    - Exercise all generated/reproduced bug-condition states and repeated seed runs. Confirm target convergence, retained pre-existing Customer profile fields and subscription associations, no visible target Driver profile, and a successful valid Customer `LOGIN` OTP result for `7019268918`.
    - **EXPECTED OUTCOME**: The former expected-failure property passes, confirming every tested buggy target state meets the design's expected behavior.
    - _Requirements: 2.1, 2.2_

  - [~] 3.4 Verify the preservation baseline tests still pass
    - **Property 2: Preservation** - `9876543210`, non-target OTP authorization, and unrelated data remain unchanged
    - **IMPORTANT**: Re-run the same tests from task 2; do not write new baseline tests.
    - Confirm `9876543210` retains its Driver role/profile identity and the HSR Layout - Electronic City trip still references that profile. Confirm non-target Driver/Admin Customer `LOGIN` OTP attempts retain the observed rejection, and unrelated records and already-correct target Customer data remain unchanged across repeated seed runs.
    - **EXPECTED OUTCOME**: All preservation properties pass after the fix, demonstrating no non-target role, trip, authorization, profile, or subscription regression.
    - _Requirements: 3.1, 3.2, 3.3_

- [~] 4. Checkpoint - ensure all tests pass
  - Run the focused seed/reconciliation, OTP-service, unit, integration, and property-based suites against isolated test data.
  - Confirm task 1's unfixed failure and counterexamples are documented; Property 1 passes after implementation; Property 2 passes before and after implementation; and repeated non-production seed execution is idempotent.
  - Confirm no test modifies production data and no task reassigns `9876543210` or the HSR Layout - Electronic City trip.
  - Ensure all tests pass; ask the user if questions arise.
