// TORQQ Driver Dashboard Configuration
// Prevent hardcoding URLs throughout the application

const CONFIG = {
    // =========================
    // BACKEND API
    // =========================
    // Resolved at runtime by js/apiBase.js — works whether the backend serves
    // these pages itself or a separate static server does, and from any machine
    // on the network. Override with:
    //   localStorage.setItem('torqq_api_origin', 'http://<host>:4000')
    API_BASE_URL: (window.TORQQ_API_BASE || '/api/v1'),
    WEBSOCKET_URL: (window.TORQQ_SOCKET_ORIGIN || window.location.origin),
    
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
