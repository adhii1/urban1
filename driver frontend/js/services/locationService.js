/**
 * TORQQ Driver Location Sync Service
 * Decoupled service responsible for transmitting coordinate updates to the backend API
 */

const LocationService = (() => {
    let lastUploadTime = 0;
    const UPLOAD_THROTTLE_MS = 8000; // minimum interval of 8 seconds between uploads
    let activeTripId = null;

    function init(tripId) {
        activeTripId = tripId;
        lastUploadTime = 0;
        console.log(`🔌 [Location Service] Initialized for Trip ID: ${tripId}`);
    }

    async function sendLocationUpdate(lat, lng) {
        if (!activeTripId) return;

        const now = Date.now();
        if (now - lastUploadTime < UPLOAD_THROTTLE_MS) {
            // Throttled locally to reduce network spam
            return;
        }

        lastUploadTime = now;
        const token = localStorage.getItem('driverToken');
        if (!token) return;

        console.log(`🔌 [Location Service] Uploading coordinates: [${lng}, ${lat}]`);
        try {
            const response = await fetch((window.TORQQ_API_BASE || '/api/v1') + '/tracking/driver-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    tripId: activeTripId,
                    longitude: lng,
                    latitude: lat
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Upload failed');
            }
            return data;
        } catch (error) {
            console.warn('🔌 [Location Service] Location sync failed:', error.message);
        }
    }

    function clear() {
        activeTripId = null;
    }

    return {
        init,
        sendLocationUpdate,
        clear
    };
})();

window.LocationService = LocationService;
