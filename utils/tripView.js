/**
 * tripView — serialize a canonical Trip (passengers[] + serviceDate) for API
 * responses, including backward-compatible aliases (`manifest`, `tripDate`, and
 * a legacy per-entry status) so both the new and legacy client screens render
 * the same trip without a simultaneous full frontend rewrite.
 */

// Canonical per-passenger status -> legacy manifest status used by older
// client screens (PENDING/BOARDED/DROPPED/NO_SHOW).
function legacyPassengerStatus(status) {
  switch (status) {
    case 'RIDE_STARTED':
    case 'DROPPING_OFF':
      return 'BOARDED';
    case 'COMPLETED':
      return 'DROPPED';
    case 'NO_SHOW':
      return 'NO_SHOW';
    default:
      // ASSIGNED, DRIVER_EN_ROUTE, DRIVER_ARRIVED, OTP_VERIFIED
      return 'PENDING';
  }
}

function refId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

/**
 * The display name for a manifest/passenger entry, taken only from real data.
 *
 * Deliberately returns null rather than a placeholder like 'Passenger': a
 * generic string is indistinguishable from a real name in the UI, which is how
 * every driver screen ended up showing the same person for every customer. The
 * frontends decide how to render an unresolved rider.
 */
function displayName(customerRef) {
  if (!customerRef || typeof customerRef !== 'object') return null;
  const name = typeof customerRef.name === 'string' ? customerRef.name.trim() : '';
  return name || null;
}

function displayPhone(customerRef) {
  if (!customerRef || typeof customerRef !== 'object') return null;
  return customerRef.userId?.phone || customerRef.phone || null;
}

/**
 * Boarding OTP visibility.
 *
 * A trip is shared, so `passengers[].otp.code` is per-rider secret material:
 * the driver needs every code to board the vehicle, but a customer must only
 * ever receive their own. `viewer: 'customer'` keeps the requester's code and
 * reduces everyone else's entry to its verification flag.
 */
function scopeOtp(otp, { revealCode }) {
  if (!otp) return otp;
  const verified = Boolean(otp.verified);
  if (!revealCode) return { verified };
  return { code: otp.code, verified, ...(otp.expiresAt ? { expiresAt: otp.expiresAt } : {}) };
}

/**
 * @param {object} trip  A lean Trip document (passengers[] + serviceDate).
 * @param {object} opts
 *   customerId  attach `myEntry` for this customer.
 *   viewer      'driver' | 'admin' | 'customer'. A customer viewer only ever
 *               receives their own boarding OTP code.
 */
function toTripView(trip, { customerId, viewer = 'driver' } = {}) {
  if (!trip) return trip;

  const scopesOtp = viewer === 'customer';
  const isViewer = (entry) => Boolean(customerId) && refId(entry.customerId) === String(customerId);

  const passengers = (trip.passengers || []).map((p) => ({
    ...p,
    // Legacy alias: old screens read `entry.customer`.
    customer: p.customerId,
    passengerName: displayName(p.customerId),
    passengerPhone: displayPhone(p.customerId),
    legacyStatus: legacyPassengerStatus(p.status),
    otp: scopeOtp(p.otp, { revealCode: !scopesOtp || isViewer(p) }),
  }));

  // `manifest` is the legacy alias every older driver/customer screen reads.
  // Area-based trips (subscriptions) derive it from passengers[]; route-based
  // trips already store real manifest entries and must keep them.
  //
  // Previously this always projected passengers[], so a route-based trip — which
  // has an empty passengers[] by design — was serialized with `manifest: []`
  // and its riders disappeared from every screen, leaving the UI to fall back
  // on placeholder names.
  const derivedManifest = passengers.map((p) => ({
    customer: p.customerId,
    customerId: p.customerId,
    passengerName: p.passengerName,
    passengerPhone: p.passengerPhone,
    status: legacyPassengerStatus(p.status),
    canonicalStatus: p.status,
    pickupLocation: p.pickupLocation,
    dropLocation: p.dropLocation,
    pickupOrder: p.pickupOrder,
    otp: p.otp,
  }));

  const storedManifest = (trip.manifest || []).map((entry) => ({
    ...entry,
    customerId: entry.customer,
    passengerName: displayName(entry.customer),
    passengerPhone: displayPhone(entry.customer),
    canonicalStatus: entry.status,
  }));

  const manifest = passengers.length > 0 ? derivedManifest : storedManifest;

  const view = {
    ...trip,
    passengers,
    manifest, // legacy alias
    serviceDate: trip.serviceDate,
    tripDate: trip.serviceDate, // legacy alias
  };

  if (customerId) {
    view.myEntry = passengers.find(isViewer)
      || storedManifest.find((entry) => refId(entry.customer) === String(customerId))
      || null;
  }

  return view;
}

module.exports = { toTripView, legacyPassengerStatus };
