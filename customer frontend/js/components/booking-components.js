/**
 * URBAN Commuto - Customer Portal Booking Redesign Components
 * Pure Vanilla JS Component Module
 * Brand Color: Emerald Green (#16C15D)
 */

window.BookingComponents = {
    /**
     * Renders Model Selection Cards for the 4 customer-friendly models
     */
    renderModelSelection(selectedModel = '') {
        const models = [
            {
                id: 'home-one-time',
                heading: 'Home to Stop',
                subtitle: 'One-Time Ride',
                description: 'Book a one-time ride from your home/current pickup location to your selected TORQQ stop. Ride must be booked at least 2 hours before pickup.',
                badge: 'Doorstep',
                icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
            },
            {
                id: 'home-3day',
                heading: 'Home to Stop',
                subtitle: '3-Day Weekly Pass',
                description: 'Book recurring rides on any THREE selected weekdays every week from your home/current pickup location to your selected TORQQ stop.',
                badge: '3 Days/wk',
                icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
            },
            {
                id: 'home-mon-fri',
                heading: 'Home to Stop',
                subtitle: 'Monday–Friday Pass',
                description: 'Book recurring rides every Monday to Friday from your home/current pickup location to your selected TORQQ stop.',
                badge: '5 Days/wk',
                icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
            },
            {
                id: 'stop-to-stop',
                heading: 'Stop to Stop',
                subtitle: 'Bus Stop Shuttle',
                description: 'Travel between predefined TORQQ/Government bus stops by selecting your boarding stop and destination stop.',
                badge: 'Corridor Shuttle',
                icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="8" y2="17"/><line x1="16" y1="21" x2="16" y2="17"/><line x1="2" y1="9" x2="22" y2="9"/></svg>`
            }
        ];

        return `
            <div class="booking-subtitle fade-in-slide">Select your preferred ride model to view custom commuting options.</div>
            <div class="services-grid" style="grid-template-columns: repeat(2, 1fr); gap: 20px;">
                ${models.map(m => `
                    <div class="glass-card option-card fade-in-slide ${selectedModel === m.id ? 'active-card' : ''}" data-model-id="${m.id}" id="model-${m.id}" style="padding: 24px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between;">
                        <div class="option-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                            <div class="option-icon-container">
                                ${m.icon}
                            </div>
                            <span class="service-badge">${m.badge}</span>
                        </div>
                        <div class="option-body">
                            <div style="font-size: 12px; font-weight: 700; color: #16C15D; text-transform: uppercase; letter-spacing: 0.5px;">${m.heading}</div>
                            <div class="option-title" style="font-size: 18px; font-weight: 800; color: var(--clr-navy-slate); margin: 2px 0 6px 0;">${m.subtitle}</div>
                            <div class="option-desc" style="font-size: 13px; color: var(--clr-text-light); line-height: 1.4;">${m.description}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Renders Step Wizard Progress Bar
     */
    renderProgressBar(currentStepIndex, totalSteps = 6) {
        const stepLabels = ['Model', 'Locations', 'Schedule & Time', 'Passengers', 'Summary & Payment', 'Confirmed'];
        const percentage = Math.round(((currentStepIndex + 1) / totalSteps) * 100);
        return `
            <div style="margin-bottom: 24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--clr-text-light); margin-bottom:8px;">
                    <span style="font-weight:600; color:var(--clr-text-main);">Step ${currentStepIndex + 1} of ${totalSteps}: ${stepLabels[currentStepIndex] || ''}</span>
                    <span>${percentage}% Complete</span>
                </div>
                <div style="width:100%; height:6px; background:rgba(0,0,0,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${percentage}%; height:100%; background:#16C15D; transition:width 0.3s ease;"></div>
                </div>
            </div>
        `;
    },

    /**
     * Renders Pickup Location Step for Home to Stop models
     */
    renderHomePickupStep(defaultValue = '') {
        const stops = typeof locationService !== 'undefined' ? locationService.PREDEFINED_BUS_STOPS : [];

        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Pickup Location</h3>
                    <p>Enter your home or current address for doorstep pickup</p>
                </div>

                <div class="redesign-form-group">
                    <label for="pickupInput">Home / Pickup Address</label>
                    <div class="input-with-action">
                        <div class="input-container">
                            <input type="text" class="redesign-input" id="pickupInput" placeholder="Enter home address or landmark..." value="${defaultValue}" required>
                        </div>
                        <button type="button" class="btn-detect" id="btn-detect-loc">
                            <span class="detect-text">Detect Location</span>
                        </button>
                    </div>
                </div>

                <div style="margin-top:16px;">
                    <div style="font-size:12px; font-weight:600; color:var(--clr-text-light); margin-bottom:8px;">OR SELECT POPULAR PICKUP POINTS:</div>
                    <div style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;">
                        ${stops.map(s => `
                            <div class="stop-pill-item" data-stop-name="${s.name}" style="padding:10px 14px; background:rgba(15,23,42,0.03); border:1px solid rgba(0,0,0,0.05); border-radius:10px; cursor:pointer; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
                                <span>📍 ${s.name}</span>
                                <span style="font-size:11px; color:#16C15D; font-weight:600;">${s.corridor}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-next-pickup" style="margin-top:20px;">
                    Continue to Destination TORQQ Stop →
                </button>
            </div>
        `;
    },

    /**
     * Renders Destination Step for Home to Stop models
     */
    renderDestinationStep(defaultValue = '') {
        const stops = typeof locationService !== 'undefined' ? locationService.PREDEFINED_BUS_STOPS : [];

        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Destination TORQQ Stop</h3>
                    <p>Select your drop-off corridor bus stop</p>
                </div>

                <div class="redesign-form-group">
                    <label for="destSearchInput">Search Destination Stop</label>
                    <input type="text" class="redesign-input" id="destSearchInput" placeholder="Type to search stops (e.g. Silk Board, Whitefield)..." value="${defaultValue}">
                </div>

                <div style="margin-top:12px;">
                    <div style="font-size:12px; font-weight:600; color:var(--clr-text-light); margin-bottom:8px;">PREDEFINED BUS STOPS:</div>
                    <div id="destStopsList" style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; padding-right:4px;">
                        ${stops.map(s => `
                            <div class="dest-stop-item ${defaultValue === s.name ? 'selected-stop' : ''}" data-stop-name="${s.name}" style="padding:10px 14px; background:${defaultValue === s.name ? 'rgba(22,193,93,0.1)' : 'rgba(15,23,42,0.03)'}; border:1px solid ${defaultValue === s.name ? '#16C15D' : 'rgba(0,0,0,0.05)'}; border-radius:10px; cursor:pointer; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight:600;">🚏 ${s.name}</span>
                                <span style="font-size:11px; color:#16C15D; font-weight:600;">${s.corridor}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-next-destination" style="margin-top:20px;">
                    Continue to Schedule →
                </button>
            </div>
        `;
    },

    /**
     * Renders combined Stop-to-Stop Location Step (Model 4)
     * Searchable dropdowns for both Pickup and Destination. NO location detection.
     */
    renderStopToStopLocationsStep(pickupValue = '', destValue = '') {
        const stops = typeof locationService !== 'undefined' ? locationService.PREDEFINED_BUS_STOPS : [];

        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Select Bus Stops</h3>
                    <p>Choose boarding and destination points from predefined TORQQ/Government bus stops</p>
                </div>

                <div class="redesign-form-group">
                    <label for="pickupBusStopInput">Pickup Bus Stop</label>
                    <div style="position:relative;">
                        <input type="text" class="redesign-input" id="pickupBusStopInput" placeholder="Search or select pickup bus stop..." value="${pickupValue}" autocomplete="off">
                        <div id="pickupDropdown" class="stop-dropdown-menu" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:180px; overflow-y:auto; background:#FFF; border:1px solid rgba(0,0,0,0.1); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100; margin-top:4px;">
                            ${stops.map(s => `
                                <div class="dropdown-item pickup-drop-item" data-value="${s.name}" style="padding:10px 14px; cursor:pointer; font-size:13px; border-bottom:1px solid rgba(0,0,0,0.04); display:flex; justify-content:space-between;">
                                    <strong>🚏 ${s.name}</strong>
                                    <span style="font-size:11px; color:var(--clr-text-light);">${s.corridor}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div style="text-align:center; margin:-4px 0 8px 0; color:#16C15D; font-size:18px; font-weight:800;">
                    ↓
                </div>

                <div class="redesign-form-group">
                    <label for="destBusStopInput">Destination Bus Stop</label>
                    <div style="position:relative;">
                        <input type="text" class="redesign-input" id="destBusStopInput" placeholder="Search or select destination bus stop..." value="${destValue}" autocomplete="off">
                        <div id="destDropdown" class="stop-dropdown-menu" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:180px; overflow-y:auto; background:#FFF; border:1px solid rgba(0,0,0,0.1); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100; margin-top:4px;">
                            ${stops.map(s => `
                                <div class="dropdown-item dest-drop-item" data-value="${s.name}" style="padding:10px 14px; cursor:pointer; font-size:13px; border-bottom:1px solid rgba(0,0,0,0.04); display:flex; justify-content:space-between;">
                                    <strong>🚏 ${s.name}</strong>
                                    <span style="font-size:11px; color:var(--clr-text-light);">${s.corridor}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-next-stop-locations" style="margin-top:20px;">
                    Continue to Pickup Time →
                </button>
            </div>
        `;
    },

    /**
     * Renders Schedule & Time Step tailored for each model (NO date pickers!)
     */
    renderScheduleStep(modelId, bookingData) {
        let content = '';

        if (modelId === 'home-one-time') {
            content = `
                <div class="redesign-form-group">
                    <label for="bookingTime">Preferred Pickup Time</label>
                    <input type="time" class="redesign-input" id="bookingTime" value="${bookingData.time || '09:00'}" required>
                </div>

                <div style="font-size:13px; color:#3B82F6; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); padding:12px 16px; border-radius:12px; margin-top:16px;">
                    ℹ️ Bookings must be made at least 2 hours before your preferred pickup time.
                </div>
            `;
        } else if (modelId === 'home-3day') {
            const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const selectedDays = bookingData.hybridDays || [];
            const timeSlot = bookingData.timeSlot || 'morning';

            content = `
                <div class="redesign-form-group">
                    <label style="margin-bottom:8px; display:block;">Select Exactly 3 Weekdays</label>
                    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;" id="weekdayCheckboxesGroup">
                        ${allDays.map(d => {
                            const isChecked = selectedDays.includes(d);
                            return `
                                <label style="padding:12px 14px; background:${isChecked ? 'rgba(22,193,93,0.12)' : 'rgba(15,23,42,0.03)'}; border:1.5px solid ${isChecked ? '#16C15D' : 'rgba(0,0,0,0.08)'}; border-radius:12px; display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600; font-size:13px; color:var(--clr-navy-slate);">
                                    <input type="checkbox" class="weekday-cb" value="${d}" ${isChecked ? 'checked' : ''} style="accent-color:#16C15D; width:16px; height:16px;">
                                    <span>${d}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <span id="weekdayCountNotice" style="font-size:12px; color:#16C15D; font-weight:600; margin-top:6px; display:block;">${selectedDays.length}/3 Weekdays Selected</span>
                </div>

                <div class="redesign-form-group" style="margin-top:16px;">
                    <label for="bookingTime">Preferred Pickup Time</label>
                    <input type="time" class="redesign-input" id="bookingTime" value="${bookingData.time || '09:00'}" required>
                </div>

                <div style="font-size:13px; color:#16C15D; background:rgba(22,193,93,0.1); border:1px solid rgba(22,193,93,0.2); padding:12px 16px; border-radius:12px; margin-top:16px;">
                    🔄 This booking automatically repeats every week on the selected weekdays.
                </div>
            `;
        } else if (modelId === 'home-mon-fri') {
            const fixedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

            content = `
                <div class="redesign-form-group">
                    <label style="margin-bottom:8px; display:block;">Pass Schedule (Pre-selected)</label>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                        ${fixedDays.map(d => `
                            <div style="padding:10px 12px; background:rgba(22,193,93,0.1); border:1px solid #16C15D; border-radius:10px; font-weight:700; font-size:12px; color:#16C15D; text-align:center;">
                                ✓ ${d}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="redesign-form-group" style="margin-top:16px;">
                    <label for="bookingTime">Pickup Time</label>
                    <input type="time" class="redesign-input" id="bookingTime" value="${bookingData.time || '09:00'}" required>
                </div>

                <div class="redesign-form-group">
                    <label for="returnTime">Return Time (Optional)</label>
                    <input type="time" class="redesign-input" id="returnTime" value="${bookingData.returnTime || '18:00'}">
                </div>

                <div style="font-size:13px; color:#16C15D; background:rgba(22,193,93,0.1); border:1px solid rgba(22,193,93,0.2); padding:12px 16px; border-radius:12px; margin-top:16px;">
                    🔄 This booking automatically repeats every Monday to Friday.
                </div>
            `;
        } else {
            // stop-to-stop
            content = `
                <div class="redesign-form-group">
                    <label for="bookingTime">Pickup Time</label>
                    <input type="time" class="redesign-input" id="bookingTime" value="${bookingData.time || '09:00'}" required>
                </div>
            `;
        }

        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Configure Schedule & Time</h3>
                    <p>Set timing preferences for your commute</p>
                </div>

                ${content}

                <button type="button" class="btn-redesign-primary" id="btn-next-schedule" style="margin-top:20px;">
                    Continue to Passengers →
                </button>
            </div>
        `;
    },

    /**
     * Renders Passengers Step
     */
    renderPassengersStep(defaultCount = 1) {
        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Number of Passengers</h3>
                    <p>Reserve seating (Max 4 seats per booking)</p>
                </div>

                <div class="redesign-form-group" style="text-align:center; padding:20px 0;">
                    <div style="display:flex; justify-content:center; align-items:center; gap:20px;">
                        <button type="button" id="passenger-minus" style="width:48px; height:48px; border-radius:50%; background:rgba(0,0,0,0.06); font-size:22px; font-weight:700; cursor:pointer;">-</button>
                        <span id="passenger-count-display" style="font-size:32px; font-weight:800; color:#16C15D; min-width:40px;">${defaultCount}</span>
                        <button type="button" id="passenger-plus" style="width:48px; height:48px; border-radius:50%; background:rgba(0,0,0,0.06); font-size:22px; font-weight:700; cursor:pointer;">+</button>
                    </div>
                    <span style="font-size:12px; color:var(--clr-text-light); margin-top:10px; display:block;">Seats reserved in shared TORQQ EV shuttle</span>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-next-passengers" style="margin-top:10px;">
                    Review Summary & Fare →
                </button>
            </div>
        `;
    },

    /**
     * Renders Estimated Fare & Booking Summary Step
     */
    renderSummaryStep(bookingData) {
        const fare = (bookingData.passengersCount || 1) * 160.00;
        const modelTitles = {
            'home-one-time': 'Home to Stop (One-Time Ride)',
            'home-3day': 'Home to Stop (3-Day Weekly Pass)',
            'home-mon-fri': 'Home to Stop (Monday–Friday Pass)',
            'stop-to-stop': 'Stop to Stop (Bus Stop Shuttle)'
        };

        let scheduleStr = bookingData.time || '09:00 AM';
        if (bookingData.selectedModel === 'home-3day' && bookingData.hybridDays) {
            scheduleStr = `${bookingData.hybridDays.join(', ')} (${bookingData.timeSlot || 'Morning'})`;
        } else if (bookingData.selectedModel === 'home-mon-fri') {
            scheduleStr = `Mon–Fri at ${bookingData.time || '09:00'}${bookingData.returnTime ? ' (Return: ' + bookingData.returnTime + ')' : ''}`;
        }

        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Booking Summary & Fare</h3>
                    <p>Review trip details before confirming payment</p>
                </div>

                <div style="background:rgba(15,23,42,0.03); padding:18px; border-radius:14px; margin-bottom:18px; display:flex; flex-direction:column; gap:12px; font-size:13.5px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--clr-text-light);">Model:</span>
                        <strong style="color:#16C15D; font-weight:700;">${modelTitles[bookingData.selectedModel] || 'Shared Shuttle'}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--clr-text-light);">Boarding / Pickup:</span>
                        <strong>${bookingData.pickup}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--clr-text-light);">Destination Stop:</span>
                        <strong>${bookingData.destination}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--clr-text-light);">Schedule:</span>
                        <strong>${scheduleStr}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--clr-text-light);">Passengers:</span>
                        <strong>${bookingData.passengersCount} Seat(s)</strong>
                    </div>
                </div>

                <div style="border-top:1px dashed rgba(0,0,0,0.1); padding-top:16px; margin-bottom:20px; display:flex; flex-direction:column; gap:8px; font-size:13px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span>Subtotal (${bookingData.passengersCount} Seat):</span>
                        <span>₹${fare.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:#16C15D;">
                        <span>TORQQ Pass Coverage:</span>
                        <span>-₹0.00</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:800; color:var(--clr-text-main); margin-top:6px;">
                        <span>Total Fare:</span>
                        <span style="color:#16C15D;">₹${fare.toFixed(2)} (or 1 Pass)</span>
                    </div>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-next-payment">
                    Proceed to Payment Screen →
                </button>
            </div>
        `;
    },

    /**
     * Renders Payment Selection Step
     */
    renderPaymentStep() {
        return `
            <div class="glass-card form-card fade-in-slide">
                <div class="form-title-area">
                    <h3>Select Payment Method</h3>
                    <p>Choose your preferred payment mode for pass or ride</p>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
                    <label style="padding:14px; background:rgba(22,193,93,0.1); border:2px solid #16C15D; border-radius:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <div>
                            <strong style="display:block; font-size:14px;">TORQQ Pass Balance</strong>
                            <span style="font-size:12px; color:var(--clr-text-light);">18 Passes Remaining</span>
                        </div>
                        <input type="radio" name="payMethod" value="pass" checked style="accent-color:#16C15D; width:18px; height:18px;">
                    </label>
                    <label style="padding:14px; background:rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.08); border-radius:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <div>
                            <strong style="display:block; font-size:14px;">TORQQ Wallet Cash</strong>
                            <span style="font-size:12px; color:var(--clr-text-light);">Balance: ₹1,250.00</span>
                        </div>
                        <input type="radio" name="payMethod" value="wallet" style="accent-color:#16C15D; width:18px; height:18px;">
                    </label>
                    <label style="padding:14px; background:rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.08); border-radius:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <div>
                            <strong style="display:block; font-size:14px;">UPI / Cards / NetBanking</strong>
                            <span style="font-size:12px; color:var(--clr-text-light);">Instant digital payment</span>
                        </div>
                        <input type="radio" name="payMethod" value="upi" style="accent-color:#16C15D; width:18px; height:18px;">
                    </label>
                </div>

                <button type="button" class="btn-redesign-primary" id="btn-confirm-pay">
                    Confirm & Book Ride Now
                </button>
            </div>
        `;
    },

    /**
     * Renders Success / Confirmation Screen
     */
    renderSuccessScreen(bookingData, bookingObj) {
        const b = bookingObj || { id: 'TRQ-BK-' + Math.floor(1000 + Math.random() * 9000) };
        
        return `
            <div class="glass-card form-card fade-in-slide" style="text-align: center; padding: 36px 24px;">
                ${typeof UIComponents !== 'undefined' ? UIComponents.renderSuccessCheckmark() : '✅'}
                <h2 style="font-size: 22px; font-weight: 800; color: var(--clr-text-main); margin-top:12px; margin-bottom: 6px;">Booking Confirmation</h2>
                <p style="font-size: 13px; color: var(--clr-text-light); margin-bottom: 24px;">Your ride request has been confirmed successfully!</p>
                
                <div style="background: rgba(15, 23, 42, 0.03); border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 16px; padding: 20px; text-align: left; margin-bottom: 24px; font-size: 13px; line-height: 1.8;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:8px; margin-bottom:8px;">
                        <span>Booking ID:</span><strong style="color:#16C15D; font-weight:800;">${b.id}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>Pickup:</span><strong>${bookingData.pickup}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>Destination Stop:</span><strong>${bookingData.destination}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>Schedule:</span><strong>${bookingData.time || '09:00 AM'}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span>Status:</span><strong style="color:#3B82F6;">Driver Assignment Pending</strong>
                    </div>
                </div>

                <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                    <a href="ride-details.html?id=${b.id}" class="btn-redesign-primary" style="display:inline-flex; align-items:center; gap:8px; padding: 12px 20px; font-size: 14px; text-decoration:none;">
                        View Ride Details
                    </a>
                    <a href="dashboard.html" style="display:inline-flex; align-items:center; gap:8px; padding: 12px 20px; border-radius:12px; background:rgba(0,0,0,0.06); font-weight:600; font-size:14px; color:var(--clr-text-main); text-decoration:none;">
                        Dashboard
                    </a>
                </div>
            </div>
        `;
    }
};
