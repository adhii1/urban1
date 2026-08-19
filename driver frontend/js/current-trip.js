/**
 * TORQQ Driver Current Trip Page Controller
 * Binds GPSService, LocationService, RouteService, and TorqqMapComponent together
 */

document.addEventListener('DOMContentLoaded', () => {
    let mapComponent = null;
    let currentTrip = null;
    let targetCoords = null; // Coordinates of current routing target (pickup or drop-off)
    let pickupCoords = { latitude: 12.9719, longitude: 77.6412 }; // Indiranagar default
    let dropCoords = { latitude: 12.8489, longitude: 77.6683 }; // Electronic City default
    let routePath = [];
    let isTripStarted = false;
    let arrivalThresholdMeters = 100; // configurable threshold
    let averageSpeedKmh = 30;

    // Restore trip from sessionStorage if STATE doesn't have it
    if (window.STATE && !window.STATE.getState('currentTrip')) {
        const saved = sessionStorage.getItem('activeTrip');
        if (saved) {
            try {
                const tripData = JSON.parse(saved);
                window.STATE.setState('currentTrip', tripData);
                console.log('[CurrentTrip] Restored trip from sessionStorage:', tripData.id);
            } catch {}
        }
    }

    // UI Elements
    const tripStatusBadge = document.getElementById('tripStatusBadge');
    const bookingIdDisplay = document.getElementById('bookingIdDisplay');
    const customerName = document.getElementById('customerName');
    const customerPhone = document.getElementById('customerPhone');
    const pickupAddress = document.getElementById('pickupAddress');
    const destinationAddress = document.getElementById('destinationAddress');
    
    const floatingTripStats = document.getElementById('floatingTripStats');
    const actionTripBtn = document.getElementById('actionTripBtn');
    const navigateBtn = document.getElementById('navigateBtn');
    const cancelTripBtn = document.getElementById('cancelTripBtn');
    const callCustomerBtn = document.getElementById('callCustomerBtn');

    // Simulator Elements
    const simulatorToggle = document.getElementById('simulatorToggle');
    const simPlayPauseBtn = document.getElementById('simPlayPauseBtn');
    const simResetBtn = document.getElementById('simResetBtn');
    const simSpeedSelect = document.getElementById('simSpeedSelect');

    // Initialize Map Component
    mapComponent = new TorqqMapComponent('currentTripMapCanvas');

    // Load active trip from global State
    window.STATE.subscribe('currentTrip', (trip) => {
        if (!trip) {
            console.log("🔋 [Current Trip Controller] No active trip. Redirecting to dashboard...");
            window.location.href = 'dashboard.html';
            return;
        }

        currentTrip = trip;
        initTripDetails(trip);
    });

    function initTripDetails(trip) {
        isTripStarted = ['STARTED', 'TRIP_STARTED'].includes(trip.status);
        bookingIdDisplay.textContent = `Booking ID: ${trip.id}`;
        
        // The structured passenger cards own passenger identity and lifecycle.
        // This navigation summary may show one real passenger, but never a
        // placeholder that could be mistaken for an assigned rider.
        const customer = trip.passengers && trip.passengers[0] ? trip.passengers[0] : null;
        customerName.textContent = customer?.passengerName || customer?.name || 'See assigned passenger cards';
        customerPhone.textContent = customer?.phone || customer?.customerPhone || '—';

        const addressOf = (location) => typeof location === 'string'
            ? location
            : location?.address || location?.stopName || '—';
        pickupAddress.textContent = addressOf(trip.pickup || customer?.pickup);
        destinationAddress.textContent = addressOf(trip.drop || customer?.drop);

        // Initialize sync service
        LocationService.init(trip.id);

        // Auto-transition to ARRIVING if status is DRIVER_ACCEPTED
        if (trip.status === 'DRIVER_ACCEPTED') {
            window.TRIP_API.updateTripStatus(trip.id, 'ARRIVING')
                .then(res => {
                    console.log("🔋 [Current Trip] Auto-updated status to DRIVER_ARRIVING");
                    trip.status = 'DRIVER_ARRIVING';
                })
                .catch(err => console.error("Failed to auto-update status to DRIVER_ARRIVING:", err));
        }

        // Configure target coordinate
        pickupCoords = { latitude: 12.9719, longitude: 77.6412 }; // Indiranagar default
        dropCoords = { latitude: 12.8489, longitude: 77.6683 }; // Electronic City default

        if (trip.pickupLocation && trip.pickupLocation.coordinates) {
            pickupCoords = {
                latitude: trip.pickupLocation.coordinates[1],
                longitude: trip.pickupLocation.coordinates[0]
            };
        }
        if (trip.dropLocation && trip.dropLocation.coordinates) {
            dropCoords = {
                latitude: trip.dropLocation.coordinates[1],
                longitude: trip.dropLocation.coordinates[0]
            };
        }

        // Define starting position slightly offset to simulate arriving
        const startingCoords = { latitude: pickupCoords.latitude - 0.015, longitude: pickupCoords.longitude - 0.015 };

        // Save target coords
        if (isTripStarted) {
            targetCoords = dropCoords;
            tripStatusBadge.textContent = "HEADING TO DESTINATION";
            tripStatusBadge.className = "badge badge-success";
            actionTripBtn.textContent = "Complete Trip";
            actionTripBtn.disabled = true; // Enabled when close to destination
        } else {
            targetCoords = pickupCoords;
            tripStatusBadge.textContent = trip.status === 'ARRIVED' || trip.status === 'DRIVER_ARRIVED' ? "ARRIVED AT PICKUP" : "HEADING TO PICKUP";
            tripStatusBadge.className = trip.status === 'ARRIVED' || trip.status === 'DRIVER_ARRIVED' ? "badge badge-warning" : "badge badge-info";
            actionTripBtn.textContent = trip.status === 'ARRIVED' || trip.status === 'DRIVER_ARRIVED' ? "Start Trip" : "Arrived at Pickup";
            actionTripBtn.disabled = !(trip.status === 'ARRIVED' || trip.status === 'DRIVER_ARRIVED');
        }

        // Initialize GPS coordinates
        let currentPos = GPSService.getCurrentPosition();
        if (!currentPos) {
            currentPos = {
                latitude: startingCoords.latitude,
                longitude: startingCoords.longitude,
                heading: 0,
                speed: 0
            };
        }

        // Generate static route path
        routePath = RouteService.generateRoutePath(
            currentPos.latitude,
            currentPos.longitude,
            targetCoords.latitude,
            targetCoords.longitude,
            40
        );

        mapComponent.updatePositions(currentPos, targetCoords, isTripStarted ? 'drop' : 'pickup');
        mapComponent.setRoutePath(routePath);

        // Bind GPS listeners
        GPSService.onLocationUpdate(handleLocationChange);

        // Setup simulator if enabled
        if (simulatorToggle.checked) {
            GPSService.setSimulatorActive(true);
            GPSService.setSimulatorSpeed(simSpeedSelect.value);
        } else {
            GPSService.setSimulatorActive(false);
            GPSService.startTracking();
        }
    }

    // Handles position changes from GPS / Simulator
    function handleLocationChange(position) {
        // 1. Post to API (throttled)
        LocationService.sendLocationUpdate(position.latitude, position.longitude);

        // 2. Update Map
        mapComponent.updatePositions(position, targetCoords, isTripStarted ? 'drop' : 'pickup');

        // 3. Calculate distance and ETA
        const distance = RouteService.calculateDistance(
            position.latitude,
            position.longitude,
            targetCoords.latitude,
            targetCoords.longitude
        );

        const eta = RouteService.calculateETA(distance, averageSpeedKmh);

        // 4. Update UI labels
        floatingTripStats.textContent = `${distance.toFixed(2)} km • ${eta} mins`;

        // 5. Arrival Detection
        const distanceMeters = distance * 1000;
        if (!isTripStarted) {
            if (currentTrip.status !== 'ARRIVED' && currentTrip.status !== 'DRIVER_ARRIVED') {
                if (distanceMeters <= arrivalThresholdMeters) {
                    tripStatusBadge.textContent = "ARRIVED - REACHED PICKUP";
                    tripStatusBadge.className = "badge badge-warning";
                    actionTripBtn.disabled = false;
                    actionTripBtn.textContent = "Arrived at Pickup";
                    window.UTILS.showToast("Reached pickup location! Mark arrived.", "success");
                } else {
                    tripStatusBadge.textContent = "HEADING TO PICKUP";
                    tripStatusBadge.className = "badge badge-info";
                }
            }
        } else {
            // Started -> check destination arrival
            if (distanceMeters <= arrivalThresholdMeters) {
                tripStatusBadge.textContent = "ARRIVED AT DESTINATION";
                tripStatusBadge.className = "badge badge-success";
                actionTripBtn.disabled = false;
                actionTripBtn.textContent = "Complete Trip";
                window.UTILS.showToast("Reached destination drop-off! Complete trip.", "success");
            }
        }
    }

    // BUTTON ACTIONS
    actionTripBtn.onclick = () => {
        const currentStatus = currentTrip.status;
        
        if (actionTripBtn.textContent === "Arrived at Pickup") {
            window.TRIP_API.updateTripStatus(currentTrip.id, 'ARRIVED')
                .then(res => {
                    window.UTILS.showToast("Status updated to ARRIVED. Waiting for passengers.", "success");
                    actionTripBtn.textContent = "Start Trip";
                    tripStatusBadge.textContent = "ARRIVED AT PICKUP";
                    tripStatusBadge.className = "badge badge-warning";
                })
                .catch(err => window.UTILS.showToast(err.message, "error"));
        } else if (actionTripBtn.textContent === "Start Trip") {
            window.TRIP_API.updateTripStatus(currentTrip.id, 'STARTED')
                .then(res => {
                    window.UTILS.showToast("Trip started! Navigating to drop-off.", "success");
                    
                    // Switch navigation to destination without rebuilding page
                    isTripStarted = true;
                    targetCoords = dropCoords;
                    actionTripBtn.textContent = "Complete Trip";
                    actionTripBtn.disabled = true; // disabled until within dropoff threshold
                    tripStatusBadge.textContent = "HEADING TO DESTINATION";
                    tripStatusBadge.className = "badge badge-success";

                    // Re-calculate route path to destination
                    const currPos = GPSService.getCurrentPosition() || { latitude: 12.9719, longitude: 77.6412 };
                    routePath = RouteService.generateRoutePath(
                        currPos.latitude,
                        currPos.longitude,
                        targetCoords.latitude,
                        targetCoords.longitude,
                        50
                    );

                    mapComponent.updatePositions(currPos, targetCoords, 'drop');
                    mapComponent.setRoutePath(routePath);

                    // Reinitialize simulator with the new path to destination
                    if (simulatorToggle.checked) {
                        GPSService.startSimulator(routePath, () => {
                            console.log("🔋 [GPS Simulator] Arrived at destination.");
                        });
                    }
                })
                .catch(err => window.UTILS.showToast(err.message, "error"));
        } else if (actionTripBtn.textContent === "Complete Trip") {
            window.TRIP_API.updateTripStatus(currentTrip.id, 'COMPLETED')
                .then(res => {
                    window.UTILS.showToast("Trip Completed! Redirecting to Dashboard.", "success");
                    LocationService.clear();
                    GPSService.stopTracking();
                    window.STATE.setState('currentTrip', null);
                    window.location.href = 'dashboard.html';
                })
                .catch(err => window.UTILS.showToast(err.message, "error"));
        }
    };

    navigateBtn.onclick = () => {
        window.UTILS.showToast("Recalculating route map path...", "info");
        mapComponent.centerMap();
    };

    cancelTripBtn.onclick = () => {
        window.UTILS.showToast("Demo Action: Trip Cancellation requested.", "info");
    };

    callCustomerBtn.onclick = () => {
        const phone = customerPhone.textContent;
        window.UTILS.showToast(`Calling customer at ${phone}...`, "info");
    };

    // SIMULATOR CONTROLS
    simulatorToggle.onchange = (e) => {
        const isSim = e.target.checked;
        GPSService.setSimulatorActive(isSim);
        if (isSim) {
            simPlayPauseBtn.innerHTML = '<i class="lucide-pause"></i> Pause';
            simPlayPauseBtn.className = 'btn btn-secondary btn-sm';
            
            // Generate a fresh path from driver current pos to target
            const currPos = GPSService.getCurrentPosition() || { latitude: 12.9600, longitude: 77.6200 };
            routePath = RouteService.generateRoutePath(
                currPos.latitude,
                currPos.longitude,
                targetCoords.latitude,
                targetCoords.longitude,
                40
            );
            GPSService.startSimulator(routePath);
        } else {
            simPlayPauseBtn.innerHTML = '<i class="lucide-play"></i> Run';
            GPSService.stopSimulator();
            GPSService.startTracking();
        }
    };

    simPlayPauseBtn.onclick = () => {
        if (!simulatorToggle.checked) return;

        if (simPlayPauseBtn.innerHTML.includes('Pause')) {
            simPlayPauseBtn.innerHTML = '<i class="lucide-play"></i> Run';
            GPSService.stopSimulator();
        } else {
            simPlayPauseBtn.innerHTML = '<i class="lucide-pause"></i> Pause';
            // Start simulator with remaining path
            const currPos = GPSService.getCurrentPosition() || { latitude: 12.9600, longitude: 77.6200 };
            routePath = RouteService.generateRoutePath(
                currPos.latitude,
                currPos.longitude,
                targetCoords.latitude,
                targetCoords.longitude,
                40
            );
            GPSService.startSimulator(routePath);
        }
    };

    simResetBtn.onclick = () => {
        if (!simulatorToggle.checked) return;
        GPSService.stopSimulator();
        
        // Reset driver position offset
        const startingCoords = { latitude: 12.9600, longitude: 77.6200 };
        const dummyPos = {
            latitude: startingCoords.latitude,
            longitude: startingCoords.longitude,
            heading: 0,
            speed: 0
        };
        
        routePath = RouteService.generateRoutePath(
            dummyPos.latitude,
            dummyPos.longitude,
            targetCoords.latitude,
            targetCoords.longitude,
            40
        );

        mapComponent.updatePositions(dummyPos, targetCoords, isTripStarted ? 'drop' : 'pickup');
        mapComponent.setRoutePath(routePath);
        
        simPlayPauseBtn.innerHTML = '<i class="lucide-pause"></i> Pause';
        GPSService.startSimulator(routePath);
    };

    simSpeedSelect.onchange = (e) => {
        GPSService.setSimulatorSpeed(e.target.value);
    };
});
