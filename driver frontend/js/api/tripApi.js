// TORQQ Driver Trip API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

const TRIP_API = {
    getTrips: () => {
        console.log("🔌 [API] Calling GET /api/v1/driver/trips");
        return fetch(`${API_BASE_URL}/driver/trips`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch trips'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, trips: data.data };
            } else {
                throw new Error(data.message || 'Trips fetch failed.');
            }
        });
    },

    updateTripStatus: (tripId, status) => {
        console.log(`🔌 [API] Calling PUT /api/v1/driver/trips/status to: ${status} for ID: ${tripId}`);
        return fetch(`${API_BASE_URL}/driver/trips/status`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include",
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
            headers: getAuthHeaders(), credentials: "include",
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
