/**
 * TORQQ Shared Mobility - API Endpoint Registry & Client Orchestrator
 */

const TORQQ_API = (() => {
    function getEndpoint(path) {
        const env = window.TORQQ_ENV ? window.TORQQ_ENV.current : { baseUrl: 'http://localhost:4000/api/v1' };
        return `${env.baseUrl}${path}`;
    }

    const ENDPOINTS = {
        AUTH: {
            LOGIN: '/auth/login',
            REGISTER: '/auth/register',
            REFRESH: '/auth/refresh',
            LOGOUT: '/auth/logout'
        },
        CUSTOMER: {
            PROFILE: '/customer/profile',
            BOOKINGS: '/customer/bookings',
            RIDE_STATUS: '/customer/ride-status',
            TRACKING: '/customer/tracking',
            SAVED_LOCATIONS: '/customer/saved-locations',
            PASSES: '/customer/passes',
            WALLET: '/customer/wallet'
        },
        DRIVER: {
            PROFILE: '/driver/profile',
            DUTY_STATUS: '/driver/duty-status',
            CURRENT_TRIP: '/driver/current-trip',
            CHECKLIST: '/driver/checklist',
            EARNINGS: '/driver/earnings'
        },
        ADMIN: {
            STATS: '/admin/overview-stats',
            CUSTOMERS: '/admin/customers',
            DRIVERS: '/admin/drivers',
            VEHICLES: '/admin/vehicles',
            TRIPS: '/admin/trips',
            REPORTS: '/admin/reports',
            LOGS: '/admin/logs',
            SOS: '/admin/sos-alerts'
        }
    };

    return {
        getEndpoint,
        ENDPOINTS
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TORQQ_API;
}
