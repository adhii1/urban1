// TORQQ Driver Dashboard Configuration
// Prevent hardcoding URLs throughout the application

const CONFIG = {
    // =========================
    // FUTURE EXPRESS API BASE
    // =========================
    API_BASE_URL: "http://localhost:4000/api/v1",
    WEBSOCKET_URL: "ws://localhost:4000",
    
    // Third-party API keys
    GOOGLE_MAPS_KEY: "AIzaSyA-MockGoogleMapsKeyForTorqqDriverDashboard",
    MAPBOX_KEY: "pk.eyJ1IjoibW9jay1tYXBib3gta2V5LXRvcnFxLWRyaXZlciIsImEiOiJjbCJ9",
    RAZORPAY_KEY: "rzp_test_mockRazorpayKey",
    
    APP_NAME: "TORQQ Driver",
    VERSION: "1.0.0",
    DEBUG_MODE: true
};

// Make it available in global scope
window.CONFIG = CONFIG;
