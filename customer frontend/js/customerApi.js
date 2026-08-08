/**
 * TORQQ Customer API Client Wrapper
 * Handles JWT injection, token refreshing, and server communication
 */

const CUSTOMER_API = (() => {
    var API_BASE_URL = 'http://localhost:4000/api/v1';

    // Core fetch wrapper
    async function request(endpoint, options = {}) {
        const token = localStorage.getItem('accessToken');
        
        // Initialize headers
        const headers = options.headers || {};
        if (token && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

            // Attempt session token refresh if 401 unauthorized
            if (response.status === 401 && localStorage.getItem('refreshToken')) {
                console.warn('Access token expired. Attempting refresh...');
                const refreshed = await refreshSessionToken();
                if (refreshed) {
                    // Retry original request with new token
                    headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
                    response = await fetch(`${API_BASE_URL}${endpoint}`, config);
                } else {
                    // Force logout on failure
                    logoutUser();
                    throw new Error('Session expired. Please log in again.');
                }
            }

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.message || `Request failed with code ${response.status}`);
            }

            return payload;
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // Refresh JWT session tokens
    async function refreshSessionToken() {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (res.ok) {
                const payload = await res.json();
                if (payload.success && payload.data) {
                    localStorage.setItem('accessToken', payload.data.accessToken);
                    if (payload.data.refreshToken) {
                        localStorage.setItem('refreshToken', payload.data.refreshToken);
                    }
                    return true;
                }
            }
            return false;
        } catch (err) {
            console.error('Failed to refresh token:', err);
            return false;
        }
    }

    // Clear local storage and redirect to login
    function logoutUser() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userName');
        localStorage.removeItem('mobileNumber');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        window.location.href = 'index.html';
    }

    return {
        logout: logoutUser,

        // Profile
        getProfile: () => request('/customer/profile'),
        updateProfile: (data) => request('/customer/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        uploadProfileImage: (formData) => request('/customer/profile/upload', {
            method: 'POST',
            body: formData // Fetch handles multipart/form-data boundary automatically when body is FormData
        }),
        removeProfileImage: () => request('/customer/profile/image', {
            method: 'DELETE'
        }),

        // Settings / Preferences
        getSettings: () => request('/customer/settings'),
        updateSettings: (data) => request('/customer/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

        // Dashboard Aggregates
        getDashboard: () => request('/customer/dashboard'),

        // Emergency Contacts
        getEmergencyContacts: () => request('/customer/emergency-contacts'),
        addEmergencyContact: (data) => request('/customer/emergency-contacts', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        updateEmergencyContact: (id, data) => request(`/customer/emergency-contacts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        deleteEmergencyContact: (id) => request(`/customer/emergency-contacts/${id}`, {
            method: 'DELETE'
        }),

        // Bookings & Routes
        searchRoutes: () => request('/bookings/routes'),
        getRouteDetails: (id) => request(`/bookings/routes/${id}`),
        getBookings: (type = 'upcoming') => request(`/bookings?type=${type}`),
        getBookingDetails: (id) => request(`/bookings/${id}`),
        bookRide: (data) => request('/bookings', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        rescheduleBooking: (id, data) => request(`/bookings/${id}/reschedule`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        cancelBooking: (id) => request(`/bookings/${id}`, {
            method: 'DELETE'
        }),

        // Weekday Subscriptions ("Monday-Friday Pass" / weekday pooled commute)
        createWeekdaySubscription: (data) => request('/customer/weekday-subscriptions', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        getActiveWeekdaySubscriptions: () => request('/customer/weekday-subscriptions'),
        getWeekdaySubscription: (id) => request(`/customer/weekday-subscriptions/${id}`),
        updateWeekdaySubscription: (id, data) => request(`/customer/weekday-subscriptions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        pauseWeekdaySubscription: (id, data = {}) => request(`/customer/weekday-subscriptions/${id}/pause`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        resumeWeekdaySubscription: (id) => request(`/customer/weekday-subscriptions/${id}/resume`, {
            method: 'POST'
        }),
        cancelWeekdaySubscription: (id, data = {}) => request(`/customer/weekday-subscriptions/${id}`, {
            method: 'DELETE',
            body: JSON.stringify(data)
        }),
        getUpcomingWeekdaySubscriptionRides: () => request('/customer/weekday-subscriptions/upcoming'),
        getWeekdaySubscriptionRideHistory: () => request('/customer/weekday-subscriptions/history'),

        // Trips
        getTrips: () => request('/trips'),
        getTripDetails: (id) => request(`/trips/${id}`),

        // Live Tracking
        getTracking: (tripId) => request(`/tracking/${tripId}`),
        updateCustomerLocation: (data) => request('/tracking/customer-location', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

        // Notifications
        getNotifications: () => request('/notifications'),
        markRead: (data = {}) => request('/notifications/read', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        deleteNotification: (id) => request(`/notifications/${id}`, {
            method: 'DELETE'
        }),

        // Reviews
        createReview: (data) => request('/reviews', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        listReviews: (driverId = '', customerId = '') => request(`/reviews?driverId=${driverId}&customerId=${customerId}`),
        deleteReview: (id) => request(`/reviews/${id}`, {
            method: 'DELETE'
        }),

        // Support
        createTicket: (data) => request('/support', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        getTickets: () => request('/support'),
        getTicketDetails: (id) => request(`/support/${id}`),
        replyToTicket: (id, data) => request(`/support/${id}/reply`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        updateTicket: (id, data) => request(`/support/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

        // Favourites
        getFavourites: () => request('/favourites'),
        addFavourite: (data) => request('/favourites', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        deleteFavourite: (id) => request(`/favourites/${id}`, {
            method: 'DELETE'
        }),

        // Coupons
        getCoupons: () => request('/coupons'),
        applyCoupon: (data) => request('/coupons/apply', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

        // Wallet Advanced
        getRewards: () => request('/wallet/rewards'),
        getReferrals: () => request('/wallet/referrals'),
        getRefunds: () => request('/wallet/refunds'),

        // Account Deletion
        deleteAccount: (data) => request('/customer/delete-request', {
            method: 'POST',
            body: JSON.stringify(data)
        })
    };
})();
