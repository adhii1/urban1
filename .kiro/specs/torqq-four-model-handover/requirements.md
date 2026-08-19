# Requirements Document

## Introduction

Complete the TORQQ four-model commute handover across Route, Subscription, Trip, and ShuttleSession. The feature must make the four customer-plan models enforceable on the server, generate reliable scheduled-service trips, preserve on-demand shared-ride passenger lifecycles, and expose operationally useful driver and administrator views. P0 requirements are required for functional completion; P1 requirements improve safe operation and change management.

## Glossary

- **TORQQ_Commute_System**: The backend, customer frontend, driver frontend, and administrator frontend that operate TORQQ commute services.
- **Subscription_Service**: The TORQQ_Commute_System component that validates and activates customer plan subscriptions.
- **Trip_Generator**: The TORQQ_Commute_System component that creates and reconciles scheduled Trip records from active subscriptions.
- **Route_Service**: The TORQQ_Commute_System component that validates active designated routes, ordered stops, and route changes.
- **Flexy_Service**: The TORQQ_Commute_System component that manages immediate and scheduled Flexy ride requests.
- **Shuttle_Service**: The TORQQ_Commute_System component that creates and advances bundled on-demand ShuttleSession records.
- **Driver_Client**: The TORQQ driver frontend.
- **Admin_Console**: The TORQQ administrator frontend.
- **Active_Route**: A non-deleted Route record whose status is `ACTIVE` and that has at least two designated stops with valid coordinates and distinct sequence orders.
- **Managed_Stop**: A designated stop belonging to an Active_Route, identified by its immutable route stop reference or validated current index and sequence order.
- **Eligible_Subscription**: An active, non-deleted Subscription whose service date falls within its inclusive start and end dates and satisfies its tier schedule.
- **Service_Date**: The local calendar date used to determine subscription eligibility and scheduled Trip generation.
- **Trip_Manifest**: The ordered passenger entries on a Trip, each containing the customer, subscription, selected pickup stop, selected drop stop, and passenger lifecycle status.
- **Shuttle_Passenger**: A RideRequest assigned to a ShuttleSession.
- **Passenger_Lifecycle**: The per-passenger progression `PENDING` → `BOARDED` → `DROPPED`, or `PENDING` → `NO_SHOW`, with timestamps where applicable.
- **Route_Change**: An administrator change to a Route’s active state, designated stops, stop order, or assigned driver.

## Requirements

### Requirement 1: P0 — Validate managed Home-to-Office subscriptions

**User Story:** As a commuter, I want managed Home-to-Office plans to accept only serviceable locations and valid route stops, so that scheduled transport can serve my commute.

#### Acceptance Criteria

1. WHEN a customer submits a Hybrid or Weekday Home-to-Office subscription with an Active_Route, THE Subscription_Service SHALL calculate the server-side geodesic distance from the customer pickup location to the selected pickup Managed_Stop and from the customer drop location to the selected drop Managed_Stop.
2. WHEN each calculated managed-stop distance is less than or equal to 5.0 kilometres, THE Subscription_Service SHALL accept the distance validation.
3. IF either calculated managed-stop distance is greater than 5.0 kilometres, THEN THE Subscription_Service SHALL reject the subscription on the first detected validation failure before creating a payment order.
4. WHEN a customer submits selected Managed_Stops, THE Subscription_Service SHALL accept only two different stops on the selected Active_Route whose pickup sequence order is less than the drop sequence order.
5. IF a selected route is not an Active_Route or a selected stop is absent from that route, THEN THE Subscription_Service SHALL reject the subscription before creating a payment order.

### Requirement 2: P0 — Enforce Hybrid and Weekday schedules

**User Story:** As a recurring commuter, I want my plan schedule to be enforced consistently, so that generated service matches the plan I purchased.

#### Acceptance Criteria

1. WHEN a customer submits a Hybrid subscription, THE Subscription_Service SHALL accept exactly three distinct selected weekdays from Monday through Friday.
2. IF a Hybrid subscription contains fewer than three selected weekdays, more than three selected weekdays, duplicate selected weekdays, Saturday, or Sunday, THEN THE Subscription_Service SHALL reject the subscription before creating a payment order.
3. WHEN the Trip_Generator evaluates an Eligible_Subscription for a Hybrid plan, THE Trip_Generator SHALL generate a Trip_Manifest entry only on one of the subscription’s three selected weekdays.
4. WHEN the Trip_Generator evaluates an Eligible_Subscription for a Weekday plan, THE Trip_Generator SHALL generate a Trip_Manifest entry only from Monday through Friday.
5. IF the Service_Date is Saturday or Sunday, or the Subscription status is not `ACTIVE`, THEN THE Trip_Generator SHALL generate no Weekday-plan Trip_Manifest entry.

### Requirement 3: P0 — Operate Flexy immediate and scheduled rides

**User Story:** As a Flexy customer, I want to request either an immediate or scheduled ride, so that on-demand travel uses the correct lifecycle.

#### Acceptance Criteria

1. WHEN a customer selects a Flexy plan, THE Flexy_Service SHALL direct the customer to the on-demand booking flow rather than create a recurring Subscription.
2. WHEN a customer submits a valid immediate Flexy booking, THE Flexy_Service SHALL create a RideRequest with an immediate pickup intent and status `PENDING`.
3. WHEN a customer submits a valid future Flexy booking, THE Flexy_Service SHALL create a RideRequest with the requested scheduled pickup time and status `SCHEDULED`.
4. WHEN the scheduled pickup time becomes due for a scheduled Flexy RideRequest, THE Flexy_Service SHALL transition the RideRequest to `PENDING` exactly once.
5. IF a Flexy booking has an invalid pickup time or is submitted for a past scheduled pickup time, THEN THE Flexy_Service SHALL reject the booking without creating a RideRequest.

### Requirement 4: P0 — Create idempotent scheduled trips and manifests

**User Story:** As an operator, I want eligible recurring subscriptions converted into route trips and manifests, so that drivers receive complete daily work.

#### Acceptance Criteria

1. WHEN the Trip_Generator processes an eligible Service_Date, THE Trip_Generator SHALL create or update one scheduled Trip for each Active_Route with Eligible_Subscriptions on that Service_Date.
2. WHEN the Trip_Generator adds an Eligible_Subscription to a Trip, THE Trip_Generator SHALL create one Trip_Manifest entry containing that subscription’s customer, subscription identifier, selected pickup Managed_Stop, selected drop Managed_Stop, and status `PENDING`.
3. WHEN the Trip_Generator is rerun for the same Active_Route and Service_Date, THE Trip_Generator SHALL preserve one scheduled Trip and one Trip_Manifest entry per eligible subscription.
4. WHEN an Active_Route has an active assigned driver, THE Trip_Generator SHALL assign that driver to each generated scheduled Trip for the route.
5. IF assigning an active assigned driver to a generated scheduled Trip fails, THEN THE Trip_Generator SHALL fail that Trip creation and record the assignment failure for the Admin_Console.
6. IF an Active_Route has no active assigned driver, THEN THE Trip_Generator SHALL record the generated Trip as unassigned and expose the assignment exception to the Admin_Console.

### Requirement 5: P0 — Validate Stop-to-Stop subscriptions

**User Story:** As a Stop-to-Stop commuter, I want to choose only designated active route stops, so that my scheduled journey can be manifested reliably.

#### Acceptance Criteria

1. WHEN a customer submits a Stop-to-Stop subscription, THE Subscription_Service SHALL accept only a plan configured for Stop-to-Stop service and an Active_Route.
2. WHEN a customer submits Stop-to-Stop pickup and drop selections, THE Subscription_Service SHALL require two different Managed_Stops on the selected Active_Route with pickup sequence order less than drop sequence order.
3. IF a Stop-to-Stop selection references an inactive route, a deleted route, an unknown stop, identical stops, or reverse stop order, THEN THE Subscription_Service SHALL reject the subscription before creating a payment order.
4. WHEN a valid Stop-to-Stop subscription becomes an Eligible_Subscription, THE Trip_Generator SHALL generate its Trip_Manifest entry using the selected designated stops.

### Requirement 6: P0 — Preserve ShuttleSession passenger identity and lifecycle

**User Story:** As a bundled-ride passenger and driver, I want every passenger’s shuttle assignment and pickup/drop state to remain distinct, so that multi-passenger rides are completed safely.

#### Acceptance Criteria

1. WHEN a driver accepts a bundled on-demand ride, THE Shuttle_Service SHALL create one durable ShuttleSession identifier and persist that identifier on every Shuttle_Passenger before acknowledging acceptance.
2. WHEN the Shuttle_Service accepts a Shuttle_Passenger, THE Shuttle_Service SHALL persist a passenger-specific OTP, pickup location, drop location, and `PENDING` Passenger_Lifecycle state for that Shuttle_Passenger.
3. WHEN a driver verifies a Shuttle_Passenger OTP using the matching ShuttleSession identifier and RideRequest identifier, THE Shuttle_Service SHALL transition only that Shuttle_Passenger from `PENDING` to `BOARDED` and record the boarding time.
4. IF a driver submits a Shuttle_Passenger OTP with a mismatched ShuttleSession identifier, RideRequest identifier, assigned driver, expired OTP, or incorrect OTP, THEN THE Shuttle_Service SHALL reject the transition without changing any Passenger_Lifecycle state.
5. WHEN a driver completes a boarded Shuttle_Passenger drop using the matching ShuttleSession identifier and RideRequest identifier, THE Shuttle_Service SHALL transition only that Shuttle_Passenger from `BOARDED` to `DROPPED` and record the drop time.
6. WHEN every Shuttle_Passenger in a ShuttleSession is `DROPPED`, THE Shuttle_Service SHALL transition the ShuttleSession to `COMPLETED`.

### Requirement 7: P1 — Reconcile route changes safely

**User Story:** As an administrator, I want route changes to preserve valid future travel and surface conflicts, so that commuters and drivers are not silently assigned to invalid service.

#### Acceptance Criteria

1. WHEN an administrator changes an Active_Route’s assigned driver, THE Route_Service SHALL update each future scheduled Trip on that route that is not `COMPLETED` or `CANCELLED` with the new active driver and skip `COMPLETED` and `CANCELLED` trips.
2. WHEN an administrator deactivates a route or removes or reorders a Managed_Stop, THE Route_Service SHALL identify every future scheduled Trip_Manifest entry made invalid by the Route_Change.
3. WHEN a Route_Change invalidates a future Trip_Manifest entry, THE Route_Service SHALL mark the entry as requiring administrator resolution and expose the route, trip, subscription, and invalid selection in the Admin_Console.
4. WHEN an administrator resolves a Route_Change conflict with valid replacement stops, THE Route_Service SHALL update the affected Subscription and all future non-terminal Trip_Manifest entries to the replacement stops.

### Requirement 8: P1 — Provide structured driver and administrator operations

**User Story:** As a driver and administrator, I want authoritative passenger and service views, so that I can execute journeys and resolve exceptions.

#### Acceptance Criteria

1. WHEN a driver receives an accepted ShuttleSession or scheduled Trip assignment, THE Driver_Client SHALL display one structured passenger item per passenger with passenger name, trip or ride identifier, pickup, drop, lifecycle status, and the action permitted by that status.
2. WHEN a passenger lifecycle changes, THE Driver_Client SHALL update the corresponding structured passenger item without changing another passenger item’s lifecycle.
3. WHEN an administrator views recurring service operations, THE Admin_Console SHALL display each future Trip with route, Service_Date, assigned driver or unassigned state, manifest passenger count, and Trip status.
4. WHEN an administrator views a Trip_Manifest or ShuttleSession, THE Admin_Console SHALL display each passenger’s selected stops or pickup/drop locations, Passenger_Lifecycle state, and timestamped boarding or drop events when available.
5. WHEN the Trip_Generator encounters an unassigned route, an invalidated manifest entry, or a generation failure, THE Admin_Console SHALL display an actionable exception containing the affected route, Service_Date, and reason.

### Requirement 9: P0 — Verify the mandatory lifecycle matrix

**User Story:** As a release owner, I want automated coverage of the handover contracts, so that completion can be demonstrated without manual inference.

#### Acceptance Criteria

1. WHEN the automated server test suite evaluates managed-stop distance validation, THE test suite SHALL cover accepted 4.9-kilometre and 5.0-kilometre cases and a rejected greater-than-5.0-kilometre case.
2. WHEN the automated server test suite evaluates Hybrid subscriptions, THE test suite SHALL cover exactly three distinct Monday-through-Friday selections and rejection of invalid cardinality, duplicate, Saturday, and Sunday selections.
3. WHEN the automated server test suite evaluates Weekday subscriptions, THE test suite SHALL cover generation on each weekday from Monday through Friday and no generation on Saturday or Sunday.
4. WHEN the automated server test suite evaluates Flexy rides, THE test suite SHALL cover immediate booking, future scheduled booking, due-time transition, invalid-time rejection, and idempotent due-time processing.
5. WHEN the automated server test suite evaluates Stop-to-Stop subscriptions and the Trip_Generator, THE test suite SHALL cover active designated-stop acceptance, invalid route or stop rejection, route driver assignment, manifest construction, unassigned-route exception, and same-date idempotency.
6. WHEN the automated end-to-end test suite evaluates a bundled ShuttleSession, THE test suite SHALL cover durable session linkage, distinct passenger OTP acceptance, rejection of cross-passenger actions, and independent per-passenger drop completion.
7. WHEN the automated end-to-end test suite evaluates operational interfaces, THE test suite SHALL cover Driver_Client structured passenger rendering and Admin_Console trip and exception observability.
