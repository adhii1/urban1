# Bugfix Requirements Document

## Introduction

Customers using the customer portal can be blocked from signing in when their account is told to use password login even though the customer-facing portal exposes only OTP login. This fix ensures that every affected customer is given a usable customer-portal authentication route while retaining existing OTP validation and successful-login behavior.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a customer whose account is directed to password login attempts to sign in through the customer portal’s available OTP login flow THEN the system displays “please use password login for this account” and prevents the customer from completing login.

### Expected Behavior (Correct)

2.1 WHEN a customer whose account is directed to password login attempts to sign in through the customer portal’s available OTP login flow THEN the system SHALL provide a usable login route through the customer portal and SHALL NOT block the customer solely by instructing them to use an unavailable password-login flow.

2.2 WHEN an affected customer completes the supported customer-portal login route with valid required credentials or OTP verification THEN the system SHALL authenticate the customer and grant access to the customer portal.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a customer account is already eligible to complete the customer portal’s OTP login flow THEN the system SHALL CONTINUE TO authenticate the customer after successful OTP verification.

3.2 WHEN a customer submits an invalid, expired, or unverified OTP through the customer portal THEN the system SHALL CONTINUE TO deny authentication and present the existing OTP-validation failure behavior.

3.3 WHEN a customer successfully authenticates through the customer portal THEN the system SHALL CONTINUE TO establish the same authenticated customer session and access available before this fix.
