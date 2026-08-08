/**
 * TORQQ Driver Route & Math Service
 * Independent routing math utilities (distance, ETA, coordinate path generation)
 */

const RouteService = (() => {
    // Earth's radius in kilometers
    const EARTH_RADIUS_KM = 6371;

    // Calculate Haversine distance between two sets of lat/lng
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c; // Distance in kilometers
    }

    // Estimate time of travel in minutes
    function calculateETA(distanceKm, averageSpeedKmh = 30) {
        let etaMinutes = Math.round((distanceKm / averageSpeedKmh) * 60);
        return Math.max(1, etaMinutes); // minimum 1 minute
    }

    // Interpolate points on a grid to simulate city streets
    function generateRoutePath(startLat, startLng, endLat, endLng, stepsCount = 60) {
        const path = [];
        // Intermediate pivot point to simulate a street turn (90-degree city block style)
        const pivotLat = endLat;
        const pivotLng = startLng;

        const halfSteps = Math.floor(stepsCount / 2);

        // Step 1: Start -> Pivot (moving vertically along latitude)
        for (let i = 0; i <= halfSteps; i++) {
            const ratio = i / halfSteps;
            const lat = startLat + (pivotLat - startLat) * ratio;
            const lng = startLng;
            path.push({ lat, lng });
        }

        // Step 2: Pivot -> End (moving horizontally along longitude)
        for (let i = 1; i <= (stepsCount - halfSteps); i++) {
            const ratio = i / (stepsCount - halfSteps);
            const lat = pivotLat;
            const lng = pivotLng + (endLng - pivotLng) * ratio;
            path.push({ lat, lng });
        }

        return path;
    }

    return {
        calculateDistance,
        calculateETA,
        generateRoutePath
    };
})();

window.RouteService = RouteService;
