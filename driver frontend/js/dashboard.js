// TORQQ Driver Dashboard Controller & Ride Operations Workflow
// Handles active ride states, interactive map components, schedules, and simulated trip allocations

let activeMap = null;
let tripsPollingStarted = false; // module-level flag
let tripsPollInterval = null; // store interval ID
let currentOffer = null;

document.addEventListener('DOMContentLoaded', () => {
    if (window._dashboardInitialized) return;
    window._dashboardInitialized = true;
    // Check if on dashboard page
    if (!document.getElementById('dashboardMapPlaceholder')) return;
    
    // 1. Initialize Map Component
    activeMap = new TorqqMap('dashboardMapPlaceholder');
    
    // 2. Initialize Dashboard Skeletons and Metrics
    simulateInitialSkeletons();

    // Fetch real backend data to populate dashboard cards
    function fetchEarnings() {
        if (window.EARNING_API && window.EARNING_API.getEarnings) {
            window.EARNING_API.getEarnings().catch(console.error);
        }
    }
    fetchEarnings();
    setInterval(fetchEarnings, 15000); // refresh earnings every 15s

    function fetchTrips() {
    console.trace("TRIP_API.getTrips() - dashboard.js");
    window.TRIP_API.getTrips()
        .then(res => {
            if (res.success && res.trips) {
                window.STATE.setState('trips', res.trips);
                renderDriverSchedule(res.trips);
                // Identify and restore active trip state if any trip is in progress
                const activeTrip = res.trips.find(t => ['ACCEPTED', 'ARRIVED', 'STARTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status));
                if (activeTrip) {
                    window.STATE.setState('currentTrip', activeTrip);
                }
                updateMetricsValues();
            }
        })
        .catch(console.error);
}
        if (window.TRIP_API && window.TRIP_API.getTrips && !window._driverTripsPollingStarted) {
            // Ensure any previous interval is cleared
            if (window.tripsPollInterval) {
                clearInterval(window.tripsPollInterval);
            }
            window._driverTripsPollingStarted = true;
            fetchTrips(); // initial load
            window.tripsPollInterval = setInterval(fetchTrips, 10000); // 10‑second polling
        }   // 3. Listen to Active Trip state modifications
    window.STATE.subscribe('currentTrip', (trip) => {
        renderActiveTripCard(trip);
        if (trip && ['ACCEPTED', 'ARRIVED', 'STARTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(trip.status)) {
            console.log("Active trip status detected. Redirecting to Current Trip screen...");
            window.location.href = 'current-trip.html';
        }
    });

    // 4. Listen to Incoming Web Socket offerings
    if (!window._socketListenersAdded) {
    window._socketListenersAdded = true;
    window.SOCKET.on('ride:new-request', (offer) => {
        showTripOfferModal(offer);
    });
    window.SOCKET.on('fareTick', (data) => {
        adjustActiveTripFare(data.addedAmount);
    });
}

    // 5. Connect fare adjustments during active trips
    window.SOCKET.on('fareTick', (data) => {
        adjustActiveTripFare(data.addedAmount);
    });
});

// Loading skeleton simulation on page load
function simulateInitialSkeletons() {
    const statsContainer = document.querySelector('.stats-grid');
    if (!statsContainer) return;
    
    const originalHTML = statsContainer.innerHTML;
    
    // Replace with loading skeletons
    statsContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const sk = document.createElement('div');
        sk.className = 'glass-card stat-card skeleton-pulse';
        sk.style.height = '120px';
        statsContainer.appendChild(sk);
    }
    
    // Resolve metrics after 1200ms
    setTimeout(() => {
        statsContainer.innerHTML = originalHTML;
        // Bind values from state / mock
        updateMetricsValues();
    }, 1200);
}

function updateMetricsValues() {
    const todayEarnings = document.getElementById('todayEarningsVal');
    const todayTrips = document.getElementById('todayTripsVal');
    const completedTrips = document.getElementById('completedTripsVal');
    const dutyHours = document.getElementById('dutyHoursVal');

    const earnings = window.STATE.getState('earnings') || {};
    const trips = window.STATE.getState('trips') || [];

    // Total earnings from backend (real value)
    const totalEarnings = earnings.totalEarnings || 0;
    // Total trips assigned (all statuses)
    const totalTripsCount = trips.length;
    // Completed trips
    const completed = trips.filter(t => t.status === 'COMPLETED').length;
    // Duty hours from backend total duration (minutes → hours)
    const hours = earnings.totalDuration ? (earnings.totalDuration / 60).toFixed(1) : "0.0";

    if (todayEarnings) todayEarnings.textContent = window.UTILS.formatCurrency(totalEarnings);
    if (todayTrips) todayTrips.textContent = `${totalTripsCount} Trips`;
    if (completedTrips) completedTrips.textContent = completed;
    if (dutyHours) dutyHours.textContent = `${hours} Hrs`;
}

function escapeScheduleHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[character]);
}

function renderDriverSchedule(trips) {
    const timeline = document.getElementById('driverScheduleTimeline');
    if (!timeline) return;

    const scheduledStatuses = new Set(['AVAILABLE', 'PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS']);
    const schedules = trips
        .filter(trip => scheduledStatuses.has(trip.status))
        .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt));

    if (schedules.length === 0) {
        timeline.innerHTML = '<div style="padding: 12px 0; color: var(--text-light); font-size: 12px;">No assigned or pending shifts.</div>';
        return;
    }

    timeline.innerHTML = schedules.map(trip => {
        const isPending = trip.status === 'PENDING';
        const label = isPending ? 'Pending offer' : trip.status === 'AVAILABLE' ? 'Scheduled' : trip.status.replaceAll('_', ' ');
        const route = `${escapeScheduleHtml(trip.pickup)} to ${escapeScheduleHtml(trip.drop)}`;
        return `
            <div class="timeline-item upcoming">
                <span class="timeline-time">${escapeScheduleHtml(trip.time)}</span>
                <div class="timeline-node"></div>
                <div class="timeline-content">
                    <h3 style="font-size:12px; font-weight:700; color:var(--text-main);">${isPending ? 'Pending Shift Offer' : 'Scheduled Shift Allocation'}</h3>
                    <p style="font-size:11px; color:var(--text-light); margin-top:2px;">${route}</p>
                    <span class="badge ${isPending ? 'badge-warning' : 'badge-info'}" style="font-size:8px; padding:1px 4px; margin-top:4px; display:inline-flex;">${escapeScheduleHtml(label)}</span>
                </div>
            </div>`;
    }).join('');
}

// Expose globally so earningApi can trigger a refresh
window.updateMetricsValues = updateMetricsValues;

// Display Booking Invitation Dialog overlay
function showTripOfferModal(offer) {
    if (window.STATE.getState('onlineStatus') !== 'ONLINE') return;
    
    currentOffer = offer;
    
    let modal = document.getElementById('tripOfferModal');
    if (modal) modal.remove();
    
    const rideRequestId = offer.rideRequestId || offer.id;
    const tripId = rideRequestId || 'TRP-20950';
    const bookingType = offer.isBundleOffer ? 'Shared Bundle (Multi-stop)' : 'Stop to Stop';
    const passengersCount = offer.passengerCount || (offer.passengers ? offer.passengers.length : 1);
    const distance = offer.distanceKm ? `${offer.distanceKm} km` : (offer.tripDistance ? `${offer.tripDistance} km` : '—');
    const duration = offer.etaMinutes ? `${offer.etaMinutes} Mins` : '—';
    const pickupOrder = (offer.pickup && offer.pickup.address) || 'Pickup location';
    const dropOrder = (offer.drop && offer.drop.address) || 'Drop location';
    const status = 'ASSIGNED';
    const estimatedFare = offer.fareEstimate || 0;
    const passengersList = offer.passengers || [];

    modal = document.createElement('div');
    modal.id = 'tripOfferModal';
    modal.className = 'sos-overlay fade-in';
    modal.innerHTML = `
        <div class="glass-card scale-in" style="
            background: var(--bg-card-solid);
            width: 100%;
            max-width: 480px;
            border-radius: var(--border-radius-lg);
            padding: 24px;
            box-shadow: var(--shadow-premium);
            border: 2px solid var(--color-primary);
        ">
            <div class="flex-between" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 16px;">
                <span class="badge badge-success online-pulse">New Trip Assignment Card</span>
                <span id="offerTimer" style="font-weight:700; color:#EF4444; font-size:16px;">15s</span>
            </div>
            
            <div style="background:var(--bg-app); border-radius:var(--border-radius-md); padding:14px; margin-bottom:16px; border:1px solid var(--border-color); font-size:13px; display:flex; flex-direction:column; gap:8px;">
                <div class="flex-between">
                    <span style="color:var(--text-light);">Trip ID:</span>
                    <strong style="color:var(--color-primary); font-weight:800;">${tripId}</strong>
                </div>
                <div class="flex-between">
                    <span style="color:var(--text-light);">Booking Type:</span>
                    <strong style="color:var(--text-main); font-weight:700;">${bookingType}</strong>
                </div>
                <div class="flex-between">
                    <span style="color:var(--text-light);">Trip Status:</span>
                    <span class="badge badge-warning" style="font-size:10px; font-weight:700;">${status}</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px;">
                <div style="background:var(--bg-app); padding:10px 12px; border-radius:10px; border:1px solid var(--border-color);">
                    <div style="font-size:10px; font-weight:700; color:var(--text-light); text-transform:uppercase;">PASSENGERS</div>
                    <div style="font-weight:800; font-size:16px; color:var(--text-main);">${passengersCount} Boarder(s)</div>
                </div>
                <div style="background:var(--bg-app); padding:10px 12px; border-radius:10px; border:1px solid var(--border-color);">
                    <div style="font-size:10px; font-weight:700; color:var(--text-light); text-transform:uppercase;">EST. REVENUE</div>
                    <div style="font-weight:800; font-size:16px; color:#16C15D;">${window.UTILS.formatCurrency(estimatedFare)}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:12px;">
                <div><span style="color:var(--text-light);">Distance:</span> <strong>${distance}</strong></div>
                <div><span style="color:var(--text-light);">Duration:</span> <strong>${duration}</strong></div>
            </div>

            <!-- Route Orders -->
            <div style="margin-bottom:16px; font-size:12.5px; display:flex; flex-direction:column; gap:6px;">
                <div style="padding:8px 12px; background:rgba(34,197,94,0.08); border-left:3px solid #22C55E; border-radius:6px;">
                    <div style="font-size:10px; font-weight:700; color:#22C55E;">PICKUP ORDER</div>
                    <strong>${pickupOrder}</strong>
                </div>
                <div style="padding:8px 12px; background:rgba(59,130,246,0.08); border-left:3px solid #3B82F6; border-radius:6px;">
                    <div style="font-size:10px; font-weight:700; color:#3B82F6;">DROP ORDER</div>
                    <strong>${dropOrder}</strong>
                </div>
            </div>

            <!-- Passengers brief -->
            <div style="background:var(--bg-app); border-radius: var(--border-radius-md); padding:12px; margin-bottom: 24px; border:1px solid var(--border-color);">
                <div style="font-size:11px; font-weight:600; color:var(--text-light); margin-bottom:8px;">ASSIGNED PASSENGERS</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${passengersList.map(p => `
                        <div style="display:flex; align-items:center; gap:6px; background:var(--bg-card-solid); padding:4px 10px; border-radius:30px; font-size:11px; border:1px solid var(--border-color);">
                            <img src="${p.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150'}" style="width:18px; height:18px; border-radius:50%; object-fit:cover;">
                            <span style="font-weight:600; color:var(--text-main);">${p.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Action Triggers -->
            <div style="display:flex; gap:12px;">
                <button id="declineTripBtn" class="btn btn-secondary" style="flex:1;">Reject</button>
                <button id="acceptTripBtn" class="btn btn-primary" style="flex:2;">Accept Assignment</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    let countdown = 15;
    const timerText = document.getElementById('offerTimer');
    const interval = setInterval(() => {
        countdown--;
        if (timerText) timerText.textContent = `${countdown}s`;
        
        if (countdown <= 0) {
            clearInterval(interval);
            modal.remove();
            if (window.SOCKET && window.SOCKET.emit) {
                window.SOCKET.emit('ride:reject', { rideRequestId, reason: 'Offer expired' });
            }
            window.UTILS.showToast("Assignment offer expired.", "warning");
        }
    }, 1000);

    document.getElementById('declineTripBtn').onclick = () => {
        clearInterval(interval);
        modal.remove();
        if (window.SOCKET && window.SOCKET.emit) {
            window.SOCKET.emit('ride:reject', { rideRequestId, reason: 'Declined by driver' });
        }
        window.UTILS.showToast("Assignment offer rejected.", "info");
    };

    document.getElementById('acceptTripBtn').onclick = () => {
        clearInterval(interval);
        modal.remove();

        const onAck = (res) => {
            window.SOCKET.off('ride:accept:ack', onAck);
            window.SOCKET.off('ride:accept:error', onErr);
            // Keep the server acknowledgement as the passenger source of truth.
            // In particular, never rebuild or advance a shuttle passenger from
            // an offer-list position: cards are keyed by ride/passenger ID.
            const authoritativePassengers = window.DRIVER_PASSENGER_CARDS
                ? window.DRIVER_PASSENGER_CARDS.getPassengers()
                : (res.passengers || []);
            const tripData = {
                id: res.tripId || rideRequestId,
                tripId: res.tripId || null,
                rideRequestId: rideRequestId,
                status: 'ACCEPTED',
                pickup: offer.pickup?.address || pickupOrder,
                drop: offer.drop?.address || dropOrder,
                passengers: authoritativePassengers,
                estimatedEarnings: estimatedFare,
                shuttleSessionId: res.shuttleSessionId || null,
            };
            sessionStorage.setItem('activeTrip', JSON.stringify(tripData));
            window.STATE.setState('currentTrip', tripData);
            window.UTILS.showToast("Trip Accepted! Head to pickup location.", "success");
            setTimeout(() => { window.location.href = 'current-trip.html'; }, 500);
        };
        const onErr = (err) => {
            window.SOCKET.off('ride:accept:ack', onAck);
            window.SOCKET.off('ride:accept:error', onErr);
            window.UTILS.showToast(err.message || "Failed to accept trip.", "error");
        };
        window.SOCKET.on('ride:accept:ack', onAck);
        window.SOCKET.on('ride:accept:error', onErr);
        window.SOCKET.emit('ride:accept', { rideRequestId });
    };
}

// Update Active trip viewports based on current state transitions
function renderActiveTripCard(trip) {
    const panel = document.getElementById('activeTripWorkflowPlaceholder');
    if (!panel) return;

    if (!trip) {
        // Free / Available State
        panel.innerHTML = `
            <div class="glass-card" style="padding: 40px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="loader-spinner" style="width: 40px; height: 40px; border: 3px solid var(--border-color); border-top: 3px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">Waiting for Allocations</h3>
                <p style="font-size: 13px; color: var(--text-light); max-width: 260px; line-height: 1.4;">Keep your online toggle active. Simulated shuttle requests will appear shortly.</p>
            </div>
        `;
        if (activeMap) {
            activeMap.resize();
        }
        return;
    }

    let cardContent = '';
    
    let normalizedStatus = trip.status;
    if (normalizedStatus === 'DRIVER_ASSIGNED') normalizedStatus = 'ACCEPTED';
    if (normalizedStatus === 'DRIVER_ARRIVED') normalizedStatus = 'ARRIVED';
    if (normalizedStatus === 'TRIP_STARTED') normalizedStatus = 'STARTED';
    if (normalizedStatus === 'TRIP_COMPLETED') normalizedStatus = 'COMPLETED';

    // Passenger lifecycle state is rendered only by DRIVER_PASSENGER_CARDS.
    // This legacy trip-status panel must never invent passengers or carry a
    // second mutable copy of their pickup/drop lifecycle.
    const passengers = [];

    switch (normalizedStatus) {
        case 'ACCEPTED':
        case 'ARRIVED':
            cardContent = `
                <div class="glass-card trip-workflow-card fade-in">
                    <div class="flex-between" style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">
                        <div>
                            <span class="badge ${normalizedStatus === 'ARRIVED' ? 'badge-warning' : 'badge-info'}">${normalizedStatus === 'ARRIVED' ? 'ARRIVED AT PICKUP' : 'HEADING TO PICKUP'}</span>
                            <div style="font-size:11px; color:var(--text-light); margin-top:2px;">Trip ID: <strong>${trip.id}</strong></div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; font-weight:600; color:var(--text-light);">EST. EARNINGS</div>
                            <div style="font-size:16px; font-weight:700; color:var(--color-primary);">${window.UTILS.formatCurrency(trip.earnings || trip.estimatedEarnings || 410)}</div>
                        </div>
                    </div>

                    <!-- Passenger Boarding Cards List -->
                    <div style="margin-bottom:20px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-light); text-transform:uppercase; margin-bottom:10px;">ASSIGNED PASSENGERS LIST</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${passengers.map((p, idx) => `
                                <div class="glass-card" style="padding:14px; border:1px solid var(--border-color); font-size:12.5px;">
                                    <div class="flex-between" style="margin-bottom:8px;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <img src="${p.avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                                            <div>
                                                <strong style="color:var(--text-main); font-size:13px;">${p.name}</strong>
                                                <span style="font-size:11px; color:var(--text-light); display:block;">${p.seat || 'Seat #' + (idx + 1)}</span>
                                            </div>
                                        </div>
                                        <span class="badge ${p.pickupStatus === 'Picked Up' ? 'badge-success' : 'badge-warning'}" style="font-size:10px;">${p.pickupStatus || 'Waiting'}</span>
                                    </div>
                                    <div style="font-size:11.5px; color:var(--text-light); margin-bottom:8px; display:flex; flex-direction:column; gap:2px;">
                                        <div>📍 <strong>Pickup:</strong> ${p.pickup || trip.pickup}</div>
                                        <div>🏁 <strong>Drop:</strong> ${p.drop || trip.drop}</div>
                                    </div>
                                    <div style="display:flex; gap:8px; margin-top:8px;">
                                        <button class="btn btn-secondary btn-sm" onclick="window.UTILS.showToast('Calling ${p.name}: ${p.phone || '+91 98765 43210'}', 'info')" style="padding:4px 8px; font-size:11px;"><i class="lucide-phone"></i> Call</button>
                                        <button class="btn btn-secondary btn-sm" onclick="window.UTILS.showToast('Navigating to pickup: ${p.pickup || trip.pickup}', 'info')" style="padding:4px 8px; font-size:11px;"><i class="lucide-navigation"></i> Nav</button>
                                        ${p.pickupStatus !== 'Picked Up' ? `
                                            <button class="btn btn-primary btn-sm" onclick="promptPickupCode('${trip.id}', '${p.id}', '${p.verificationCode}')" style="padding:4px 10px; font-size:11px; background:#16C15D; margin-left:auto;">Verify Code & Pick Up</button>
                                        ` : `
                                            <span style="color:#16C15D; font-weight:700; font-size:11px; margin-left:auto; display:flex; align-items:center; gap:4px;">✓ Picked Up</span>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display:flex; gap:12px;">
                        ${normalizedStatus === 'ACCEPTED' ? `
                            <button id="navigatePickupBtn" class="btn btn-secondary" style="flex:1;"><i class="lucide-navigation"></i> Navigate</button>
                            <button id="markArrivedBtn" class="btn btn-primary" style="flex:2;">Mark Arrived at Pickup</button>
                        ` : `
                            <button id="startTripBtn" class="btn btn-primary" style="width:100%; justify-content:center;" ${passengers.every(p => p.pickupStatus === 'Picked Up') ? '' : 'disabled'}>
                                <i class="lucide-play"></i> Start Ride
                            </button>
                        `}
                    </div>
                </div>
            `;
            break;

        case 'STARTED':
            cardContent = `
                <div class="glass-card trip-workflow-card fade-in">
                    <div class="flex-between" style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">
                        <div>
                            <span class="badge badge-success online-pulse">TRIP IN PROGRESS</span>
                            <div style="font-size:11px; color:var(--text-light); margin-top:2px;">Trip ID: <strong>${trip.id}</strong></div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; font-weight:600; color:var(--text-light);">EST. FARE</div>
                            <div style="font-size:18px; font-weight:700; color:var(--color-primary);">${window.UTILS.formatCurrency(trip.earnings || trip.estimatedEarnings || 410)}</div>
                        </div>
                    </div>

                    <!-- Passenger Drop Status Checklist -->
                    <div style="margin-bottom:20px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-light); text-transform:uppercase; margin-bottom:10px;">PASSENGERS & DROP STATUS</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${passengers.map((p, idx) => `
                                <div class="glass-card" style="padding:14px; border:1px solid var(--border-color); font-size:12.5px;">
                                    <div class="flex-between" style="margin-bottom:6px;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <img src="${p.avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                                            <div>
                                                <strong style="color:var(--text-main); font-size:13px;">${p.name}</strong>
                                                <span style="font-size:11px; color:var(--text-light); display:block;">${p.seat || 'Seat #' + (idx + 1)}</span>
                                            </div>
                                        </div>
                                        <span class="badge ${p.dropStatus === 'Dropped Successfully' ? 'badge-success' : 'badge-warning'}" style="font-size:10px;">${p.dropStatus || 'Pending'}</span>
                                    </div>
                                    <div style="font-size:11.5px; color:var(--text-light); margin-bottom:8px;">
                                        🏁 <strong>Destination:</strong> ${p.drop || trip.drop}
                                    </div>
                                    <div style="display:flex; gap:8px;">
                                        <button class="btn btn-secondary btn-sm" onclick="window.UTILS.showToast('Calling ${p.name}: ${p.phone || '+91 98765 43210'}', 'info')" style="padding:4px 8px; font-size:11px;"><i class="lucide-phone"></i> Call</button>
                                        <button class="btn btn-secondary btn-sm" onclick="window.UTILS.showToast('Navigating to drop-off: ${p.drop || trip.drop}', 'info')" style="padding:4px 8px; font-size:11px;"><i class="lucide-navigation"></i> Nav</button>
                                        ${p.dropStatus !== 'Dropped Successfully' ? `
                                            <button class="btn btn-success btn-sm" onclick="markPassengerDropped('${trip.id}', '${p.id}')" style="padding:4px 10px; font-size:11px; color:#FFF; margin-left:auto;">Complete Drop</button>
                                        ` : `
                                            <span style="color:#16C15D; font-weight:700; font-size:11px; margin-left:auto; display:flex; align-items:center; gap:4px;">✓ Dropped</span>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display:flex; gap:12px;">
                        <button id="navigateDropBtn" class="btn btn-secondary" style="flex:1;"><i class="lucide-navigation"></i> Navigate Route</button>
                        <button id="completeTripBtn" class="btn btn-success" style="flex:2; color:#FFFFFF;" ${passengers.every(p => p.dropStatus === 'Dropped Successfully') ? '' : 'disabled'}>Finish & Complete Trip</button>
                    </div>
                </div>
            `;
            break;

        case 'COMPLETED':
            cardContent = `
                <div class="glass-card trip-workflow-card fade-in" style="text-align:center; padding:32px 24px;">
                    <div style="font-size:48px; margin-bottom:12px;">🎉</div>
                    <h3 style="font-size:20px; font-weight:800; color:var(--text-main); margin-bottom:4px;">Trip Completed!</h3>
                    <p style="font-size:13px; color:var(--text-light); margin-bottom:20px;">All passengers dropped successfully.</p>

                    <div style="background:var(--bg-app); border-radius: var(--border-radius-md); padding:16px; border:1px solid var(--border-color); margin-bottom:24px; text-align:left; font-size:13px;">
                        <div class="flex-between" style="margin-bottom:8px;">
                            <span style="color:var(--text-light);">Trip ID:</span>
                            <strong style="color:var(--text-main);">${trip.id}</strong>
                        </div>
                        <div class="flex-between" style="margin-bottom:8px;">
                            <span style="color:var(--text-light);">Passengers Dropped:</span>
                            <strong style="color:#16C15D;">${passengers.length} Boarders</strong>
                        </div>
                        <div class="flex-between" style="border-top:1px solid var(--border-color); padding-top:8px; margin-top:8px;">
                            <span style="font-weight:700; color:var(--text-main);">Earnings Credited:</span>
                            <span style="font-weight:800; color:var(--color-primary); font-size:18px;">${window.UTILS.formatCurrency(trip.earnings || trip.estimatedEarnings || 410)}</span>
                        </div>
                    </div>

                    <button id="returnToDutyBtn" class="btn btn-primary" style="width:100%; justify-content:center; padding:12px; font-size:14px; font-weight:700;">
                        Return to Duty
                    </button>
                </div>
            `;
            break;
    }

    panel.innerHTML = cardContent;
    bindTripActions(trip);
}

// Global helper for Ride Verification Code entry
window.promptPickupCode = function(tripId, passengerId, expectedCode) {
    const trip = window.STATE.getState('currentTrip');
    if (!trip) return;
    
    const passenger = (trip.passengers || []).find(p => p.id === passengerId);
    const codeInput = prompt(`Enter Ride Verification Code for ${passenger ? passenger.name : 'Passenger'} (Format: e.g. ${expectedCode || 'AB4K'}):`);
    if (!codeInput) return;
    
    if (codeInput.trim().toUpperCase() === (expectedCode || 'AB4K').toUpperCase()) {
        if (passenger) {
            passenger.pickupStatus = 'Picked Up';
        }
        window.UTILS.showToast(`Code accepted! ${passenger ? passenger.name : 'Passenger'} marked Picked Up.`, "success");
        renderActiveTripCard(trip);
    } else {
        window.UTILS.showToast("Invalid Ride Verification Code! Please re-check with passenger.", "error");
    }
};

window.markPassengerDropped = function(tripId, passengerId) {
    const trip = window.STATE.getState('currentTrip');
    if (!trip) return;
    
    const passenger = (trip.passengers || []).find(p => p.id === passengerId);
    if (passenger) {
        passenger.dropStatus = 'Dropped Successfully';
    }
    window.UTILS.showToast(`${passenger ? passenger.name : 'Passenger'} dropped successfully!`, "success");
    
    const allDropped = (trip.passengers || []).every(p => p.dropStatus === 'Dropped Successfully');
    if (allDropped) {
        trip.status = 'COMPLETED';
        if (window.TRIP_API && window.TRIP_API.updateTripStatus) {
            window.TRIP_API.updateTripStatus(trip.id, 'COMPLETED');
        }
    }
    renderActiveTripCard(trip);
};

// Bind clicks to active trip layout actions
function bindTripActions(trip) {
    // 1. Heading to pickup -> Mark Arrived
    const markArrived = document.getElementById('markArrivedBtn');
    if (markArrived) {
        markArrived.onclick = () => {
            window.TRIP_API.updateTripStatus(trip.id, 'ARRIVED')
                .then(() => {
                    window.UTILS.showToast("Arrived at pickup location. Passengers notified.", "success");
                });
        };
    }

    const navPickup = document.getElementById('navigatePickupBtn');
    if (navPickup) {
        navPickup.onclick = () => {
            window.UTILS.showToast("Recalculating route map to pickup spot...", "info");
            if (activeMap) activeMap.centerMap();
        };
    }

    // 2. Arrived -> Start Ride
    const startTripBtn = document.getElementById('startTripBtn');
    if (startTripBtn) {
        startTripBtn.onclick = () => {
            window.TRIP_API.updateTripStatus(trip.id, 'STARTED')
                .then(() => {
                    window.UTILS.showToast("Ride started! Navigating to destinations.", "success");
                });
        };
    }

    // 3. STARTED -> Finish & Complete Trip
    const completeTripBtn = document.getElementById('completeTripBtn');
    if (completeTripBtn) {
        completeTripBtn.onclick = () => {
            window.TRIP_API.updateTripStatus(trip.id, 'COMPLETED')
                .then(() => {
                    window.UTILS.showToast("Trip completed successfully!", "success");
                });
        };
    }

    const navDrop = document.getElementById('navigateDropBtn');
    if (navDrop) {
        navDrop.onclick = () => {
            window.UTILS.showToast("Drawing path to drop-off location...", "info");
            if (activeMap) activeMap.centerMap();
        };
    }

    // 4. Completed -> Return to Duty
    const returnBtn = document.getElementById('returnToDutyBtn');
    if (returnBtn) {
        returnBtn.onclick = () => {
            window.STATE.setState('currentTrip', null);
            window.STATE.setState('onlineStatus', 'ONLINE');
            window.UTILS.showToast("Returned to duty! Ready for next allocation.", "success");
        };
    }
}

// Display dialog modal to review passenger behavior
function showRatePassengersModal(trip) {
    let modal = document.getElementById('ratePassengersModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'ratePassengersModal';
    modal.className = 'sos-overlay fade-in';
    modal.innerHTML = `
        <div class="glass-card scale-in" style="
            background: var(--bg-card-solid);
            width: 100%;
            max-width: 400px;
            border-radius: var(--border-radius-lg);
            padding: 24px;
            box-shadow: var(--shadow-premium);
        ">
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-bottom: 16px; text-align:center;">Rate Boarding Passengers</h3>
            
            <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
                ${trip.passengers.map((p, idx) => `
                    <div style="border-bottom:1px solid var(--border-color); padding-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <img src="${p.avatar}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
                            <span style="font-size:13px; font-weight:700; color:var(--text-main);">${p.name}</span>
                        </div>
                        <div style="display:flex; gap:8px;" id="stars-row-${idx}">
                            ${[1,2,3,4,5].map(star => `
                                <span class="review-star" data-idx="${idx}" data-star="${star}" style="font-size:24px; cursor:pointer; color:#E2E8F0;">★</span>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <button id="submitRatingsBtn" class="btn btn-primary" style="width:100%; justify-content:center;">Submit & Go Free</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Bind rating clicks
    const ratingValues = trip.passengers.map(() => 5); // default 5 star
    
    document.querySelectorAll('.review-star').forEach(starEl => {
        starEl.onclick = (e) => {
            const passengerIdx = parseInt(e.target.getAttribute('data-idx'));
            const starVal = parseInt(e.target.getAttribute('data-star'));
            
            ratingValues[passengerIdx] = starVal;
            
            // Re-render star row colors
            const starRow = document.getElementById(`stars-row-${passengerIdx}`);
            const stars = starRow.querySelectorAll('.review-star');
            stars.forEach((st, i) => {
                if (i < starVal) {
                    st.style.color = '#F59E0B';
                } else {
                    st.style.color = '#E2E8F0';
                }
            });
        };
    });

    document.getElementById('submitRatingsBtn').onclick = () => {
        window.TRIP_API.ratePassenger(trip.id, ratingValues)
            .then(() => {
                modal.remove();
                window.STATE.setState('currentTrip', null); // Reset to search new rides
                window.UTILS.showToast("Review submitted. You are now free for new ride invites.", "success");
            });
    };
}

// Live tick simulations for fare additions (WebSocket triggered)
function adjustActiveTripFare(added) {
    const fareEl = document.getElementById('liveAccruedFare');
    if (!fareEl) return;
    
    const trip = window.STATE.getState('currentTrip');
    if (trip) {
        trip.estimatedEarnings += added;
        fareEl.textContent = window.UTILS.formatCurrency(trip.estimatedEarnings);
    }
}

// Open Chat modal helper
function openChatModal(passengerName) {
    let modal = document.getElementById('passengerChatModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'passengerChatModal';
    modal.className = 'sos-overlay fade-in';
    modal.innerHTML = `
        <div class="glass-card scale-in" style="
            background: var(--bg-card-solid);
            width: 100%;
            max-width: 440px;
            border-radius: var(--border-radius-lg);
            padding: 20px;
            box-shadow: var(--shadow-premium);
        ">
            <div class="flex-between" style="border-bottom:1px solid var(--border-color); padding-bottom:10px; margin-bottom:12px;">
                <h3 style="font-size:15px; font-weight:800; color:var(--text-main);">Chat with ${passengerName}</h3>
                <button id="closeChatModalBtn" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-light);">&times;</button>
            </div>
            
            <div class="chat-window">
                <div class="chat-messages" id="chatModalMessages">
                    <div class="chat-bubble incoming">Hello, where have you reached?</div>
                </div>
                <div class="chat-input-bar">
                    <input type="text" id="chatModalInput" placeholder="Type a message..." style="flex-grow:1; border:1px solid var(--border-color); padding:10px; border-radius:8px; font-size:13px; background:var(--bg-app); color:var(--text-main);">
                    <button id="sendChatModalBtn" class="btn btn-primary" style="padding:10px 16px;"><i class="lucide-send"></i></button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('closeChatModalBtn');
    const sendBtn = document.getElementById('sendChatModalBtn');
    const input = document.getElementById('chatModalInput');
    const msgs = document.getElementById('chatModalMessages');

    closeBtn.onclick = () => modal.remove();

    const sendMessage = () => {
        const text = input.value.trim();
        if (!text) return;
        
        const b = document.createElement('div');
        b.className = 'chat-bubble outgoing';
        b.textContent = text;
        msgs.appendChild(b);
        input.value = '';
        msgs.scrollTop = msgs.scrollHeight;

        // Auto mock reply
        setTimeout(() => {
            const reply = document.createElement('div');
            reply.className = 'chat-bubble incoming';
            reply.textContent = "Okay, standing near the entry gate.";
            msgs.appendChild(reply);
            msgs.scrollTop = msgs.scrollHeight;
        }, 1500);
    };

    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
}

function startLocationUpdateLoop(trip) {
    if (window.locationUpdateInterval) clearInterval(window.locationUpdateInterval);
    
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    // Fetch tracking details once to get the pickup coordinate
    fetch(`http://localhost:4000/api/v1/tracking/${trip.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(payload => {
        if (payload.success && payload.data) {
            const tracking = payload.data;
            const pickupLat = tracking.pickupStop.latitude;
            const pickupLng = tracking.pickupStop.longitude;

            // We can simulate driver coordinates starting at offset and moving to pickup, then to drop
            let currentLat = tracking.driverLocation.latitude;
            let currentLng = tracking.driverLocation.longitude;

            let step = 0;
            const maxSteps = 10; // Number of updates to reach destination

            window.locationUpdateInterval = setInterval(() => {
                const currentTripState = window.STATE.getState('currentTrip');
                if (!currentTripState) {
                    clearInterval(window.locationUpdateInterval);
                    window.locationUpdateInterval = null;
                    return;
                }

                const status = currentTripState.status;
                if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)) {
                    clearInterval(window.locationUpdateInterval);
                    window.locationUpdateInterval = null;
                    return;
                }

                // Calculate next coordinates based on status
                if (status === 'ACCEPTED' || status === 'DRIVER_ASSIGNED' || status === 'DRIVER_ARRIVING') {
                    // Move closer to pickup coordinates
                    currentLat += (pickupLat - currentLat) / (maxSteps - step || 1);
                    currentLng += (pickupLng - currentLng) / (maxSteps - step || 1);
                    step = Math.min(step + 1, maxSteps);
                } else if (status === 'ARRIVED' || status === 'DRIVER_ARRIVED') {
                    // Stay at pickup coordinate
                    currentLat = pickupLat;
                    currentLng = pickupLng;
                } else if (status === 'STARTED' || status === 'TRIP_STARTED') {
                    // Move towards drop coordinates (electronic city)
                    const dropLat = pickupLat - 0.078;
                    const dropLng = pickupLng + 0.045;
                    currentLat += (dropLat - currentLat) / (maxSteps - step || 1);
                    currentLng += (dropLng - currentLng) / (maxSteps - step || 1);
                    step = Math.min(step + 1, maxSteps);
                }

                console.log(`Sending simulated driver coordinates: [${currentLng}, ${currentLat}]`);
                // POST driver-location
                fetch('http://localhost:4000/api/v1/tracking/driver-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        tripId: trip.id,
                        longitude: currentLng,
                        latitude: currentLat
                    })
                }).catch(console.error);

            }, 8000); // Send update every 8 seconds
        }
    })
    .catch(console.error);
}
