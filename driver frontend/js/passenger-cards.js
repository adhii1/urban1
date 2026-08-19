// Unified driver passenger projection for scheduled trips and ShuttleSessions.
// Server acknowledgements are authoritative; this client never advances lifecycle optimistically.
(function () {
    const lifecycleActionLabels = {
        VERIFY_PICKUP_OTP: 'Verify pickup OTP',
        COMPLETE_DROP: 'Complete drop',
        BOARD_SCHEDULED_PASSENGER: 'Board scheduled passenger',
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
            passengerName: raw.passengerName || raw.customerName || raw.name || raw.customer?.name || 'Passenger',
            pickup: addressOf(raw.pickup || raw.pickupLocation || raw.pickupStop),
            drop: addressOf(raw.drop || raw.dropLocation || raw.dropStop),
            lifecycle,
            permittedAction,
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

        cardMarkup(passenger) {
            const isRide = Boolean(passenger.rideRequestId);
            const identifierLabel = isRide ? 'Ride ID' : 'Trip ID';
            const identifier = isRide ? passenger.rideRequestId : passenger.tripId;
            const action = lifecycleActionLabels[passenger.permittedAction] || passenger.permittedAction.replaceAll('_', ' ');
            const canAct = ['VERIFY_PICKUP_OTP', 'COMPLETE_DROP'].includes(passenger.permittedAction) &&
                passenger.shuttleSessionId && passenger.rideRequestId;
            return `
                <article class="glass-card" data-passenger-card-id="${escapeHtml(passenger.passengerId)}" style="padding:14px;border:1px solid var(--border-color);font-size:12px;">
                    <div class="flex-between" style="gap:12px;margin-bottom:10px;">
                        <strong style="font-size:14px;color:var(--text-main);">${escapeHtml(passenger.passengerName)}</strong>
                        <span class="badge ${passenger.lifecycle === 'DROPPED' ? 'badge-success' : passenger.lifecycle === 'BOARDED' ? 'badge-info' : 'badge-warning'}">${escapeHtml(passenger.lifecycle)}</span>
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

        handleAction(event) {
            const button = event.target.closest('[data-passenger-action]');
            if (!button) return;
            const passenger = this.passengers.get(button.dataset.passengerId);
            if (!passenger || !window.SOCKET) return;
            if (passenger.permittedAction === 'VERIFY_PICKUP_OTP') {
                const otp = window.prompt(`Enter OTP for ${passenger.passengerName}`);
                if (!otp) return;
                window.SOCKET.emit('driver:shuttle:pickup-verify', {
                    shuttleSessionId: passenger.shuttleSessionId,
                    rideRequestId: passenger.rideRequestId,
                    otp: otp.trim()
                });
            } else if (passenger.permittedAction === 'COMPLETE_DROP') {
                window.SOCKET.emit('driver:shuttle:complete-drop', {
                    shuttleSessionId: passenger.shuttleSessionId,
                    rideRequestId: passenger.rideRequestId
                });
            }
        }
    }

    window.DRIVER_PASSENGER_CARDS = new DriverPassengerCards();
    document.addEventListener('DOMContentLoaded', () => window.DRIVER_PASSENGER_CARDS.init());
})();
