// Unified driver passenger projection for scheduled trips and ShuttleSessions.
// Server acknowledgements are authoritative; this client never advances lifecycle optimistically.
(function () {
    const lifecycleActionLabels = {
        VERIFY_PICKUP_OTP: 'Verify boarding code',
        COMPLETE_DROP: 'Complete drop',
        BOARD_SCHEDULED_PASSENGER: 'Confirm boarded',
        NONE: 'No action permitted'
    };

    function idOf(value) {
        return value && typeof value === 'object' ? String(value._id || value.id || '') : String(value || '');
    }

    function addressOf(location) {
        if (typeof location === 'string') return location;
        return location?.stopName || location?.address || location?.location?.address || 'Not provided';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    }

    function normalizePassenger(raw, context = {}) {
        // `_id` identifies a RideRequest only when the server explicitly
        // projects a shuttle passenger. Manifest `_id`s are entry identities,
        // so scheduled passengers retain their Trip ID label and never emit
        // shuttle lifecycle commands.
        const rideRequestId = idOf(raw.rideRequestId || raw.rideId);
        const customerId = idOf(raw.passengerId || raw.customerId || raw.customer?._id || raw.customer?.id || raw.id);
        const manifestEntryId = idOf(raw.manifestEntryId || raw.manifestId || (!rideRequestId && (raw.subscriptionId || raw.pickupStop || raw.dropStop) ? raw._id : ''));
        const passengerId = rideRequestId || manifestEntryId || customerId;
        if (!passengerId) return null;

        const shuttleSessionId = idOf(raw.shuttleSessionId || context.shuttleSessionId);
        const tripId = idOf(raw.tripId || context.tripId);
        const lifecycle = raw.lifecycle || raw.passengerLifecycle || raw.status || 'PENDING';
        const permittedAction = raw.permittedAction || (
            shuttleSessionId && lifecycle === 'PENDING' ? 'VERIFY_PICKUP_OTP' :
            shuttleSessionId && lifecycle === 'BOARDED' ? 'COMPLETE_DROP' : 'NONE'
        );

        return {
            passengerId,
            rideRequestId,
            tripId,
            shuttleSessionId,
            customerId,
            // null, not 'Passenger'. A generic default is indistinguishable from
            // a real name once rendered, which is how a manifest with missing
            // identities looked like a vehicle full of the same person.
            passengerName: window.UTILS?.riderName?.(raw, null) || null,
            passengerPhone: window.UTILS?.riderPhone?.(raw) || '',
            pickup: addressOf(raw.pickup || raw.pickupLocation || raw.pickupStop),
            drop: addressOf(raw.drop || raw.dropLocation || raw.dropStop),
            lifecycle,
            permittedAction,
            // Present for scheduled trips so the card can offer OTP boarding.
            otpVerified: Boolean(raw.otp?.verified),
            boardedAt: raw.boardedAt || raw.pickupAt || null,
            droppedAt: raw.droppedAt || raw.completedAt || null
        };
    }

    class DriverPassengerCards {
        constructor() {
            this.assignment = { tripId: '', shuttleSessionId: '' };
            this.passengers = new Map();
            this.ready = false;
        }

        init() {
            if (this.ready) return;
            this.ready = true;
            this.hydrateCurrentTrip();
            window.STATE?.subscribe('currentTrip', (trip) => {
                if (trip) this.hydrateCurrentTrip(trip);
            });
            window.SOCKET?.on('driver:assignment', (ack) => this.applyAcknowledgement(ack));
            window.SOCKET?.on('driver:shuttle:accept:ack', (ack) => this.applyAcknowledgement(ack));
            window.SOCKET?.on('ride:accept:ack', (ack) => this.applyAcknowledgement(ack));
            window.SOCKET?.on('driver:shuttle:pickup-verify:ack', (ack) => this.applyAcknowledgement(ack));
            window.SOCKET?.on('driver:shuttle:complete-drop:ack', (ack) => this.applyAcknowledgement(ack));
            window.SOCKET?.on('driver:shuttle:pickup-verify:error', (error) => this.showLifecycleError(error));
            window.SOCKET?.on('driver:shuttle:complete-drop:error', (error) => this.showLifecycleError(error));
            document.addEventListener('click', (event) => this.handleAction(event));
            this.render();
        }

        hydrateCurrentTrip(trip = window.STATE?.getState('currentTrip')) {
            if (!trip || !Array.isArray(trip.passengers) || trip.passengers.length === 0) return;
            this.setAssignment({
                tripId: trip.tripId || trip.id,
                shuttleSessionId: trip.shuttleSessionId,
                passengers: trip.passengers
            });
        }

        setAssignment(payload = {}) {
            const context = {
                tripId: idOf(payload.tripId || payload.trip?._id || payload.trip?.id),
                shuttleSessionId: idOf(payload.shuttleSessionId || payload.shuttleSession?._id || payload.shuttle?._id)
            };
            const changesAssignment = (context.tripId && context.tripId !== this.assignment.tripId) ||
                (context.shuttleSessionId && context.shuttleSessionId !== this.assignment.shuttleSessionId);
            if (changesAssignment) this.passengers.clear();
            this.assignment = { ...this.assignment, ...context };
            for (const raw of payload.passengers || payload.manifest || []) this.upsert(raw, context);
            this.publish();
        }

        applyAcknowledgement(ack = {}) {
            if (!ack.success) return;
            const context = {
                tripId: idOf(ack.tripId || ack.trip?._id || ack.trip?.id),
                shuttleSessionId: idOf(ack.shuttleSessionId || ack.shuttleSession?._id || ack.shuttle?._id)
            };
            const updates = [...(Array.isArray(ack.passengers) ? ack.passengers : []), ...(ack.passenger ? [ack.passenger] : [])];
            if (updates.length === 0) return;
            if ((context.tripId && context.tripId !== this.assignment.tripId) ||
                (context.shuttleSessionId && context.shuttleSessionId !== this.assignment.shuttleSessionId)) {
                this.passengers.clear();
            }
            this.assignment = { ...this.assignment, ...context };
            // Each acknowledgement is merged by its explicit passenger/ride identifier.
            // No list position or inferred “next passenger” can update lifecycle state.
            for (const raw of updates) this.upsert(raw, context);
            this.publish();
        }

        showLifecycleError(error = {}) {
            // Errors deliberately leave the local projection unchanged; the
            // next server acknowledgement remains the only lifecycle update.
            window.UTILS?.showToast?.(error.message || 'Passenger action was not permitted.', 'error');
        }

        upsert(raw, context) {
            const passenger = normalizePassenger(raw, { ...this.assignment, ...context });
            if (!passenger) return;
            const existing = this.passengers.get(passenger.passengerId) || {};
            this.passengers.set(passenger.passengerId, { ...existing, ...passenger });
        }

        publish() {
            const value = this.getPassengers();
            window.STATE?.setState('driverPassengerCards', value);
            this.render();
        }

        getPassengers() {
            return Array.from(this.passengers.values());
        }

        render() {
            const containers = document.querySelectorAll('[data-driver-passenger-cards]');
            if (containers.length === 0) return;
            const passengers = this.getPassengers();
            const markup = passengers.length === 0
                ? '<div style="padding:14px;color:var(--text-light);font-size:12px;">No passenger assignment is active.</div>'
                : passengers.map((passenger) => this.cardMarkup(passenger)).join('');
            containers.forEach((container) => {
                container.innerHTML = markup;
                if (window.lucide?.createIcons) window.lucide.createIcons();
            });
        }

        /**
         * How a rider's permitted action can actually be executed.
         *
         *  'shuttle'   — over the socket, keyed on shuttleSessionId + rideRequestId.
         *  'scheduled' — over REST against the trip manifest, keyed on customerId.
         *  null        — not actionable right now.
         */
        channelFor(passenger) {
            if (!['VERIFY_PICKUP_OTP', 'COMPLETE_DROP', 'BOARD_SCHEDULED_PASSENGER'].includes(passenger.permittedAction)) {
                return null;
            }
            if (passenger.shuttleSessionId && passenger.rideRequestId) return 'shuttle';
            if (passenger.tripId && passenger.customerId) return 'scheduled';
            return null;
        }

        cardMarkup(passenger) {
            const isRide = Boolean(passenger.rideRequestId);
            const identifierLabel = isRide ? 'Ride ID' : 'Trip ID';
            const identifier = isRide ? passenger.rideRequestId : passenger.tripId;
            const action = lifecycleActionLabels[passenger.permittedAction] || passenger.permittedAction.replaceAll('_', ' ');
            const canAct = Boolean(this.channelFor(passenger));

            // A missing name is stated as missing. Rendering a generic
            // "Passenger" here is what made every rider on every trip look like
            // the same anonymous person.
            const name = passenger.passengerName;
            const nameMarkup = name
                ? `<strong style="font-size:14px;color:var(--text-main);">${escapeHtml(name)}</strong>`
                : '<em style="font-size:13px;color:var(--text-light);font-style:normal;">Passenger details unavailable</em>';

            const settled = ['DROPPED', 'COMPLETED'].includes(passenger.lifecycle);
            const onBoard = ['BOARDED', 'RIDE_STARTED', 'DROPPING_OFF', 'OTP_VERIFIED'].includes(passenger.lifecycle);

            return `
                <article class="glass-card" data-passenger-card-id="${escapeHtml(passenger.passengerId)}" style="padding:14px;border:1px solid var(--border-color);font-size:12px;">
                    <div class="flex-between" style="gap:12px;margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                            <img src="${escapeHtml(window.UTILS.initialsAvatar(name || '', 64))}" alt="" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;">
                            <div style="min-width:0;">
                                ${nameMarkup}
                                ${passenger.passengerPhone
                                    ? `<a href="tel:${escapeHtml(String(passenger.passengerPhone).replace(/[^\d+]/g, ''))}" style="display:block;font-size:11px;color:var(--color-primary);text-decoration:none;">${escapeHtml(passenger.passengerPhone)}</a>`
                                    : '<span style="display:block;font-size:11px;color:var(--text-light);">No contact number</span>'}
                            </div>
                        </div>
                        <span class="badge ${settled ? 'badge-success' : onBoard ? 'badge-info' : 'badge-warning'}">${escapeHtml(passenger.lifecycle)}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 10px;color:var(--text-light);">
                        <span>${identifierLabel}</span><strong style="color:var(--text-main);overflow-wrap:anywhere;">${escapeHtml(identifier || 'Pending assignment')}</strong>
                        <span>Pickup</span><span>${escapeHtml(passenger.pickup)}</span>
                        <span>Drop</span><span>${escapeHtml(passenger.drop)}</span>
                        <span>Permitted action</span><strong style="color:var(--text-main);">${escapeHtml(action)}</strong>
                    </div>
                    ${canAct ? `<button class="btn btn-primary btn-sm" data-passenger-action="${escapeHtml(passenger.permittedAction)}" data-passenger-id="${escapeHtml(passenger.passengerId)}" style="margin-top:12px;margin-left:auto;">${escapeHtml(action)}</button>` : ''}
                </article>`;
        }

        /**
         * Ask the driver for the boarding code the customer is shown in their own
         * app. Returns null when the driver cancels or types nothing usable.
         */
        promptForOtp(passenger) {
            const who = passenger.passengerName || 'this passenger';
            const entered = window.prompt(`Ask ${who} for their 6-digit boarding code:`);
            if (entered === null) return null;
            const otp = entered.replace(/\D/g, '');
            if (!otp) {
                window.UTILS?.showToast?.('Enter the numeric boarding code shown in the passenger\'s app.', 'warning');
                return null;
            }
            return otp;
        }

        handleAction(event) {
            const button = event.target.closest('[data-passenger-action]');
            if (!button) return;
            const passenger = this.passengers.get(button.dataset.passengerId);
            if (!passenger) return;

            const channel = this.channelFor(passenger);
            if (!channel) return;

            if (channel === 'shuttle') {
                if (!window.SOCKET) return;
                if (passenger.permittedAction === 'VERIFY_PICKUP_OTP') {
                    const otp = this.promptForOtp(passenger);
                    if (!otp) return;
                    window.SOCKET.emit('driver:shuttle:pickup-verify', {
                        shuttleSessionId: passenger.shuttleSessionId,
                        rideRequestId: passenger.rideRequestId,
                        otp
                    });
                } else if (passenger.permittedAction === 'COMPLETE_DROP') {
                    window.SOCKET.emit('driver:shuttle:complete-drop', {
                        shuttleSessionId: passenger.shuttleSessionId,
                        rideRequestId: passenger.rideRequestId
                    });
                }
                return;
            }

            // Scheduled trip: the manifest endpoint is authoritative and returns
            // the updated trip, so the projection is refreshed from the response
            // rather than advanced optimistically.
            this.runScheduledAction(passenger, button);
        }

        runScheduledAction(passenger, button) {
            if (!window.TRIP_API?.updatePassengerStatus) return;

            const actionToEndpoint = {
                VERIFY_PICKUP_OTP: 'verify-otp',
                BOARD_SCHEDULED_PASSENGER: 'board',
                COMPLETE_DROP: 'drop'
            };
            const endpoint = actionToEndpoint[passenger.permittedAction];
            if (!endpoint) return;

            let otp;
            if (endpoint === 'verify-otp') {
                otp = this.promptForOtp(passenger);
                if (!otp) return;
            }

            button.disabled = true;
            const restore = () => { button.disabled = false; };

            window.TRIP_API.updatePassengerStatus(passenger.tripId, passenger.customerId, endpoint, otp)
                .then((result) => {
                    window.UTILS?.showToast?.(result.message || 'Passenger updated.', 'success');
                    // setState('currentTrip') inside the API client re-hydrates
                    // these cards from the server's response.
                })
                .catch((error) => {
                    restore();
                    this.showLifecycleError(error);
                });
        }
    }

    window.DRIVER_PASSENGER_CARDS = new DriverPassengerCards();
    document.addEventListener('DOMContentLoaded', () => window.DRIVER_PASSENGER_CARDS.init());
})();
