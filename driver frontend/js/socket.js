// TORQQ Driver Real-Time WebSocket Client
// Connects to live backend Socket.IO namespaces

class SocketBroker {
    constructor() {
        this.listeners = {};
        this.connected = false;
        this.socket = null;
        
        // Dynamically load Socket.IO client script if not already present
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            script.onload = () => this.initSocket();
            document.head.appendChild(script);
        } else {
            this.initSocket();
        }
    }

    initSocket() {
        // Only connect if online status is ONLINE
        window.addEventListener('stateChanged_onlineStatus', (e) => {
            const status = e.detail;
            if (status === 'ONLINE') {
                this.connect();
            } else {
                this.disconnect();
            }
        });

        if (window.STATE && window.STATE.getState('onlineStatus') === 'ONLINE') {
            this.connect();
        }
    }

    connect() {
        if (this.connected || typeof io === 'undefined') return;

        const userId = localStorage.getItem('driverUserId');
        const token = localStorage.getItem('driverToken');
        if (!userId) {
            console.warn("⚠️ [Socket] Cannot connect: driverUserId not found in localStorage.");
            return;
        }

        console.log(`🔌 [Socket] Connecting to namespace /sockets/driver with userId: ${userId}`);
        this.socket = io('http://localhost:4000/sockets/driver', {
            auth: { token, userId },
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            this.connected = true;
            console.log("🔌 [Socket] Connected to backend Socket.IO server.");
            this.triggerEvent('connect', { socketId: this.socket.id });
            this._goOnline();
            this._startLocationUpdates();
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            this._stopLocationUpdates();
            console.log("🔌 [Socket] Disconnected from backend Socket.IO server.");
            this.triggerEvent('disconnect', {});
        });

        this.socket.on('driver:error', (data) => {
            console.warn("⚠️ [Socket] driver:error", data);
            this.triggerEvent('driver:error', data);
        });

        // New ride/bundle offer pushed from BundleMatchingEngine / driverEvents.
        // (Backend event name is 'ride:new-request', NOT 'tripAssignment'.)
        this.socket.on('ride:new-request', (offer) => {
            console.log("📥 [Socket] Received ride offer:", offer);
            alert(`🚗 NEW RIDE REQUEST!\n\nPickup: ${offer.pickup?.address || 'Unknown'}\nDrop: ${offer.drop?.address || 'Unknown'}\nFare: ₹${offer.fareEstimate || 'N/A'}\nPassengers: ${offer.passengerCount || 1}\n\nGo to dashboard to accept!`);
            this.triggerEvent('ride:new-request', offer);
        });

        // Offer withdrawn (another driver accepted it, or it expired server-side).
        // (Backend event name is 'ride:unavailable', NOT 'cancelAssignment'.)
        this.socket.on('ride:unavailable', (data) => {
            console.log("📥 [Socket] Ride offer withdrawn:", data);
            const modal = document.getElementById('tripOfferModal');
            if (modal) modal.remove();
            if (window.UTILS && window.UTILS.showToast) {
                window.UTILS.showToast(data.message || "This ride is no longer available.", "info");
            }
            this.triggerEvent('ride:unavailable', data);
        });

        this.socket.on('ride:accept:ack', (data) => this.triggerEvent('ride:accept:ack', data));
        this.socket.on('ride:accept:error', (data) => this.triggerEvent('ride:accept:error', data));
        this.socket.on('ride:reject:ack', (data) => this.triggerEvent('ride:reject:ack', data));
        this.socket.on('ride:reject:error', (data) => this.triggerEvent('ride:reject:error', data));
        this.socket.on('ride:verify-otp:ack', (data) => this.triggerEvent('ride:verify-otp:ack', data));
        this.socket.on('ride:verify-otp:error', (data) => this.triggerEvent('ride:verify-otp:error', data));
        this.socket.on('ride:complete:ack', (data) => this.triggerEvent('ride:complete:ack', data));
        this.socket.on('ride:complete:error', (data) => this.triggerEvent('ride:complete:error', data));
        this.socket.on('driver:suspended', (data) => this.triggerEvent('driver:suspended', data));
    }

    // Tell the backend this driver is online + where they are. The backend
    // only starts matching/offering rides to a driver after it receives
    // 'driver:online' with a location — connecting the socket alone is not
    // enough, so this used to leave drivers "connected" but invisible to
    // the matching engine.
    _goOnline() {
        // Use Bangalore HSR Layout coordinates for demo (matching seed route locations)
        const DEMO_LOCATION = { latitude: 12.9279, longitude: 77.6309 };
        this.emit('driver:online', DEMO_LOCATION);
    }

    _startLocationUpdates() {
        this._stopLocationUpdates();
        // Send Bangalore HSR Layout coordinates for demo
        this._locationInterval = setInterval(() => {
            this.emit('driver:location', {
                latitude: 12.9279 + (Math.random() - 0.5) * 0.002,
                longitude: 77.6309 + (Math.random() - 0.5) * 0.002,
            });
        }, 10000);
    }

    _stopLocationUpdates() {
        if (this._locationInterval) {
            clearInterval(this._locationInterval);
            this._locationInterval = null;
        }
    }

    disconnect() {
        if (!this.connected || !this.socket) return;
        this.emit('driver:offline', {});
        this._stopLocationUpdates();
        this.socket.disconnect();
        this.connected = false;
        console.log("🔌 [Socket] Disconnected from WebSocket server");
        this.triggerEvent('disconnect', {});
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (this.socket && this.connected) {
            console.log(`📤 [Socket] Emitted to Server [${event}]:`, data);
            this.socket.emit(event, data);
        } else {
            console.warn("⚠️ [Socket] Cannot emit, socket not connected.");
        }
    }

    triggerEvent(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

window.SOCKET = new SocketBroker();
