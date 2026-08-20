# Customer OTP Account Role Correction Bugfix Design

## Overview

The development/test seed reconciliation currently forces phone `7019268918` into the Driver role, retains or creates its Driver profile, and removes its Customer profile and subscriptions. That state is inconsistent with the intended customer account and causes the existing customer-only LOGIN OTP authorization rule in `AuthService.verifyOtp` to reject the account.

The fix is a narrowly scoped, idempotent reconciliation for that exact phone number. It converges `7019268918` to a Customer, retains its existing Customer profile and subscriptions (or creates only a valid Customer profile if absent), and retires only that user's Driver profile. The existing Customer-only LOGIN OTP rule remains unchanged, so the corrected role naturally enables normal customer authentication. The seeded Driver `9876543210`, its Driver profile, and the HSR Layout - Electronic City trip's Driver association are explicit preservation constraints and must not be changed.

## Glossary

- **Bug_Condition (C)**: A seed/startup state in which the exact target account `7019268918` is forced to `Driver`, has a visible Driver profile, lacks a valid visible Customer profile, or has lost its Customer subscriptions, preventing customer LOGIN OTP access.
- **Property (P)**: The target account is an active Customer with a valid Customer profile and its existing Customer subscriptions, has no visible Driver profile, and can complete the normal customer LOGIN OTP flow.
- **Preservation**: Behavior and data outside the target correction that must remain unchanged, particularly the Driver role/profile and HSR trip association for `9876543210`, the Customer-only LOGIN OTP gate for all non-target Drivers and Admins, and unrelated Customer records.
- **`seedDatabase`**: The development/test startup seed and reconciliation function in `config/database.js`; it is the planned location for the target account correction.
- **`verifyOtp`**: The `AuthService.verifyOtp` function in `services/authService.js`. For `LOGIN`, it accepts Customer users and rejects existing non-Customer users with the existing password-login error.
- **Target account**: The sole `User` identified by the immutable phone value `7019268918`.
- **Preserved seeded Driver**: The distinct `User` identified by phone `9876543210`, which must remain a Driver with its existing Driver profile and HSR Layout - Electronic City trip association.
- **Visible profile**: A `Customer` or `Driver` profile returned by normal model queries, excluding documents marked `isDeleted: true`.
- **Reconciliation**: An idempotent repair that converges fresh and previously seeded development/test databases to the required target role/profile state without modifying non-target data.

## Bug Details

### Bug Condition

The bug manifests when development/test seeding initializes or reconciles phone `7019268918` as a Driver. The seed state assigns or retains the Driver role, creates or retains a Driver profile, and removes the account's Customer profile and subscriptions. Because customer LOGIN OTP intentionally admits only users whose role is `Customer`, the target is then rejected by the customer authentication flow.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input containing a seeded/startup database state and phone number
  OUTPUT: boolean

  targetUser := findUserByPhone('7019268918')
  targetCustomer := findVisibleCustomerByUserId(targetUser.id)
  targetDriver := findVisibleDriverByUserId(targetUser.id)
  targetSubscriptions := findCustomerSubscriptions(targetUser.id)

  RETURN input.phone = '7019268918'
         AND (
           targetUser DOES NOT EXIST
           OR targetUser.role != 'Customer'
           OR targetCustomer DOES NOT EXIST
           OR targetDriver EXISTS
           OR customerDataRemovedByForcedDriverReconciliation(targetUser.id)
         )
END FUNCTION
```

### Examples

- On a fresh development/test startup, the defective seed creates or reconciles `User(phone=7019268918, role=Driver)` with a Driver profile and removes Customer data. A valid customer LOGIN OTP is rejected with the existing non-Customer/password-login error. Expected: the same account is a Customer and its valid LOGIN OTP completes the normal customer session.
- On an existing database where `7019268918` has a Customer profile and subscriptions before seed reconciliation, the defective path forces it to Driver and removes that Customer data. Expected: the Customer profile and subscriptions remain intact, while only its Driver profile is retired.
- If `7019268918` already has both a visible Customer profile and a visible Driver profile, the account is role-inconsistent. Expected: retain the existing Customer profile and subscriptions without resetting fields, and retire only that Driver profile.
- If `7019268918` is already a Customer with a valid Customer profile and no visible Driver profile, repeated seed startup must not create duplicate profiles, subscriptions, or unrelated data changes.
- When `9876543210` is seeded or reconciled, expected behavior is unchanged: it remains a Driver with its Driver profile, and the HSR Layout - Electronic City trip continues to reference that Driver profile.
- When any non-target Driver or Admin verifies a valid customer LOGIN OTP, expected behavior is unchanged: the request is rejected and no customer session is issued.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The existing `AuthService.verifyOtp` Customer-only LOGIN OTP guard must remain unchanged; every non-target Driver and Admin must continue to be rejected by customer LOGIN OTP authentication.
- `9876543210` must remain the seeded Driver with its existing Driver profile, and the HSR Layout - Electronic City trip must continue to use that exact Driver profile.
- An existing Customer profile and Customer subscriptions for `7019268918` must be retained rather than deleted, recreated, or reset; only the target's role and conflicting Driver profile may be corrected.
- Customer profiles and subscriptions unrelated to the target correction must remain role-consistent and unaltered.
- Existing Customer, Driver, and Admin users other than `7019268918` must retain their roles, profile identities, and associated data.
- Password login, PASSWORD_RESET OTP behavior, OTP issuance, routes, and unrelated application behavior are outside this correction and must remain unchanged.

**Scope:**
All inputs and records that do **not** identify phone `7019268918` for seed reconciliation must be unaffected. This includes:
- Seed initialization and trip association for `9876543210`.
- Customer LOGIN OTP attempts by every non-target Driver and Admin account.
- Customer/profile/subscription initialization and access for every other phone number.
- Existing trips, routes, credentials, OTP records, and historical records.
- Repeated non-production seed startup after the target state has already converged.

## Hypothesized Root Cause

Based on the revised bug description, the most likely causes are:

1. **Overly broad or incorrect target role reconciliation**: `config/database.js` treats `7019268918` as a Driver seed or forcibly converts it to `Driver` during startup.
   - The conversion conflicts with the account's intended Customer identity.
   - The correction must be constrained to this exact phone number and must not affect the independent Driver seed `9876543210`.

2. **Destructive profile/subscription handling during role conversion**: the current reconciliation removes Customer profile and subscription data when assigning the Driver role.
   - Changing only the User role would not restore retained Customer data if the correction continues to delete it.
   - The fix must preserve existing Customer profile/subscription documents and remove or retire only the target's conflicting Driver profile.

3. **Intentional role-based OTP authorization exposes the bad seed state**: `services/authService.js` rejects LOGIN OTP authentication whenever an existing user's role is not `Customer`.
   - This is correct authorization behavior, not a condition to weaken.
   - Changing the OTP gate would admit non-target Drivers and Admins and violate Requirement 3.2.

4. **Risk of collateral seed and trip changes**: prior design assumptions reassigned the preserved Driver/trip relationship from `9876543210` to `7019268918`.
   - The updated requirements explicitly prohibit that reversal.
   - The implementation must leave `9876543210`, its Driver profile, and the HSR Layout - Electronic City trip association untouched.

5. **Naive repair can be non-idempotent or destructive**: blindly creating Customer profiles/subscriptions or deleting all Driver data could duplicate Customer records, lose subscription references, or affect another account.
   - The repair must inspect target state first, reuse existing Customer data, and retire only the target's visible Driver profile.

## Correctness Properties

Property 1: Bug Condition - Target Account Is Restored to a Customer

_For any_ non-production seed/startup state where `isBugCondition` returns true for phone `7019268918`, the fixed `seedDatabase` function SHALL converge that exact account to an active `Customer`, retain its existing valid Customer profile and Customer subscriptions, ensure no visible Driver profile remains for it, and allow a valid LOGIN OTP to complete through the existing normal customer-authenticated flow.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-Target Accounts and Driver Trip Stay Unchanged

_For any_ input where the bug condition does NOT hold, and for every account other than `7019268918`, the fixed code SHALL produce the same role/profile, subscription, trip-association, and customer LOGIN OTP authorization result as the original code, preserving `9876543210` as the Driver for the HSR Layout - Electronic City trip and continuing to reject non-target Driver and Admin customer LOGIN OTP attempts.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct:

**File**: `config/database.js`

**Function**: `seedDatabase(env)`

**Specific Changes:**

1. **Replace the forced Driver reconciliation for the target with an exact-phone Customer reconciliation**:
   - Define a named local seed constant for `targetCustomerPhone = '7019268918'` and use it only for this correction.
   - Find the target `User` by phone. If absent, create it as `role: 'Customer'`, using the established active-status and development seed credential policy.
   - If present, change only this User's role to `Customer` and any required active status. Do not alter its phone, password, password flags, email, tokens, subscriptions, or unrelated User fields.

2. **Retain and converge the target Customer profile and subscriptions**:
   - Query for the target's Customer profile and Customer subscription records before changing profile data.
   - Retain an existing valid Customer profile and its persisted fields exactly as stored; do not delete, recreate, or reset it.
   - Retain existing Customer subscriptions and their associations. Do not remove them as part of role correction.
   - Create a valid Customer profile only when the target truly lacks one, using the existing schema's minimum valid seed data. Do not create duplicate profiles or subscriptions on repeated startup.

3. **Retire only the target's conflicting Driver profile**:
   - Query for visible `Driver` profiles belonging to `7019268918`'s User ID. Retire each such target profile using the model's established soft-delete fields and conventions.
   - Do not delete or change target Customer data, and do not delete, recreate, or mutate Driver profiles belonging to any other User.
   - The convergence invariant is one valid target Customer profile, retained target Customer subscriptions, and zero visible target Driver profiles.

4. **Explicitly preserve the independent Driver and HSR trip relationship**:
   - Leave the existing seed/reconciliation path for `9876543210` as a Driver unchanged.
   - Do not reassign, recreate, or rewrite the HSR Layout - Electronic City trip's Driver profile. It must continue to reference `9876543210`'s existing Driver profile.
   - Do not rewrite any unrelated `Trip`, `Route`, `Subscription`, OTP, or account documents during target reconciliation.

5. **Leave OTP authorization code unchanged**:
   - Make no behavioral changes to `services/authService.js`, `controllers/authController.js`, or OTP routes.
   - Once the target User has role `Customer`, the current `verifyOtp` behavior naturally permits its LOGIN OTP flow while retaining the existing rejection for Driver and Admin users.

6. **Maintain idempotent, non-production-only execution**:
   - Keep the correction inside the existing non-production seed path; production seeding behavior remains unchanged.
   - On repeated seed runs, detect the already-correct target state and avoid duplicate Customer profile/subscription creation or unrelated document changes.
   - Log only high-level reconciliation outcomes without passwords, OTPs, or sensitive profile data. Existing seed error handling must surface failed data operations rather than reporting a false success.

## Testing Strategy

### Validation Approach

The testing strategy first demonstrates that the unfixed seed forces the target into the OTP-ineligible Driver state and removes Customer data, then verifies that the correction converges all target states while preserving non-target accounts. Tests should use isolated MongoDB state (the project already uses `mongodb-memory-server` and Node's built-in test runner), invoke `seedDatabase('test')` directly, and clean model data between cases.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on unfixed code that demonstrate the forced Driver conversion and Customer-data loss for `7019268918`, while confirming the OTP endpoint's Customer-only rule is behaving as designed.

**Test Plan**: Prepare clean and pre-existing target database states, run the unfixed seed, inspect User, Customer, Driver, and subscription documents, store a valid LOGIN OTP record, and call `authService.verifyOtp('7019268918', otp, 'LOGIN')`. Separately snapshot `9876543210`, its Driver profile, and the HSR trip before the run.

**Test Cases**:
1. **Fresh target seed state**: Run the current seed and assert that `7019268918` is made a Driver or otherwise lacks the required Customer state; valid customer LOGIN OTP is rejected. (Will fail after the fix because it is the intended counterexample.)
2. **Existing Customer data destruction**: Precreate `7019268918` as a Customer with a Customer profile and subscriptions, run the current seed, and observe that it is forced to Driver and its Customer data is removed or no longer retained. (Will fail after the fix.)
3. **Conflicting-profile state**: Precreate the target with a Customer profile/subscriptions and a visible Driver profile, run startup seed, and observe that unfixed logic does not converge to Customer-only state while preserving Customer data. (Will fail after the fix.)
4. **Preserved Driver/trip baseline**: Snapshot `9876543210` and the HSR Layout - Electronic City trip, run the seed, and establish that this non-target Driver/profile/trip relationship is the baseline to preserve.

**Expected Counterexamples**:
- `User.phone = '7019268918'` has `role = 'Driver'`, a visible Driver profile, or lacks retained Customer profile/subscription data.
- A valid customer LOGIN OTP for `7019268918` is rejected with the existing non-Customer/password-login response.
- A prior Customer profile or subscription belonging to `7019268918` is deleted, replaced, or disconnected by forced Driver reconciliation.
- Possible causes: hard-coded target Driver role, destructive profile/subscription cleanup, and an incorrect assumption that the target should supply the seeded Driver/trip relationship.

### Fix Checking

**Goal**: Verify that every state satisfying the bug condition converges to the expected Customer state and that existing LOGIN OTP behavior authenticates the corrected target.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  seedDatabase_fixed('test')
  targetUser := findUserByPhone('7019268918')
  result := verifyOtpWithValidLoginRecord(targetUser.phone)

  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  INPUT: result from fixed seed and valid LOGIN OTP verification
  OUTPUT: boolean

  targetUser := findUserByPhone('7019268918')

  RETURN targetUser.role = 'Customer'
         AND targetUser.status = 'ACTIVE'
         AND hasValidVisibleCustomer(targetUser.id)
         AND countVisibleDrivers(targetUser.id) = 0
         AND existingCustomerProfileAndSubscriptionsAreRetained(targetUser.id)
         AND result.success = true
         AND result.user.phone = '7019268918'
         AND result.user.role = 'Customer'
END FUNCTION
```

### Preservation Checking

**Goal**: Verify that inputs outside the target bug condition retain their original behavior, especially the preserved Driver/trip association for `9876543210` and intentional rejection of non-Customer LOGIN OTP accounts.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  originalResult := observeOriginalBehavior(input)
  fixedResult := observeFixedBehavior(input)

  ASSERT originalResult = fixedResult
END FOR
```

**Testing Approach**: Use snapshots of the specifically preserved observable fields rather than mutable timestamps. Property-based testing should generate target pre-states and unrelated account roles, ensuring the correction touches only the target User/Driver profile while retaining target Customer data. Observe the original non-target Driver/Admin OTP rejection and `9876543210` trip association first, then encode those observations as regression expectations.

**Test Cases**:
1. **Preserved seeded Driver and HSR trip**: Snapshot `9876543210`'s role and Driver profile identity plus the HSR Layout - Electronic City trip's Driver reference. Run the fixed seed and assert all these values are unchanged.
2. **Non-target Driver OTP rejection**: Create or seed a non-target Driver, including `9876543210`, store a valid LOGIN OTP, and assert `verifyOtp` still rejects it with the current password-login response.
3. **Non-target Admin OTP rejection**: Create or seed a non-target Admin, store a valid LOGIN OTP, and assert the same rejection result.
4. **Unrelated Customer preservation**: Snapshot a non-target Customer user/profile/subscription fields before startup; run the seed and assert their role, profile identity, subscription associations, and stored fields are unchanged.
5. **Target idempotence and retention**: Run `seedDatabase('test')` twice after preparing target Customer profile/subscription data; assert Customer fields and subscriptions remain present, no duplicate Customer data exists, and no visible target Driver profile remains.

### Unit Tests

- Test target reconciliation from a fresh database: `7019268918` becomes a Customer with a valid Customer profile and no visible Driver profile.
- Test conversion from an old target Driver user/profile: only the target becomes Customer and only its Driver profile is retired.
- Test that pre-existing target Customer profile fields and Customer subscriptions are retained without deletion, reset, or duplicate creation.
- Test a target state containing both profile types: Customer data remains intact and only the target Driver profile is hidden.
- Test valid LOGIN OTP verification for the corrected target returns a Customer-authenticated result.
- Test `9876543210` remains a Driver and the HSR Layout - Electronic City trip continues to reference its Driver profile.
- Test valid LOGIN OTP verification for non-target Driver and Admin accounts remains rejected.

### Property-Based Tests

- Generate target pre-states across `Customer`/`Driver` roles, visible Customer/Driver profile combinations, and Customer subscription presence; after one or more seed runs, assert Property 1's convergence and retention invariant plus successful target LOGIN OTP behavior.
- Generate pre-existing target Customer profile fields and subscription configurations with repeated seed-run counts; assert no data is removed, reset, or duplicated and no visible target Driver profile remains.
- Generate unrelated users with roles `Customer`, `Driver`, and `Admin`; assert their stored role/profile/subscription fields remain unchanged, and assert non-target Drivers/Admins remain rejected by customer LOGIN OTP.
- Generate valid preserved Driver/trip snapshots for `9876543210`; assert fixed seed runs leave its Driver profile identity and the HSR trip's Driver reference unchanged.

### Integration Tests

- Exercise the development/test startup path against an old-seeded `7019268918` Driver account that has Customer data to retain, then call the existing `/auth/send-otp` and `/auth/verify-otp` LOGIN flow and assert a Customer-authenticated response while the Customer profile/subscriptions remain available.
- Exercise the same API flow for `9876543210` and another non-target Admin/Driver, asserting the current customer LOGIN OTP rejection response is preserved.
- Run the seed twice in the same isolated database, then query target User/profiles/subscriptions, `9876543210`'s Driver profile, and the HSR Layout - Electronic City trip to verify idempotence, retention, and preservation.
