/**
 * TORQQ Customer Real-Time Ride Socket
 * Connects to backend Socket.IO for live ride booking, tracking, and status updates
 */

const RIDE_SOCKET = (() => {
    let socket = null;
    let connected = false;
    const listeners = {};

    function connect() {
        if (connected || socket) return;
        
        const token = localStorage.getItem('accessToken');
        const userId = localStorage.getItem('userId');
        if (!token || !userId) {
            console.warn('[RideSocket] No token/userId — cannot connect');
            return;
        }

        // Load Socket.IO client if not already loaded
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            script.onload = () => initSocket(token, userId);
            document.head.appendChild(script);
        } else {
            initSocket(token, userId);
        }
    }

    function initSocket(token, userId) {
        const WS_URL = (window.TORQQ_ENV ? window.TORQQ_ENV.current.baseUrl : 'http://localhost:4000/api/v1').replace('/api/v1', '');
        
        socket = io(`${WS_URL}/sockets/customer`, {
            auth: { token, userId },
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
            connected = true;
            console.log('🔌 [RideSocket] Connected');
            trigger('connected', {});
        });

        socket.on('disconnect', () => {
            connected = false;
            console.log('🔌 [RideSocket] Disconnected');
            trigger('disconnected', {});
        });

        // Ride lifecycle events
        socket.on('ride:request:ack', (data) => {
            console.log('✅ [RideSocket] Ride created:', data);
            trigger('ride:request:ack', data);
        });

        socket.on('ride:request:error', (data) => {
            console.log('❌ [RideSocket] Ride error:', data);
            trigger('ride:request:error', data);
        });

        socket.on('ride:accepted', (data) => {
            console.log('✅ [RideSocket] Driver accepted:', data);
            trigger('ride:accepted', data);
            if (typeof UIComponents !== 'undefined' && UIComponents.showToast) {
                UIComponents.showToast(`Driver ${data.driver?.name} accepted your ride! OTP: ${data.otp}`, 'success');
            }
        });

        socket.on('ride:driver-arriving', (data) => {
            console.log('🚗 [RideSocket] Driver arriving:', data);
            trigger('ride:driver-arriving', data);
        });

        socket.on('ride:started', (data) => {
            console.log('🚗 [RideSocket] Ride started:', data);
            trigger('ride:started', data);
            if (typeof UIComponents !== 'undefined' && UIComponents.showToast) {
                UIComponents.showToast('Ride started! Enjoy your trip.', 'success');
            }
        });

        socket.on('ride:completed', (data) => {
            console.log('✅ [RideSocket] Ride completed:', data);
            trigger('ride:completed', data);
            if (typeof UIComponents !== 'undefined' && UIComponents.showToast) {
                UIComponents.showToast(`Ride completed! Fare: ₹${data.fare?.final || 'N/A'}`, 'success');
            }
        });

        socket.on('ride:cancelled', (data) => {
            console.log('❌ [RideSocket] Ride cancelled:', data);
            trigger('ride:cancelled', data);
        });

        socket.on('driver:location:update', (data) => {
            trigger('driver:location:update', data);
        });

        socket.on('ride:expired', (data) => {
            console.log('⏰ [RideSocket] Ride expired:', data);
            trigger('ride:expired', data);
            if (typeof UIComponents !== 'undefined' && UIComponents.showToast) {
                UIComponents.showToast('No drivers available. Please try again.', 'warning');
            }
        });
    }

    function requestRide(pickup, drop, scheduledPickupTime) {
        if (!socket || !connected) {
            console.warn('[RideSocket] Not connected — connecting now...');
            connect();
            // Retry after connection
            setTimeout(() => requestRide(pickup, drop, scheduledPickupTime), 2000);
            return;
        }

        const payload = { pickup, drop };
        if (scheduledPickupTime) payload.scheduledPickupTime = scheduledPickupTime;
        
        console.log('📤 [RideSocket] Requesting ride:', payload);
        socket.emit('ride:request', payload);
    }

    function cancelRide(rideRequestId, reason) {
        if (!socket || !connected) return;
        socket.emit('ride:cancel', { rideRequestId, reason });
    }

    function on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
    }

    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }

    function trigger(event, data) {
        if (listeners[event]) {
            listeners[event].forEach(cb => cb(data));
        }
    }

    function disconnect() {
        if (socket) { socket.disconnect(); socket = null; connected = false; }
    }

    return { connect, disconnect, requestRide, cancelRide, on, off, isConnected: () => connected };
})();

// Auto-connect when logged in
if (localStorage.getItem('isLoggedIn') === 'true') {
    RIDE_SOCKET.connect();
}

window.RIDE_SOCKET = RIDE_SOCKET;
