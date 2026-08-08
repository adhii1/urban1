/**
 * TORQQ Shared Mobility - Application Constants & System Enums
 */

const TORQQ_CONSTANTS = {
    BOOKING_MODELS: {
        HOME_ONE_TIME: 'home-one-time',
        HOME_3DAY: 'home-3day',
        HOME_MON_FRI: 'home-mon-fri',
        STOP_TO_STOP: 'stop-to-stop'
    },
    
    BOOKING_STAGES: [
        { key: 'RECEIVED', label: 'Booking Received', step: 1, icon: 'file-text' },
        { key: 'SEARCHING', label: 'Searching for Driver', step: 2, icon: 'search' },
        { key: 'MATCHED', label: 'Ride Matched', step: 3, icon: 'users' },
        { key: 'ASSIGNED', label: 'Driver Assigned', step: 4, icon: 'user-check' },
        { key: 'ON_THE_WAY', label: 'Driver On The Way', step: 5, icon: 'navigation' },
        { key: 'ARRIVED', label: 'Driver Arrived', step: 6, icon: 'map-pin' },
        { key: 'TRIP_STARTED', label: 'Trip Started', step: 7, icon: 'play' },
        { key: 'PASSENGER_PICKED', label: 'Passenger Picked', step: 8, icon: 'user-plus' },
        { key: 'PASSENGER_DROPPED', label: 'Passenger Dropped', step: 9, icon: 'user-minus' },
        { key: 'COMPLETED', label: 'Trip Completed', step: 10, icon: 'check-circle' }
    ],

    DRIVER_STATUS: {
        OFFLINE: 'offline',
        ONLINE: 'online',
        ON_BREAK: 'on_break',
        PAUSED: 'paused',
        IN_TRIP: 'in_trip'
    },

    PAYMENT_STATUS: {
        PENDING: 'pending',
        PROCESSING: 'processing',
        SUCCESS: 'success',
        FAILED: 'failed',
        REFUNDED: 'refunded'
    },

    NOTIFICATION_TYPES: {
        BOOKING_CONFIRMED: 'booking_confirmed',
        RIDE_ASSIGNED: 'ride_assigned',
        DRIVER_ARRIVING: 'driver_arriving',
        TRIP_STARTED: 'trip_started',
        TRIP_COMPLETED: 'trip_completed',
        PAYMENT_SUCCESS: 'payment_success',
        OFFER: 'offer',
        SYSTEM_ANNOUNCEMENT: 'system_announcement'
    },

    DEFAULT_SIMULATED_DELAY_MS: 400
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TORQQ_CONSTANTS;
}
