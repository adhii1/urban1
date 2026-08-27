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

const TRIP_API = {
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
            if (data.success) {
                // Transform backend format to frontend expected format.
                // Area-based trips (subscriptions) store riders in passengers[]
                // with pickupLocation/dropLocation. Route-based trips use
                // manifest[].pickupStop/dropStop. Both shapes are handled here.
                const trips = (data.data || []).map(t => {
                    const routeName = t.routeId?.name || '';

                    // ── Area-based passengers[] ─────────────────────────────
                    const rawPassengers = Array.isArray(t.passengers) ? t.passengers : [];
                    // ── Route-based manifest[] ──────────────────────────────
                    const rawManifest = Array.isArray(t.manifest) ? t.manifest : [];

                    // Prefer passengers[] (area-based), fall back to manifest[]
                    const hasPassengers = rawPassengers.length > 0;
                    const hasManifest   = rawManifest.length > 0;

                    const passengers = hasPassengers
                        ? rawPassengers.map((p, index) => {
                            const customer = p.customerId || p.customer || {};
                            const pickupAddr = p.pickupLocation?.address || p.pickupLocation?.stopName || '';
                            const dropAddr   = p.dropLocation?.address  || p.dropLocation?.stopName  || '';
                            return {
                                id:              p._id || `${t._id}-p${index}`,
                                passengerId:     p._id || `${t._id}-p${index}`,
                                tripId:          t._id,
                                manifestEntryId: p._id,
                                name:            customer.name || 'Passenger',
                                passengerName:   customer.name || 'Passenger',
                                phone:           customer.userId?.phone || customer.phone || '',
                                pickup:          pickupAddr || 'Pickup',
                                drop:            dropAddr   || 'Drop',
                                pickupLocation:  p.pickupLocation,
                                dropLocation:    p.dropLocation,
                                lifecycle:       p.status || 'ASSIGNED',
                                permittedAction: 'NONE',
                                pickupStatus:    ['RIDE_STARTED','DROPPING_OFF','COMPLETED'].includes(p.status) ? 'Picked Up' : 'Waiting',
                                dropStatus:      p.status === 'COMPLETED' ? 'Dropped Successfully' : 'Pending',
                                status:          p.status || 'ASSIGNED',
                                seat:            `Seat ${p.pickupOrder || index + 1}`,
                            };
                        })
                        : rawManifest.map((entry, index) => {
                            const customer   = entry.customer || {};
                            const pickupStop = entry.pickupStop || {};
                            const dropStop   = entry.dropStop   || {};
                            return {
                                id:              customer._id || entry._id || `${t._id}-m${index}`,
                                passengerId:     customer._id || entry._id || `${t._id}-m${index}`,
                                tripId:          t._id,
                                manifestEntryId: entry._id,
                                name:            customer.name || 'Passenger',
                                passengerName:   customer.name || 'Passenger',
                                phone:           customer.userId?.phone || customer.phone || '',
                                pickup:          pickupStop.stopName || pickupStop.address || customer.pickupLocation?.address || '',
                                drop:            dropStop.stopName   || dropStop.address   || customer.dropLocation?.address   || '',
                                pickupLocation:  pickupStop.location || pickupStop,
                                dropLocation:    dropStop.location   || dropStop,
                                lifecycle:       entry.status || 'PENDING',
                                permittedAction: entry.permittedAction || 'NONE',
                                pickupStatus:    entry.status === 'BOARDED' || entry.status === 'DROPPED' ? 'Picked Up' : 'Waiting',
                                dropStatus:      entry.status === 'DROPPED' ? 'Dropped Successfully' : 'Pending',
                                status:          entry.status || 'PENDING',
                                seat:            `Passenger ${index + 1}`,
                            };
                        });

                    // ── Pickup / drop display addresses ─────────────────────
                    // For area-based trips, use the first passenger's pickup
                    // and last passenger's drop (already route-optimised by pickupOrder).
                    const orderedPassengers = hasPassengers
                        ? [...passengers].sort((a, b) => (a.seat || '').localeCompare(b.seat || ''))
                        : passengers;

                    const firstP = orderedPassengers[0];
                    const lastP  = orderedPassengers[orderedPassengers.length - 1];

                    const pickup = firstP?.pickup && firstP.pickup !== 'Pickup'
                        ? firstP.pickup
                        : (t.pickup?.address || t.pickupLocation?.address
                            || routeName.split('→')[0]?.trim()
                            || t.routeId?.startLocation
                            || 'Pickup');

                    const drop = lastP?.drop && lastP.drop !== 'Drop'
                        ? lastP.drop
                        : (t.drop?.address || t.dropLocation?.address
                            || routeName.split('→')[1]?.trim()
                            || t.routeId?.endLocation
                            || 'Drop');

                    // ── Date and time ────────────────────────────────────────
                    // serviceDate is normalised to midnight — use pickupTime
                    // (e.g. "08:00") for the time display, not the midnight stamp.
                    const serviceDate = t.serviceDate ? new Date(t.serviceDate) : null;
                    const tripDate    = serviceDate || new Date(t.tripDate || t.createdAt || Date.now());

                    const dateStr = tripDate.toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                    });

                    // pickupTime is "HH:MM" — show it as-is; fall back to
                    // formatting the raw timestamp only when no pickupTime exists.
                    const timeStr = t.pickupTime
                        ? (() => {
                            const [h, m] = t.pickupTime.split(':').map(Number);
                            const d = new Date(tripDate);
                            d.setHours(h, m, 0, 0);
                            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                        })()
                        : tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

                    // Build a proper startsAt so the dashboard schedule sorts right
                    let startsAt = tripDate.toISOString();
                    if (t.pickupTime) {
                        const [h, m] = t.pickupTime.split(':').map(Number);
                        const d = new Date(tripDate);
                        d.setHours(h, m, 0, 0);
                        startsAt = d.toISOString();
                    }

                    return {
                        id:           t._id,
                        status:       t.status === 'SCHEDULED' ? 'AVAILABLE' : (t.status || 'AVAILABLE'),
                        date:         dateStr,
                        time:         timeStr,
                        startsAt,
                        pickup,
                        drop,
                        pickupLocation:  firstP?.pickupLocation || t.pickup || t.pickupLocation,
                        dropLocation:    lastP?.dropLocation   || t.drop   || t.dropLocation,
                        earnings:     t.fare?.estimated || t.fare?.final || 0,
                        passengers,
                        passengerCount: passengers.length,
                        customerName: passengers[0]?.name || t.customerName || 'Passenger',
                        type:         t.type || 'TRIP',
                        pickupTime:   t.pickupTime || '',
                        navigationUrl: t.navigationUrl || '',
                        cancelReason: t.cancelReason || '',
                        distance:     t.fare?.details?.distanceKm ? `${t.fare.details.distanceKm} km` : '—',
                    };
                });
                return { success: true, trips };
            } else {
                throw new Error(data.message || 'Trips fetch failed.');
            }
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
            if (data.success) {
                if (window.STATE) {
                    window.STATE.setState('currentTrip', data.data);
                    
                    if (status === 'COMPLETED') {
                        if (window.EARNING_API && window.EARNING_API.getEarnings) {
                            window.EARNING_API.getEarnings();
                        }
                        if (window.DRIVER_API && window.DRIVER_API.getProfile) {
                            window.DRIVER_API.getProfile();
                        }
                    }
                }
                return { success: true, message: data.message || `Trip status updated to ${status}`, trip: data.data };
            } else {
                throw new Error(data.message || 'Status update failed.');
            }
        });
    },

    ratePassenger: (tripId, rating, comment = "") => {
        console.log(`🔌 [API] Calling POST /api/v1/driver/trips/rate-passenger for: ${tripId} with rating: ${rating}`);
        return fetch(`${API_BASE_URL}/driver/trips/rate-passenger`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'omit',
            body: JSON.stringify({ tripId, rating, comment })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to submit rating'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, message: data.message || "Passenger rating submitted! Thank you." };
            } else {
                throw new Error(data.message || 'Rating submission failed.');
            }
        });
    }
};

window.TRIP_API = TRIP_API;
