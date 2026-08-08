/**
 * TORQQ Shared Mobility - Application Route Mapping
 */

const TORQQ_ROUTES = {
    CUSTOMER: {
        HOME: '/index.html',
        DASHBOARD: '/dashboard.html',
        BOOKING: '/booking.html',
        RIDE_STATUS: '/ride-status.html',
        ACTIVE_RIDE: '/active-ride.html',
        RIDE_DETAILS: '/ride-details.html',
        TRACKING: '/tracking.html',
        MY_TRIPS: '/my-trips.html',
        PAYMENT_PROCESS: '/payment-process.html',
        SETTINGS: '/settings.html',
        NOTIFICATIONS: '/notifications.html'
    },
    DRIVER: {
        LOGIN: '/pages/login.html',
        DASHBOARD: '/pages/dashboard.html',
        CURRENT_TRIP: '/pages/current-trip.html',
        PASSENGERS: '/pages/passengers.html',
        MY_TRIPS: '/pages/my-trips.html',
        EARNINGS: '/pages/earnings.html',
        SETTINGS: '/pages/settings.html'
    },
    ADMIN: {
        LOGIN: '/login.html',
        DASHBOARD: '/pages/dashboard.html',
        CUSTOMERS: '/pages/customers.html',
        DRIVERS: '/pages/drivers.html',
        CABS: '/pages/cabs.html',
        TRIPS: '/pages/trips.html',
        REPORTS: '/pages/reports.html',
        SYSTEM_LOGS: '/pages/system-logs.html',
        SETTINGS: '/pages/settings.html'
    },
    ERRORS: {
        NOT_FOUND: '/404.html',
        FORBIDDEN: '/403.html',
        SERVER_ERROR: '/500.html',
        OFFLINE: '/offline.html',
        MAINTENANCE: '/maintenance.html'
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TORQQ_ROUTES;
}
