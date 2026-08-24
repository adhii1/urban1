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

/**
 * @param {object} trip  A lean Trip document (passengers[] + serviceDate).
 * @param {object} opts  { customerId?: ObjectId } to attach `myEntry`.
 */
function toTripView(trip, { customerId } = {}) {
  if (!trip) return trip;
  const passengers = (trip.passengers || []).map((p) => ({
    ...p,
    // Legacy alias: old screens read `entry.customer`.
    customer: p.customerId,
    legacyStatus: legacyPassengerStatus(p.status),
  }));

  const manifest = passengers.map((p) => ({
    customer: p.customerId,
    status: legacyPassengerStatus(p.status),
    canonicalStatus: p.status,
    pickupLocation: p.pickupLocation,
    dropLocation: p.dropLocation,
    pickupOrder: p.pickupOrder,
    otp: p.otp,
  }));

  const view = {
    ...trip,
    passengers,
    manifest, // legacy alias
    serviceDate: trip.serviceDate,
    tripDate: trip.serviceDate, // legacy alias
  };

  if (customerId) {
    view.myEntry = passengers.find((p) => {
      const ref = p.customerId && typeof p.customerId === 'object' ? p.customerId._id : p.customerId;
      return ref && String(ref) === String(customerId);
    }) || null;
  }

  return view;
}

module.exports = { toTripView, legacyPassengerStatus };
