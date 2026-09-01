# Bugfix Requirements Document

## Introduction

The Next.js app at `client/` serves both portals: `client/app/customer/**` for riders and
`client/app/driver/**` for drivers. Two defects are visible to end users, and a third class of
defect sits behind them — server capability that was added but never wired into `client/`.

**Rider identity.** A customer books and the driver sees a label that does not identify them.
The reported symptom ("only one name, not reflecting the real one") is not a caching fault. The
per-user cache in `utils/userCache.js` keys strictly by `String(userId)` and `config/socket.js:313`
resolves the name per connection from that connection's own `Customer` document, so no customer's
name can be served to another. The real cause is that a customer's name is never reliably captured
and can never be corrected:

- the Full Name field in the customer sign-in modal (`client/app/customer/(marketing)/page.tsx:72`)
  carries no `required` attribute, unlike the mobile number beside it, so it is routinely submitted
  empty;
- `authService.verifyOtp` reads the supplied `name` only inside the new-user branch
  (`services/authService.js:145-147`) and persists `User ${phone.slice(-4)}` when it is blank;
- for an existing user the supplied name is discarded entirely (`services/authService.js:148-153`);
- `PUT /api/v1/customer/profile` accepts only the three location fields
  (`controllers/customerController.js:227`), so `name` cannot be changed through any API.

Every unnamed rider therefore persists as `User <last4>`, and the placeholder defaults downstream
(`'Unknown'` in `sockets/customerEvents.js:37` and `services/shuttleMatchingService.js:46,90`,
`'Passenger'` in `services/shuttleLifecycleService.js:57`, `'Customer'` in
`client/app/driver/(dashboard)/assigned-trips/page.tsx:117`) collapse the remainder into a single
generic label. `utils/tripView.js` already refuses to invent a placeholder and returns `null`
instead; the surfaces that bypass it are the ones still showing a fabricated identity.

**Boarding OTP.** The customer cannot read their own boarding code for an on-demand Flexy ride
anywhere in `client/`. `GET /api/v1/rides/my`, `/rides/active` and `/rides/:id` all return the code
(`controllers/rideController.js`), and all three filter on `customerId: req.user.id`, so a customer
can only ever reach their own — the disclosure is correctly scoped, it is simply never read. No hook
for those endpoints exists in `client/lib/hooks/useCustomerQueries.ts`. The only place the code
surfaces today is a transient toast in `client/lib/hooks/useRideBooking.ts`, lost on dismissal or
reload. The `BoardingCode` component in `client/app/customer/(dashboard)/my-trips/page.tsx` covers
scheduled subscription trips only, and has no copy affordance. Meanwhile the customer dashboard
promises an OTP in its own "how it works" copy while rendering none.

**Unfinished integration.** `PUT /api/v1/driver/trips/status` is mounted
(`routes/v1/driverRoutes.js:17`) and implements the `ARRIVING`/`ARRIVED` transitions
(`controllers/driverController.js:438-446`), but nothing under `client/` calls it. Boarding-code
entry runs through a native `window.prompt` (`client/app/driver/(dashboard)/current-trip/page.tsx:228`).
The driver sidebar shows a hardcoded `★ 4.85` (`client/app/driver/(dashboard)/layout.tsx:78`) while
`GET /driver/profile` returns the real rating, rating count and completed-trip count that the
`DriverProfile` type omits. The customer wallet hardcodes `₹ 0.00` and disables top-up while
`GET /api/v1/wallet` and `POST /api/v1/wallet/add` are both mounted. Document upload cannot work end
to end at all: multer writes to the relative, nonexistent `src/uploads`, the controller advertises
`/uploads/documents/<file>` while writing one level above the project root, and nothing serves
`/uploads`.

### Terminology: what a "booking" is

Recorded here because the word invites a wrong assumption. **"Booking" is not a third entity
alongside rides and subscriptions, and no new model or OTP field is needed.**

- `POST /api/v1/book` and `GET /api/v1/booking` are the **subscription** endpoints.
  `bookingController.getMyBooking` (`controllers/bookingController.js:135-160`) queries
  `Subscription.find({ customerId, status: { $in: CURRENT_STATUSES } })` and returns Subscription
  documents — the primary one flattened at the top level, the full list under `data.subscriptions`.
- A `Subscription` carries **no** boarding code. The code lives on the daily `Trip` documents
  generated from that subscription: `services/DailyTripGenerator.js:64` sets
  `otp: { code: generateRideOtp(), verified: false }` per entry in `Trip.passengers[]`.
- A "booking" therefore surfaces its boarding codes through `GET /api/v1/customer/trips` →
  `toTripView` → `myEntry.otp`, which this document already covers.

So there is no missing data source, no `Booking` model to add, and no OTP field to add to
`Subscription`. The gap is that the two journey sources are never **merged into one upcoming view**,
and that one booking-related surface — the post-purchase block on the subscribe page — renders no
code at all.

### Verification approach and constraints

These belong to the plan, not to the behaviour under test, and are recorded here so the design phase
does not rediscover them:

- `client/node_modules` is absent, so `next build`, `tsc --noEmit` and `eslint` cannot run against
  `client/` today. Installing the client dependencies is a prerequisite task, not optional.
- `client/AGENTS.md` is authoritative: Next 16.2.10 has breaking changes from earlier versions.
  Reading the relevant guides under `client/node_modules/next/dist/docs/` is a prerequisite before
  any Next.js code is written, and pre-16 App Router conventions must not be assumed.
- Backend checks need `MONGODB_URI`, `JWT_SECRET` and `REFRESH_SECRET`; no `.env.dev` exists in this
  clone.
- Baseline, confirmed against a clean `git archive HEAD`: `npm run check:contract` passes (verified
  again in this session) and `npm run test:unit` passes. The integration suite has 14 pre-existing
  failures (Subscription validation: `pickupTime` / `subscriptionType` / coordinates required) and
  `checkStartup` has 1 pre-existing failure (Socket.IO browser client). These are the baseline, not
  regressions introduced by this work.
- Where a fix touches secret material or file serving, the security decision must be stated
  explicitly rather than assumed — serving user-uploaded documents publicly is not a default.

## Bug Analysis

### Current Behavior (Defect)

What happens today, verified against the code.

**Rider identity**

1.1 WHEN a customer completes OTP sign-up leaving the optional Full Name field empty THEN the system persists their name as `User <last-4-digits-of-phone>` and treats that placeholder as their real identity for every subsequent booking
1.2 WHEN an already-registered customer signs in again and supplies a name THEN the system discards it and keeps the previously stored placeholder
1.3 WHEN a customer attempts to correct their name THEN the system offers no endpoint or screen that accepts a name change, so the placeholder is permanent
1.4 WHEN a ride or trip is created for a customer whose stored name is a placeholder THEN the system denormalizes that placeholder onto the ride and propagates it unchanged into every driver-facing payload
1.5 WHEN a ride reaches a driver surface with no resolvable rider name THEN the system substitutes a fabricated label (`'Unknown'`, `'Passenger'`, `'Customer'`) that renders indistinguishably from a real name, so a full vehicle appears to hold the same person repeatedly
1.6 WHEN the driver views the ride queue or assigned trips in the client app THEN the system renders the raw denormalized name without the null-safe resolver, so server-side placeholders reach the screen verbatim
1.7 WHEN the customer's own name is unresolved in the client app THEN the system greets them as `Rider` rather than indicating that their name is not yet set

**Boarding OTP**

1.8 WHEN a customer has an on-demand Flexy ride with an issued boarding code THEN the system shows that code nowhere in the client app — not on the dashboard, not in my-trips, not on the ride detail screen
1.9 WHEN a driver accepts a customer's on-demand ride THEN the system discloses the boarding code only inside a dismissible toast, so the code is unrecoverable once dismissed
1.10 WHEN a customer reloads the page after their ride was accepted THEN the system loses the boarding code entirely, because no client hook reads the endpoints that return it
1.11 WHEN a customer reads the dashboard's own "how your commute works" copy THEN the system promises they will be notified with an OTP while providing no place to see one
1.12 WHEN a customer is shown a boarding code for a scheduled subscription trip THEN the system offers no way to copy it, unlike the equivalent screen in the static customer frontend

**Unfinished integration**

1.13 WHEN a driver needs to mark that they are en route to or have arrived at a pickup THEN the system exposes no control in the client driver portal, because nothing calls the mounted endpoint that performs those transitions
1.14 WHEN a driver boards a passenger against their boarding code THEN the system collects the code through a native browser prompt that is unstyled, inconsistent with the rest of the portal, and inaccessible
1.15 WHEN a driver views their own profile widget THEN the system displays a hardcoded rating of 4.85 and omits their real rating, rating count and completed-trip count, all of which the profile endpoint already returns
1.16 WHEN a customer opens the wallet screen THEN the system displays a hardcoded balance of ₹0.00 and an inert Add Money button, despite mounted endpoints that return the real balance, the transaction history, and accept a top-up
1.17 WHEN a customer dashboard request fails THEN the system swallows the error and renders "No Active Commute", which is indistinguishable from genuinely having no subscription
1.18 WHEN a driver or customer uploads a document THEN the system attempts to write to a relative directory that does not exist, records a URL under a path no route serves, and reads from a directory above the project root, so the upload fails and any stored URL is unreachable

**Upcoming rides across both journey sources, and driver-side rider identity**

1.19 WHEN a customer holds both booking/subscription trips and on-demand Flexy rides THEN the system offers no single upcoming-rides view — the two are never merged into one chronological list, so the customer must visit different screens to find their next journey and its code (`client/app/customer/(dashboard)/my-trips/page.tsx` reads only `useCustomerTrips`; nothing under `client/` reads `/rides/my`)
1.20 WHEN a customer has an on-demand ride in `PENDING`, `ACCEPTED` or `DRIVER_ARRIVING` THEN the system omits it from Upcoming entirely, because `client/app/customer/(dashboard)/my-trips/page.tsx:108` filters the `upcoming` tab to `status === 'SCHEDULED' || 'IN_PROGRESS'` over subscription trips only — so neither the ride nor its boarding code ever appears there
1.21 WHEN a customer has just completed a booking THEN the system renders the generated trips at `client/app/customer/(dashboard)/subscribe/page.tsx:517` as bare date chips with no boarding code and no link to a surface that has one, so the customer is shown their upcoming trips with no way to reach the code for any of them
1.22 WHEN a driver works from the ride queue or assigned-trips surfaces of `client/` THEN the system renders rider identity without the null-safe resolver, so a server-side placeholder reaches the screen verbatim: `client/app/driver/(dashboard)/ride-queue/page.tsx:817,888,955,1012,1033,1064` render raw `customerName`, and `client/app/driver/(dashboard)/assigned-trips/page.tsx:117` substitutes the literal `'Customer'` (this is the driver half of 1.6, stated as its own clause because it was called out specifically; see 1.6 for the analysis rather than repeating it here)

### Expected Behavior (Correct)

**Rider identity**

2.1 WHEN a customer completes OTP sign-up THEN the system SHALL require a non-empty name before the account is created, so no rider is persisted under a generated placeholder
2.2 WHEN an already-registered customer signs in and supplies a name THEN the system SHALL persist it when the stored name is absent or is a generated placeholder, and SHALL leave a name the customer set deliberately untouched
2.3 WHEN a customer edits their name THEN the system SHALL accept the change through the customer profile endpoint, validate it, persist it, and reflect it on the customer's own screens
2.4 WHEN a ride or trip is created THEN the system SHALL denormalize the customer's actual stored name, and SHALL resolve it from the `Customer` record if the denormalized value is missing
2.5 WHEN a rider name cannot be resolved THEN the system SHALL carry `null` rather than a fabricated label, matching the contract already established in `utils/tripView.js`
2.6 WHEN a driver surface renders a rider whose name is unresolved THEN the system SHALL show a visually distinct "details unavailable" state rather than a string that reads as a name, on every driver surface without exception
2.7 WHEN the customer's own name is not yet set THEN the system SHALL prompt them to set it rather than presenting a placeholder as their name

**Boarding OTP**

2.8 WHEN a customer has an on-demand Flexy ride with an issued boarding code THEN the system SHALL display that code in full on the customer's dashboard, my-trips list and ride detail screen
2.9 WHEN a driver accepts a customer's on-demand ride THEN the system SHALL make the boarding code persistently readable in the app, not only as a transient notification
2.10 WHEN a customer reloads or revisits the app during an active ride THEN the system SHALL refetch and re-display their boarding code from the server
2.11 WHEN a customer has a ride or trip but no code has been issued yet THEN the system SHALL state that the code is issued once a driver is assigned, distinguishing "not yet issued" from "failed to load"
2.12 WHEN a customer is shown a boarding code THEN the system SHALL render it as individual digit tiles with a copy control and a verified state, reaching parity with the static customer frontend
2.13 WHEN any endpoint returns boarding-code material THEN the system SHALL disclose only the requesting customer's own code and SHALL withhold every other rider's, and this SHALL be asserted by test rather than assumed

**Unfinished integration**

2.14 WHEN a driver marks that they are en route to or have arrived at a pickup THEN the system SHALL call the mounted trip-status endpoint through a typed client hook and reflect the resulting passenger states in the portal
2.15 WHEN a driver boards a passenger against their boarding code THEN the system SHALL collect the code through an in-app, styled, keyboard-accessible entry affordance consistent with the rest of the driver portal
2.16 WHEN a driver views their own profile widget THEN the system SHALL display their real rating, rating count and completed-trip count, and SHALL type those fields on the client profile model
2.17 WHEN a customer opens the wallet screen THEN the system SHALL display the balance and transactions returned by the wallet endpoint and SHALL allow a top-up through the endpoint that accepts one
2.18 WHEN a customer dashboard request fails THEN the system SHALL surface the failure distinctly from an empty result
2.19 WHEN a document is uploaded THEN the system SHALL write it to a single agreed storage location, record a URL that resolves, and serve it through a route that authorizes the requester; the choice between authenticated and public serving SHALL be stated explicitly in the design rather than defaulted

**Upcoming rides across both journey sources, and driver-side rider identity**

2.20 WHEN a customer opens their upcoming rides THEN the system SHALL present scheduled trips generated from a booking/subscription and on-demand Flexy rides in one chronological list, each labelled with which kind it is, and each carrying its own boarding code
2.21 WHEN a customer has an on-demand ride in a pre-boarding state (`PENDING`, `ACCEPTED`, `DRIVER_ARRIVING`) THEN the system SHALL include it under Upcoming and SHALL show its boarding code there
2.22 WHEN a customer has just completed a booking THEN the system SHALL either show the boarding code for each generated upcoming trip or state that codes are issued closer to the service day, and SHALL link to the surface where they can be read
2.23 WHEN any driver surface under `client/` renders a rider THEN the system SHALL resolve the name through the shared resolver and SHALL render the visually distinct unresolved state when it returns null, with no surface exempt

### Unchanged Behavior (Regression Prevention)

**Identity**

3.1 WHEN a customer has a real name they supplied THEN the system SHALL CONTINUE TO store it verbatim and show it unchanged on customer and driver surfaces
3.2 WHEN a driver or admin views a trip manifest THEN the system SHALL CONTINUE TO resolve each rider's name from their `Customer` record and CONTINUE TO return `null` rather than a placeholder when none exists
3.3 WHEN a customer updates their home, pickup or drop location THEN the system SHALL CONTINUE TO validate and persist those fields exactly as it does today
3.4 WHEN an admin creates a customer with an explicit name THEN the system SHALL CONTINUE TO persist that name unchanged

**OTP and disclosure**

3.5 WHEN a customer reads a shared subscription trip THEN the system SHALL CONTINUE TO expose only their own boarding code on `myEntry` and CONTINUE TO strip every co-passenger's code
3.6 WHEN a driver or admin reads a trip THEN the system SHALL CONTINUE TO see every passenger's boarding code, since verifying them at pickup is the point
3.7 WHEN a customer requests their own rides THEN the system SHALL CONTINUE TO return only rides where they are the customer
3.8 WHEN a driver verifies a boarding code THEN the system SHALL CONTINUE TO reject an incorrect code and CONTINUE TO refuse to board a passenger on the driver's word alone

**Existing flows**

3.9 WHEN a driver starts or completes a trip through the existing PATCH endpoints THEN the system SHALL CONTINUE TO honour those calls and their guards, including refusing completion while a boarded passenger has not been dropped
3.10 WHEN a customer requests an on-demand ride over the customer socket THEN the system SHALL CONTINUE TO validate the payload, estimate the fare, and create the ride as it does today
3.11 WHEN a customer purchases, pauses, cancels or relocates a subscription THEN the system SHALL CONTINUE TO behave exactly as it does today
3.12 WHEN a customer or driver signs in with a password THEN the system SHALL CONTINUE TO authenticate them without touching the OTP path
3.13 WHEN a non-customer role attempts OTP sign-in THEN the system SHALL CONTINUE TO redirect them to password login
3.14 WHEN the contract check and unit suites run THEN the system SHALL CONTINUE TO pass both, and the 14 known integration failures plus 1 known startup failure SHALL remain the only failures
3.15 WHEN the two static frontends under `customer frontend/` and `driver frontend/` are used THEN the system SHALL CONTINUE TO serve them and CONTINUE TO honour the behaviour fixed for them previously

**Upcoming rides and the booking response shape**

3.16 WHEN a customer holds only subscription trips and no on-demand rides THEN the system SHALL CONTINUE TO render their my-trips list exactly as it does today, including the existing filter tabs and pagination behaviour
3.17 WHEN `GET /api/v1/booking` is called THEN the system SHALL CONTINUE TO return the primary subscription flattened at the top level alongside `data.subscriptions`, since `client/app/customer/(dashboard)/subscribe/page.tsx:170` reads that shape after a purchase
