// TORQQ Driver Dashboard Constants
// Standardized action statuses for consistent workflow states

const CONSTANTS = {
    // Trip Status Workflow
    TRIP_STATUS: {
        AVAILABLE: "AVAILABLE",       // Trip is in the available/bidding pool
        ACCEPTED: "ACCEPTED",         // Driver accepted, heading to passenger
        NAVIGATE: "NAVIGATE",         // Driver navigating to passenger pickup
        ARRIVED: "ARRIVED",           // Driver reached pickup, waiting for check-in
        CHECKED_IN: "CHECKED_IN",     // Passengers boarded and checked in
        STARTED: "STARTED",           // Trip has started, moving to drop-off
        COMPLETED: "COMPLETED",       // Trip completed successfully
        CANCELLED: "CANCELLED"        // Trip cancelled by passenger/driver
    },

    // Driver Status
    ONLINE_STATUS: {
        ONLINE: "ONLINE",
        OFFLINE: "OFFLINE"
    },

    // Theme Options
    THEME: {
        LIGHT: "light",
        DARK: "dark"
    },

    // Vehicle Fuel Types
    FUEL_TYPE: {
        PETROL: "Petrol",
        DIESEL: "Diesel",
        CNG: "CNG",
        ELECTRIC: "Electric"
    },

    // Document Status
    DOCUMENT_STATUS: {
        PENDING: "PENDING",
        VERIFIED: "VERIFIED",
        REJECTED: "REJECTED",
        EXPIRED: "EXPIRED"
    }
};

// Make it available in global scope
window.CONSTANTS = CONSTANTS;
