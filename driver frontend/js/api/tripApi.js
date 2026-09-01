// TORQQ Driver Trip API Client (Connected to Backend)

var API_BASE_URL = (window.TORQQ_API_BASE || '/api/v1');

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    // Never send a blank Bearer header — that would make the backend fall
    // back to a shared browser cookie that may belong to a different role
    // (admin/customer), causing a misleading 403 Insufficient permissions.
    return token
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

// Rider name/phone always come from the server payload. These used to default to
// the literal 'Passenger', which is indistinguishable from a real name once
// rendered — so any gap in the manifest looked like a vehicle full of identical
// people. `null` lets the views label an unresolved rider honestly.
function riderNameOf(rider) {
    return window.UTILS.riderName(rider, null);
}

function riderPhoneOf(rider) {
    return window.UTILS.riderPhone(rider);
}

/**
 * Which lifecycle action the driver may take on a rider right now.
 *
 * Scheduled (subscription) trips are driven over REST against
 * PATCH /driver/trips/:tripId/manifest/:customerId/:action, keyed on the
 * customer. On-demand shuttle rides are driven over the socket, keyed on the
 * ride request. Both are represented here so one card component can render
 * either without guessing from list position.
 */
function permittedActionFor(rider, { isShuttle, tripStatus }) {
    if (rider.permittedAction && rider.permittedAction !== 'NONE') return rider.permittedAction;

    const lifecycle = rider.lifecycle || rider.status;

    if (isShuttle) {
        if (lifecycle === 'PENDING') return 'VERIFY_PICKUP_OTP';
        if (lifecycle === 'BOARDED') return 'COMPLETE_DROP';
        return 'NONE';
    }

    // Per-passenger transitions are rejected by the backend unless the trip row
    // itself is IN_PROGRESS, so no action is offered before the driver starts.
    if (tripStatus !== 'IN_PROGRESS') return 'NONE';
    if (!rider.customerId) return 'NONE';

    if (['ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PENDING'].includes(lifecycle)) return 'VERIFY_PICKUP_OTP';
    if (lifecycle === 'OTP_VERIFIED') return 'BOARD_SCHEDULED_PASSENGER';
    if (['RIDE_STARTED', 'DROPPING_OFF', 'BOARDED'].includes(lifecycle)) return 'COMPLETE_DROP';
    return 'NONE';
}

/**
 * Map one server trip view onto the shape the driver screens read.
 *
 * Shared by the trips list and every status mutation, so a trip never changes
 * shape depending on which call last touched it. Area-based trips (subscriptions)
 * store riders in passengers[] with pickupLocation/dropLocation; route-based
 * trips use manifest[].pickupStop/dropStop. Both are handled.
 */
function normalizeTrip(t) {
    const routeName = t.routeId?.name || '';
    const isShuttle = Boolean(t.shuttleSessionId) || t.type === 'RIDE';

    const rawPassengers = Array.isArray(t.passengers) ? t.passengers : [];
    const rawManifest = Array.isArray(t.manifest) ? t.manifest : [];
    const hasPassengers = rawPassengers.length > 0;

    const passengers = hasPassengers
        ? rawPassengers.map((p, index) => {
            const customer = (p.customerId && typeof p.customerId === 'object') ? p.customerId : (p.customer || {});
            const customerId = customer._id
                || (typeof p.customerId === 'string' ? p.customerId : null)
                || null;
            const name = riderNameOf(p) || riderNameOf(customer);
            const rider = {
                id:               p._id || p.rideRequestId || `${t._id}-p${index}`,
                passengerId:      p._id || p.rideRequestId || `${t._id}-p${index}`,
                tripId:           t._id,
                rideRequestId:    p.rideRequestId || null,
                shuttleSessionId: p.shuttleSessionId || t.shuttleSessionId || null,
                manifestEntryId:  p._id || null,
                customerId,
                name,
                passengerName:    name,
                phone:            riderPhoneOf(p) || riderPhoneOf(customer),
                pickup:           p.pickupLocation?.address || p.pickupLocation?.stopName || '',
                drop:             p.dropLocation?.address || p.dropLocation?.stopName || '',
                pickupLocation:   p.pickupLocation,
                dropLocation:     p.dropLocation,
                lifecycle:        p.status || 'ASSIGNED',
                otp:              p.otp || null,
                otpVerified:      Boolean(p.otp?.verified),
                pickupOrder:      p.pickupOrder ?? index + 1,
                pickupStatus:     ['RIDE_STARTED', 'DROPPING_OFF', 'COMPLETED'].includes(p.status) ? 'Picked Up' : 'Waiting',
                dropStatus:       p.status === 'COMPLETED' ? 'Dropped Successfully' : 'Pending',
                status:           p.status || 'ASSIGNED',
                seat:             `Seat ${p.pickupOrder || index + 1}`,
            };
            rider.permittedAction = permittedActionFor(rider, { isShuttle, tripStatus: t.status });
            return rider;
        })
        : rawManifest.map((entry, index) => {
            const customer = (entry.customer && typeof entry.customer === 'object') ? entry.customer : {};
            const pickupStop = entry.pickupStop || {};
            const dropStop = entry.dropStop || {};
            const customerId = customer._id
                || (typeof entry.customer === 'string' ? entry.customer : null)
                || (typeof entry.customerId === 'string' ? entry.customerId : null)
                || null;
            const name = riderNameOf(entry) || riderNameOf(customer);
            const rider = {
                id:               customerId || entry._id || `${t._id}-m${index}`,
                passengerId:      customerId || entry._id || `${t._id}-m${index}`,
                tripId:           t._id,
                rideRequestId:    entry.rideRequestId || null,
                shuttleSessionId: entry.shuttleSessionId || t.shuttleSessionId || null,
                manifestEntryId:  entry._id || null,
                customerId,
                name,
                passengerName:    name,
                phone:            riderPhoneOf(entry) || riderPhoneOf(customer),
                pickup:           pickupStop.stopName || pickupStop.address || entry.pickupLocation?.address || customer.pickupLocation?.address || '',
                drop:             dropStop.stopName || dropStop.address || entry.dropLocation?.address || customer.dropLocation?.address || '',
                pickupLocation:   pickupStop.location || entry.pickupLocation || pickupStop,
                dropLocation:     dropStop.location || entry.dropLocation || dropStop,
                lifecycle:        entry.canonicalStatus || entry.status || 'PENDING',
                otp:              entry.otp || null,
                otpVerified:      Boolean(entry.otp?.verified),
                pickupOrder:      entry.pickupOrder ?? pickupStop.sequenceOrder ?? index + 1,
                pickupStatus:     ['BOARDED', 'DROPPED'].includes(entry.status) ? 'Picked Up' : 'Waiting',
                dropStatus:       entry.status === 'DROPPED' ? 'Dropped Successfully' : 'Pending',
                status:           entry.status || 'PENDING',
                seat:             `Passenger ${index + 1}`,
            };
            rider.permittedAction = permittedActionFor(rider, { isShuttle, tripStatus: t.status });
            return rider;
        });

    // ── Pickup / drop display addresses ─────────────────────────────────────
    // First passenger's pickup and last passenger's drop, in the optimizer's
    // numeric pickup order. Sorting the `seat` label as a string put "Seat 10"
    // before "Seat 2", which reported the wrong end of the route on larger trips.
    const orderedPassengers = [...passengers].sort(
        (a, b) => (Number(a.pickupOrder) || 0) - (Number(b.pickupOrder) || 0)
    );

    const firstP = orderedPassengers[0];
    const lastP = orderedPassengers[orderedPassengers.length - 1];

    const pickup = firstP?.pickup
        || t.pickup?.address || t.pickupLocation?.address
        || routeName.split('→')[0]?.trim()
        || t.routeId?.startLocation
        || '';

    const drop = lastP?.drop
        || t.drop?.address || t.dropLocation?.address
        || routeName.split('→')[1]?.trim()
        || t.routeId?.endLocation
        || '';

    // ── Date and time ───────────────────────────────────────────────────────
    // serviceDate is normalised to midnight — use pickupTime (e.g. "08:00") for
    // the time display, not the midnight stamp.
    const serviceDate = t.serviceDate ? new Date(t.serviceDate) : null;
    const tripDate = serviceDate || new Date(t.tripDate || t.createdAt || Date.now());

    const dateStr = tripDate.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    const atPickupTime = () => {
        const [h, m] = t.pickupTime.split(':').map(Number);
        const d = new Date(tripDate);
        d.setHours(h, m, 0, 0);
        return d;
    };

    const timeStr = t.pickupTime
        ? atPickupTime().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // A proper startsAt so the dashboard schedule sorts correctly.
    const startsAt = (t.pickupTime ? atPickupTime() : tripDate).toISOString();

    return {
        id:               t._id,
        status:           t.status === 'SCHEDULED' ? 'AVAILABLE' : (t.status || 'AVAILABLE'),
        canonicalStatus:  t.status || 'SCHEDULED',
        date:             dateStr,
        time:             timeStr,
        startsAt,
        pickup,
        drop,
        pickupLocation:   firstP?.pickupLocation || t.pickup || t.pickupLocation,
        dropLocation:     lastP?.dropLocation || t.drop || t.dropLocation,
        earnings:         t.fare?.estimated || t.fare?.final || 0,
        passengers:       orderedPassengers,
        passengerCount:   passengers.length,
        // Null rather than a placeholder when the server sent no name; callers
        // render the gap explicitly.
        customerName:     orderedPassengers[0]?.name || t.customerName || null,
        shuttleSessionId: t.shuttleSessionId || null,
        type:             t.type || 'TRIP',
        pickupTime:       t.pickupTime || '',
        navigationUrl:    t.navigationUrl || '',
        cancelReason:     t.cancelReason || '',
        distance:         t.fare?.details?.distanceKm ? `${t.fare.details.distanceKm} km` : '—',
    };
}

const TRIP_API = {
    normalizeTrip,

    getTrips: (scope = 'all') => {
        const token = localStorage.getItem('driverToken');
        if (!token) {
            return Promise.reject(new Error('Driver session expired. Please sign in again.'));
        }

        console.log(`🔌 [API] Calling GET /api/v1/driver/trips?scope=${scope}`);
        return fetch(`${API_BASE_URL}/driver/trips?scope=${encodeURIComponent(scope)}`, {
            method: 'GET',
            headers: getAuthHeaders(),
            credentials: 'omit'
        })
        .then(async res => {
            if ((res.status === 401 || res.status === 403) && window.refreshDriverSession) {
                const refreshed = await window.refreshDriverSession();
                if (refreshed) {
                    return fetch(`${API_BASE_URL}/driver/trips?scope=${encodeURIComponent(scope)}`, {
                        method: 'GET',
                        headers: getAuthHeaders(),
                        credentials: 'omit'
                    });
                }
            }
            return res;
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch trips'); });
            }
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.message || 'Trips fetch failed.');
            return { success: true, trips: (data.data || []).map(normalizeTrip) };
        });
    },

    updateTripStatus: (tripId, status) => {
        console.log(`🔌 [API] Calling PUT /api/v1/driver/trips/status to: ${status} for ID: ${tripId}`);
        return fetch(`${API_BASE_URL}/driver/trips/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            credentials: 'omit',
            body: JSON.stringify({ tripId, status })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to update trip status'); });
            }
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.message || 'Status update failed.');

            // Normalize before publishing. The response is a server trip view,
            // and pushing it into state raw left every screen reading a
            // different trip shape than the one the list produced.
            const trip = normalizeTrip(data.data);

            if (window.STATE) {
                window.STATE.setState('currentTrip', trip);

                if (status === 'COMPLETED') {
                    if (window.EARNING_API && window.EARNING_API.getEarnings) {
                        window.EARNING_API.getEarnings();
                    }
                    if (window.DRIVER_API && window.DRIVER_API.getProfile) {
                        window.DRIVER_API.getProfile();
                    }
                }
            }
            return { success: true, message: data.message || `Trip status updated to ${status}`, trip };
        });
    },

    /**
     * Advance one passenger on a scheduled trip.
     * PATCH /driver/trips/:tripId/manifest/:customerId/:action
     * action: verify-otp | board | drop | no-show. `verify-otp` requires the
     * boarding code the customer is shown in their own app.
     */
    updatePassengerStatus: (tripId, customerId, action, otp) => {
        console.log(`🔌 [API] Calling PATCH /api/v1/driver/trips/${tripId}/manifest/${customerId}/${action}`);
        return fetch(
            `${API_BASE_URL}/driver/trips/${encodeURIComponent(tripId)}/manifest/${encodeURIComponent(customerId)}/${encodeURIComponent(action)}`,
            {
                method: 'PATCH',
                headers: getAuthHeaders(),
                credentials: 'omit',
                body: JSON.stringify(otp ? { otp } : {})
            }
        )
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to update passenger'); });
            }
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.message || 'Passenger update failed.');
            const trip = normalizeTrip(data.data);
            if (window.STATE) window.STATE.setState('currentTrip', trip);
            return { success: true, message: data.message, trip };
        });
    },
};

window.TRIP_API = TRIP_API;
