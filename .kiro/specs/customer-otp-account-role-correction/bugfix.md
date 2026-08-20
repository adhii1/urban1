# Bugfix Requirements Document

## Introduction

Correct the seeded account with phone `7019268918`, which is currently forcibly converted into a Driver and loses its Customer profile and subscriptions. The correction is limited to making this exact account a Customer that can use the normal customer LOGIN OTP flow. The seeded Driver `9876543210`, including the Driver profile already used by the HSR Layout - Electronic City trip, must remain unchanged.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the database seed initializes or reconciles the account with phone `7019268918` THEN the system assigns it the Driver role, creates or retains a Driver profile, and removes any Customer profile and subscriptions associated with that account.

1.2 WHEN the account with phone `7019268918` attempts customer LOGIN OTP authentication THEN the system rejects the request because the account has the Driver role.

### Expected Behavior (Correct)

2.1 WHEN the database seed initializes or reconciles the account with phone `7019268918` THEN the system SHALL assign it the Customer role, provide or retain a valid Customer profile, and retain any existing Customer profile and subscriptions for that account without creating or retaining a Driver profile for it.

2.2 WHEN the account with phone `7019268918` completes customer LOGIN OTP authentication THEN the system SHALL authenticate it through the normal customer login flow and grant normal customer-authenticated access.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the database seed initializes or reconciles the account with phone `9876543210` THEN the system SHALL CONTINUE TO keep it as the seeded Driver with its Driver profile, and the HSR Layout - Electronic City trip SHALL CONTINUE TO use that Driver profile.

3.2 WHEN an account other than `7019268918` has the Driver or Admin role and attempts customer LOGIN OTP authentication THEN the system SHALL CONTINUE TO reject customer OTP authentication for that account.

3.3 WHEN Customer profiles and subscriptions unrelated to the role correction are initialized or accessed THEN the system SHALL CONTINUE TO preserve their existing role-consistent data without alteration.
