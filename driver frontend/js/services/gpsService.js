/**
 * TORQQ Driver GPS Service
 * Decoupled service responsible for obtaining and distributing GPS location coordinates
 */

const GPSService = (() => {
    let watchId = null;
    let currentPosition = null;
    const listeners = new Set();
    let isSimulatorActive = true;
    let simulatorInterval = null;
    let simulatorPoints = [];
    let simulatorIndex = 0;
    let simulatorSpeed = 5; // steps multiplier

    // Register callback for location changes
    function onLocationUpdate(callback) {
        listeners.add(callback);
        // Immediately fire with current position if available
        if (currentPosition) {
            callback(currentPosition);
        }
        return () => listeners.delete(callback);
    }

    function notifyListeners(pos) {
        currentPosition = pos;
        listeners.forEach(cb => cb(pos));
    }

    // Request permissions and start Geolocation tracking
    function startTracking() {
        if (isSimulatorActive) {
            console.log("🔋 [GPS Service] Geolocation tracking bypassed; Simulator active.");
            return;
        }

        if (!navigator.geolocation) {
            handleError({ code: 0, message: "Geolocation not supported by browser" });
            return;
        }

        console.log("🔋 [GPS Service] Requesting location permission & starting GPS tracking...");
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const posData = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    heading: position.coords.heading || 0,
                    speed: position.coords.speed || 0,
                    timestamp: new Date(position.timestamp)
                };
                console.log(`🔋 [GPS Service] Real GPS Position: [${posData.longitude}, ${posData.latitude}]`);
                notifyListeners(posData);
            },
            (error) => {
                handleError(error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );
    }

    function stopTracking() {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        stopSimulator();
    }

    function handleError(error) {
        let msg = "GPS Error: Unknown error";
        switch (error.code) {
            case 1:
                msg = "GPS Permission denied. Please enable location services.";
                break;
            case 2:
                msg = "GPS position unavailable. Retrying...";
                break;
            case 3:
                msg = "GPS tracking timed out. Retrying...";
                break;
            default:
                if (error.message) msg = `GPS Error: ${error.message}`;
        }
        console.warn(`🔋 [GPS Service] ${msg}`);
        if (window.UTILS && window.UTILS.showToast) {
            window.UTILS.showToast(msg, "warning");
        }
    }

    // Simulator Functions
    function startSimulator(pathPoints, onFinishedCallback) {
        stopSimulator();
        isSimulatorActive = true;
        simulatorPoints = pathPoints;
        simulatorIndex = 0;
        
        if (simulatorPoints.length === 0) return;

        console.log(`🔋 [GPS Service] Starting GPS Simulator with ${simulatorPoints.length} points...`);
        
        runSimulatorStep(onFinishedCallback);
    }

    function runSimulatorStep(onFinishedCallback) {
        if (!isSimulatorActive || simulatorPoints.length === 0) return;

        const intervalMs = Math.max(1000, 4000 / simulatorSpeed);
        simulatorInterval = setInterval(() => {
            if (simulatorIndex >= simulatorPoints.length) {
                clearInterval(simulatorInterval);
                if (onFinishedCallback) onFinishedCallback();
                return;
            }

            const pt = simulatorPoints[simulatorIndex];
            
            // Calculate mock heading
            let heading = 0;
            if (simulatorIndex < simulatorPoints.length - 1) {
                const nextPt = simulatorPoints[simulatorIndex + 1];
                heading = calculateHeading(pt.lat, pt.lng, nextPt.lat, nextPt.lng);
            }

            const posData = {
                latitude: pt.lat,
                longitude: pt.lng,
                heading: heading,
                speed: 30 / 3.6, // mock 30 km/h in m/s
                timestamp: new Date()
            };

            notifyListeners(posData);
            simulatorIndex++;
        }, intervalMs);
    }

    function stopSimulator() {
        if (simulatorInterval) {
            clearInterval(simulatorInterval);
            simulatorInterval = null;
        }
    }

    function setSimulatorSpeed(multiplier) {
        simulatorSpeed = Number(multiplier) || 1;
        if (isSimulatorActive && simulatorInterval) {
            // Restart simulator loop with new speed interval
            const currentPoints = simulatorPoints;
            const currentIndex = simulatorIndex;
            stopSimulator();
            simulatorPoints = currentPoints;
            simulatorIndex = currentIndex;
            runSimulatorStep();
        }
    }

    function setSimulatorActive(active) {
        isSimulatorActive = !!active;
        if (!active) {
            stopSimulator();
            startTracking();
        } else {
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
        }
    }

    function calculateHeading(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        
        const brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    return {
        startTracking,
        stopTracking,
        onLocationUpdate,
        startSimulator,
        stopSimulator,
        setSimulatorSpeed,
        setSimulatorActive,
        getCurrentPosition: () => currentPosition,
        isSimulator: () => isSimulatorActive
    };
})();

window.GPSService = GPSService;
