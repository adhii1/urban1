// TORQQ Driver Trip API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

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
            // The driver portal must use its own Bearer token, never a shared
            // browser cookie from an admin or customer session.
            credentials: 'omit'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch trips'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                // Transform backend format to frontend expected format
                const trips = (data.data || []).map(t => {
                    const routeName = t.routeId?.name || '';
                    const pickup = t.pickup?.address || t.pickupLocation?.address || routeName.split('→')[0]?.trim() || t.routeId?.startLocation || 'Pickup';
                    const drop = t.drop?.address || t.dropLocation?.address || routeName.split('→')[1]?.trim() || t.routeId?.endLocation || 'Drop';
                    const tripDate = new Date(t.tripDate || t.createdAt || Date.now());
                    return {
                        id: t._id,
                        status: t.status === 'SCHEDULED' ? 'AVAILABLE' : t.status,
                        date: tripDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        time: tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                        startsAt: tripDate.toISOString(),
                        pickup,
                        drop,
                        earnings: t.fare?.estimated || t.fare?.final || 0,
                        passengers: (t.manifest || []).length || 1,
                        customerName: t.customerName || (t.manifest?.[0]?.customer?.name) || 'Customer',
                        type: t.type || 'TRIP',
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
