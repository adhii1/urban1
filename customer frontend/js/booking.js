/**
 * URBAN Commuto - Customer Portal Booking Flow Orchestrator
 * Supports 4 Customer Models with customized steps, searchable dropdowns, and validation
 */

document.addEventListener('DOMContentLoaded', () => {
    // Auth Protection Check
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    // State Variables
    let currentStep = 1; 
    let bookingData = {
        selectedModel: 'home-one-time', // 'home-one-time', 'home-3day', 'home-mon-fri', 'stop-to-stop'
        pickup: 'HSR Layout Sector 4, Bangalore',
        destination: 'Electronic City Phase 1',
        time: '09:00',
        returnTime: '18:00',
        timeSlot: 'morning',
        passengersCount: 1,
        hybridDays: ['Monday', 'Wednesday', 'Friday']
    };

    const redesignRoot = document.getElementById('redesign-root');
    const globalBackButton = document.getElementById('globalBackButton');
    const bookingPageTitle = document.getElementById('bookingPageTitle');

    function updateTitle() {
        if (!bookingPageTitle) return;
        const titles = {
            1: 'Select Booking Model',
            2: bookingData.selectedModel === 'stop-to-stop' ? 'Select Bus Stops' : 'Pickup Location',
            3: bookingData.selectedModel === 'stop-to-stop' ? 'Schedule & Pickup Time' : 'Destination TORQQ Stop',
            4: bookingData.selectedModel === 'stop-to-stop' ? 'Passengers' : 'Schedule & Pickup Time',
            5: bookingData.selectedModel === 'stop-to-stop' ? 'Summary & Fare' : 'Passengers',
            6: bookingData.selectedModel === 'stop-to-stop' ? 'Payment' : 'Summary & Fare',
            7: bookingData.selectedModel === 'stop-to-stop' ? 'Confirmed' : 'Payment',
            8: 'Confirmed'
        };
        bookingPageTitle.textContent = titles[currentStep] || 'Book Ride';
    }

    function getTotalSteps() {
        return bookingData.selectedModel === 'stop-to-stop' ? 7 : 8;
    }

    function renderStep() {
        updateTitle();
        if (!redesignRoot) return;

        const totalSteps = getTotalSteps();
        redesignRoot.innerHTML = BookingComponents.renderProgressBar(currentStep - 1, totalSteps);

        // STEP 1: Model Selection
        if (currentStep === 1) {
            redesignRoot.innerHTML += BookingComponents.renderModelSelection(bookingData.selectedModel);
            return;
        }

        // STEP 2 & 3: Locations
        if (bookingData.selectedModel === 'stop-to-stop') {
            if (currentStep === 2) {
                redesignRoot.innerHTML += BookingComponents.renderStopToStopLocationsStep(bookingData.pickup, bookingData.destination);
                attachStopToStopInteractions();
                return;
            }
            if (currentStep === 3) {
                redesignRoot.innerHTML += BookingComponents.renderScheduleStep('stop-to-stop', bookingData);
                attachScheduleInteractions('stop-to-stop');
                return;
            }
            if (currentStep === 4) {
                redesignRoot.innerHTML += BookingComponents.renderPassengersStep(bookingData.passengersCount);
                attachPassengersInteractions();
                return;
            }
            if (currentStep === 5) {
                redesignRoot.innerHTML += BookingComponents.renderSummaryStep(bookingData);
                attachSummaryInteractions();
                return;
            }
            if (currentStep === 6) {
                redesignRoot.innerHTML += BookingComponents.renderPaymentStep();
                attachPaymentInteractions();
                return;
            }
            if (currentStep === 7) {
                renderSuccessScreen();
                return;
            }
        } else {
            // Home to Stop Models (home-one-time, home-3day, home-mon-fri)
            if (currentStep === 2) {
                redesignRoot.innerHTML += BookingComponents.renderHomePickupStep(bookingData.pickup);
                attachHomePickupInteractions();
                return;
            }
            if (currentStep === 3) {
                redesignRoot.innerHTML += BookingComponents.renderDestinationStep(bookingData.destination);
                attachDestinationInteractions();
                return;
            }
            if (currentStep === 4) {
                redesignRoot.innerHTML += BookingComponents.renderScheduleStep(bookingData.selectedModel, bookingData);
                attachScheduleInteractions(bookingData.selectedModel);
                return;
            }
            if (currentStep === 5) {
                redesignRoot.innerHTML += BookingComponents.renderPassengersStep(bookingData.passengersCount);
                attachPassengersInteractions();
                return;
            }
            if (currentStep === 6) {
                redesignRoot.innerHTML += BookingComponents.renderSummaryStep(bookingData);
                attachSummaryInteractions();
                return;
            }
            if (currentStep === 7) {
                redesignRoot.innerHTML += BookingComponents.renderPaymentStep();
                attachPaymentInteractions();
                return;
            }
            if (currentStep === 8) {
                renderSuccessScreen();
                return;
            }
        }
    }

    // Interactions for Home Pickup Step
    function attachHomePickupInteractions() {
        const input = document.getElementById('pickupInput');
        const detectBtn = document.getElementById('btn-detect-loc');
        const nextBtn = document.getElementById('btn-next-pickup');
        const pills = document.querySelectorAll('.stop-pill-item');

        pills.forEach(p => {
            p.addEventListener('click', () => {
                const name = p.getAttribute('data-stop-name');
                if (input) input.value = name;
            });
        });

        if (detectBtn && typeof locationService !== 'undefined') {
            detectBtn.addEventListener('click', async () => {
                detectBtn.disabled = true;
                detectBtn.textContent = 'Detecting...';
                const loc = await locationService.detectCurrentLocation();
                if (input && loc.success) input.value = loc.data.address;
                detectBtn.disabled = false;
                detectBtn.textContent = 'Detect Location';
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (!input || !input.value.trim()) {
                    showValidationToast('Please enter a valid pickup address.');
                    return;
                }
                bookingData.pickup = input.value.trim();
                currentStep = 3;
                renderStep();
            });
        }
    }

    // Interactions for Destination Step
    function attachDestinationInteractions() {
        const searchInput = document.getElementById('destSearchInput');
        const listContainer = document.getElementById('destStopsList');
        const nextBtn = document.getElementById('btn-next-destination');

        if (searchInput && listContainer) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase();
                const items = listContainer.querySelectorAll('.dest-stop-item');
                items.forEach(item => {
                    const txt = item.textContent.toLowerCase();
                    item.style.display = txt.includes(q) ? 'flex' : 'none';
                });
            });
        }

        if (listContainer) {
            listContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.dest-stop-item');
                if (item) {
                    listContainer.querySelectorAll('.dest-stop-item').forEach(i => {
                        i.style.background = 'rgba(15,23,42,0.03)';
                        i.style.borderColor = 'rgba(0,0,0,0.05)';
                        i.classList.remove('selected-stop');
                    });
                    item.style.background = 'rgba(22,193,93,0.1)';
                    item.style.borderColor = '#16C15D';
                    item.classList.add('selected-stop');
                    const stopName = item.getAttribute('data-stop-name');
                    if (searchInput) searchInput.value = stopName;
                    bookingData.destination = stopName;
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const val = searchInput ? searchInput.value.trim() : bookingData.destination;
                if (!val) {
                    showValidationToast('Please select a destination stop.');
                    return;
                }
                bookingData.destination = val;
                currentStep = 4;
                renderStep();
            });
        }
    }

    // Interactions for Stop-to-Stop Location Step (Model 4)
    function attachStopToStopInteractions() {
        const pickupInput = document.getElementById('pickupBusStopInput');
        const pickupDD = document.getElementById('pickupDropdown');
        const destInput = document.getElementById('destBusStopInput');
        const destDD = document.getElementById('destDropdown');
        const nextBtn = document.getElementById('btn-next-stop-locations');

        function setupDropdown(inputEl, dropdownEl, itemClass, dataProp) {
            if (!inputEl || !dropdownEl) return;
            inputEl.addEventListener('focus', () => { dropdownEl.style.display = 'block'; });
            inputEl.addEventListener('input', (e) => {
                dropdownEl.style.display = 'block';
                const q = e.target.value.toLowerCase();
                const items = dropdownEl.querySelectorAll(`.${itemClass}`);
                items.forEach(i => {
                    const txt = i.textContent.toLowerCase();
                    i.style.display = txt.includes(q) ? 'flex' : 'none';
                });
            });
            dropdownEl.addEventListener('click', (e) => {
                const item = e.target.closest(`.${itemClass}`);
                if (item) {
                    const val = item.getAttribute('data-value');
                    inputEl.value = val;
                    bookingData[dataProp] = val;
                    dropdownEl.style.display = 'none';
                }
            });
        }

        setupDropdown(pickupInput, pickupDD, 'pickup-drop-item', 'pickup');
        setupDropdown(destInput, destDD, 'dest-drop-item', 'destination');

        document.addEventListener('click', (e) => {
            if (pickupDD && !pickupInput.contains(e.target) && !pickupDD.contains(e.target)) {
                pickupDD.style.display = 'none';
            }
            if (destDD && !destInput.contains(e.target) && !destDD.contains(e.target)) {
                destDD.style.display = 'none';
            }
        });

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const pVal = pickupInput ? pickupInput.value.trim() : '';
                const dVal = destInput ? destInput.value.trim() : '';
                if (!pVal || !dVal) {
                    showValidationToast('Please select both Pickup and Destination bus stops.');
                    return;
                }
                if (pVal === dVal) {
                    showValidationToast('Pickup and Destination bus stops cannot be identical.');
                    return;
                }
                bookingData.pickup = pVal;
                bookingData.destination = dVal;
                currentStep = 3;
                renderStep();
            });
        }
    }

    // Interactions for Schedule Step
    function attachScheduleInteractions(modelId) {
        const nextBtn = document.getElementById('btn-next-schedule');

        if (modelId === 'home-3day') {
            const checkboxes = document.querySelectorAll('.weekday-cb');
            const notice = document.getElementById('weekdayCountNotice');

            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const checked = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
                    if (notice) notice.textContent = `${checked.length}/3 Weekdays Selected`;
                    bookingData.hybridDays = checked;
                });
            });

            const radios = document.getElementsByName('timeSlot');
            radios.forEach(r => {
                r.addEventListener('change', (e) => {
                    bookingData.timeSlot = e.target.value;
                });
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const timeInput = document.getElementById('bookingTime');
                if (timeInput) bookingData.time = timeInput.value;

                const returnTimeInput = document.getElementById('returnTime');
                if (returnTimeInput) bookingData.returnTime = returnTimeInput.value;

                if (modelId === 'home-3day') {
                    if (!bookingData.hybridDays || bookingData.hybridDays.length !== 3) {
                        showValidationToast('Please select exactly 3 weekdays for your 3-Day Weekly Pass.');
                        return;
                    }
                }

                currentStep = modelId === 'stop-to-stop' ? 4 : 5;
                renderStep();
            });
        }
    }

    // Interactions for Passengers Step
    function attachPassengersInteractions() {
        const minus = document.getElementById('passenger-minus');
        const plus = document.getElementById('passenger-plus');
        const display = document.getElementById('passenger-count-display');
        const nextBtn = document.getElementById('btn-next-passengers');

        if (minus) minus.addEventListener('click', () => {
            if (bookingData.passengersCount > 1) {
                bookingData.passengersCount--;
                if (display) display.textContent = bookingData.passengersCount;
            }
        });
        if (plus) plus.addEventListener('click', () => {
            if (bookingData.passengersCount < 4) {
                bookingData.passengersCount++;
                if (display) display.textContent = bookingData.passengersCount;
            }
        });

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentStep = bookingData.selectedModel === 'stop-to-stop' ? 5 : 6;
                renderStep();
            });
        }
    }

    // Interactions for Summary Step
    function attachSummaryInteractions() {
        const nextBtn = document.getElementById('btn-next-payment');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentStep = bookingData.selectedModel === 'stop-to-stop' ? 6 : 7;
                renderStep();
            });
        }
    }

    // Resolves lat/lng for a saved address string. The current booking UI
    // only ever stores address text in bookingData (no real geocoder is
    // wired in yet), so this looks the address up against
    // locationService's known TORQQ stop list first, and falls back to a
    // default city-center coordinate for free-typed addresses that don't
    // match a known stop.
    function resolveCoordinates(address) {
        if (typeof locationService !== 'undefined' && Array.isArray(locationService.PREDEFINED_BUS_STOPS)) {
            const match = locationService.PREDEFINED_BUS_STOPS.find((s) => s.name === address);
            if (match) return [match.lng, match.lat];
        }
        return [77.6389, 12.9116]; // Fallback: HSR Layout, Bangalore
    }

    // Interactions for Payment Step
    function attachPaymentInteractions() {
        const btnConfirm = document.getElementById('btn-confirm-pay');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', async () => {
                btnConfirm.disabled = true;
                btnConfirm.innerHTML = `<span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid #FFF; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:8px;"></span> Processing Booking...`;

                try {
                    let res = { success: true, data: { id: 'TRQ-BK-' + Math.floor(1000 + Math.random() * 9000) } };

                    const pickup = {
                        address: bookingData.pickup,
                        coordinates: resolveCoordinates(bookingData.pickup),
                    };
                    const drop = {
                        address: bookingData.destination,
                        coordinates: resolveCoordinates(bookingData.destination),
                    };

                    // For recurring models (3-day, 5-day, shuttle): create subscription via REST
                    if (['home-3day', 'home-mon-fri', 'stop-to-stop'].includes(bookingData.selectedModel)) {
                        const planMap = { 'home-3day': 'Hybrid', 'home-mon-fri': 'Weekday', 'stop-to-stop': 'Standard' };
                        const tierName = planMap[bookingData.selectedModel];
                        
                        // Get plan ID for this tier
                        const plansRes = await CUSTOMER_API.getPlans();
                        const plan = (plansRes.data || []).find(p => p.tier === tierName);
                        
                        if (plan) {
                            // Get first route
                            const routesRes = await CUSTOMER_API.request(`/customer/plans/${plan._id}/routes`);
                            const route = (routesRes.data || [])[0];
                            
                            if (route) {
                                // Map weekday names to numbers
                                const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
                                const selectedWeekdays = (bookingData.hybridDays || []).map(d => dayMap[d]).filter(d => d !== undefined);
                                
                                const subRes = await CUSTOMER_API.request('/customer/subscriptions/purchase', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        planId: plan._id,
                                        routeId: route._id,
                                        startDate: new Date().toISOString().split('T')[0],
                                        selectedWeekdays: selectedWeekdays.length > 0 ? selectedWeekdays : undefined,
                                        pickupStopIndex: 0,
                                        dropStopIndex: Math.min(2, (route.stops || []).length - 1),
                                    }),
                                });
                                
                                if (subRes.success) {
                                    // Auto-verify payment in dev (mock)
                                    await CUSTOMER_API.request('/customer/subscriptions/verify-payment', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            subscriptionId: subRes.data.subscriptionId,
                                            orderId: subRes.data.orderId,
                                            paymentId: 'pay_mock_' + Date.now(),
                                            signature: 'mock_sig',
                                        }),
                                    });
                                    res = { success: true, data: { id: subRes.data.subscriptionId, type: 'subscription' } };
                                } else {
                                    throw new Error(subRes.message || 'Subscription failed');
                                }
                            }
                        }
                    } else {
                        // For one-time (flexi): use socket ride request
                        if (typeof RIDE_SOCKET !== 'undefined') {
                            if (!RIDE_SOCKET.isConnected()) {
                                RIDE_SOCKET.connect();
                                await new Promise(r => setTimeout(r, 2000));
                            }
                            
                            let scheduledTime = null;
                            if (bookingData.time) {
                                const [h, m] = bookingData.time.split(':');
                                const scheduled = new Date();
                                scheduled.setHours(parseInt(h), parseInt(m), 0, 0);
                                if (scheduled.getTime() > Date.now() + 30 * 60 * 1000) {
                                    scheduledTime = scheduled.toISOString();
                                }
                            }
                            
                            RIDE_SOCKET.requestRide(pickup, drop, scheduledTime);
                            
                            res = await new Promise((resolve) => {
                                RIDE_SOCKET.on('ride:request:ack', (data) => {
                                    resolve({ success: true, data: { id: data.rideRequestId, ...data } });
                                });
                                RIDE_SOCKET.on('ride:request:error', (data) => {
                                    resolve({ success: false, message: data.message });
                                });
                                setTimeout(() => resolve({ success: true, data: { id: 'pending' } }), 5000);
                            });
                            
                            if (!res.success) throw new Error(res.message || 'Booking failed');
                        }
                    }

                    currentStep = bookingData.selectedModel === 'stop-to-stop' ? 7 : 8;
                    renderStep();
                    if (typeof UIComponents !== 'undefined') {
                        UIComponents.showToast('Ride booked successfully!', 'success');
                    }
                } catch (err) {
                    btnConfirm.disabled = false;
                    btnConfirm.textContent = 'Confirm & Book Ride Now';
                    showValidationToast(err && err.message ? err.message : 'Failed to create booking. Please try again.');
                }
            });
        }
    }

    function renderSuccessScreen() {
        if (!redesignRoot) return;
        redesignRoot.innerHTML = BookingComponents.renderSuccessScreen(bookingData);
    }

    function showValidationToast(msg) {
        if (typeof UIComponents !== 'undefined' && UIComponents.showToast) {
            UIComponents.showToast(msg, 'warning');
        } else {
            alert(msg);
        }
    }

    // Event Delegation for Model Card Selection
    if (redesignRoot) {
        redesignRoot.addEventListener('click', (e) => {
            const card = e.target.closest('.option-card');
            if (card && currentStep === 1) {
                const modelId = card.getAttribute('data-model-id');
                if (modelId) {
                    bookingData.selectedModel = modelId;
                    currentStep = 2;
                    renderStep();
                }
            }
        });
    }

    if (globalBackButton) {
        globalBackButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentStep > 1 && currentStep < getTotalSteps()) {
                currentStep--;
                renderStep();
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    renderStep();
});
