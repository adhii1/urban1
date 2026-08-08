// TORQQ Driver Authentication API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

const AUTH_API = {
    // Authenticate credentials against backend Driver Login endpoint
    login: (phone, password) => {
        console.log(`🔌 [API] Calling POST /api/v1/auth/driver/login for: ${phone}`);
        return fetch(`${API_BASE_URL}/auth/driver/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Invalid credentials'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success && data.data) {
                localStorage.setItem('driverToken', data.data.accessToken);
                localStorage.setItem('driverRefreshToken', data.data.refreshToken);
                localStorage.setItem('driverName', data.data.user.name);
                localStorage.setItem('driverPhone', data.data.user.phone);
                localStorage.setItem('driverStatus', data.data.user.status);
                localStorage.setItem('driverUserId', data.data.user.id || data.data.user._id);
                
                // Set application state for driver panel UI
                if (window.STATE) {
                    window.STATE.setState('currentDriver', {
                        name: data.data.user.name,
                        phone: data.data.user.phone,
                        status: data.data.user.status,
                        rating: data.data.user.rating || 5.0,
                        avatar: data.data.user.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150",
                        vehicle: data.data.user.vehicle || { number: '', model: '' }
                    });
                }
                return { success: true, token: data.data.accessToken, driver: data.data.user };
            } else {
                throw new Error(data.message || 'Login failed.');
            }
        });
    },

    // Register partner driver details with backend Driver Register endpoint
    register: (driverData) => {
        console.log(`🔌 [API] Calling POST /api/v1/auth/driver/register`, driverData);
        return fetch(`${API_BASE_URL}/auth/driver/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: driverData.name,
                phone: driverData.phone,
                email: driverData.email,
                password: driverData.password,
                vehicleType: driverData.vehicle,
                dl: driverData.dl
            })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Registration failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                // Pre-generate/send OTP verification for the onboarding mobile number
                return fetch(`${API_BASE_URL}/auth/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: driverData.phone, purpose: 'REGISTRATION' })
                })
                .then(() => {
                    return { success: true, message: data.message || "Registration successful!" };
                });
            } else {
                throw new Error(data.message || "Registration failed.");
            }
        });
    },

    // Verify OTP code during registration/sign-in flows
    verifyOTP: (phone, otp) => {
        console.log(`🔌 [API] Calling POST /api/v1/auth/verify-otp for: ${phone}`);
        return fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, purpose: 'REGISTRATION' })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'OTP verification failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (data.data && data.data.accessToken) {
                    localStorage.setItem('driverToken', data.data.accessToken);
                    localStorage.setItem('driverRefreshToken', data.data.refreshToken);
                    localStorage.setItem('driverName', data.data.user.name);
                    localStorage.setItem('driverPhone', data.data.user.phone);
                    localStorage.setItem('driverStatus', data.data.user.status);
                    localStorage.setItem('driverUserId', data.data.user.id || data.data.user._id);
                }
                return { success: true, message: data.message || "OTP verified successfully!" };
            } else {
                throw new Error(data.message || "Incorrect OTP.");
            }
        });
    },

    // Initiate password recovery by sending reset token via SMS
    forgotPassword: (phone) => {
        console.log(`🔌 [API] Calling POST /api/v1/auth/forgot-password for: ${phone}`);
        return fetch(`${API_BASE_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Forgot password failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, message: data.message || "Reset OTP sent via SMS." };
            } else {
                throw new Error(data.message || "Failed to process forgot password request.");
            }
        });
    },

    // Session Route Protection checks
    checkAuthGuard: () => {
        const token = localStorage.getItem('driverToken');
        if (!token) {
            console.log("🔒 [AuthGuard] Driver token missing, redirecting to login...");
            
            const path = window.location.pathname;
            if (path.includes('/pages/')) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'pages/login.html';
            }
            return false;
        }
        return true;
    },

    // Revoke token and terminate session
    logout: () => {
        console.log("🔒 [AuthGuard] Logging out driver...");
        const token = localStorage.getItem('driverToken');
        const refreshToken = localStorage.getItem('driverRefreshToken');
        
        fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ refreshToken })
        }).finally(() => {
            localStorage.removeItem('driverToken');
            localStorage.removeItem('driverRefreshToken');
            localStorage.removeItem('driverName');
            localStorage.removeItem('driverPhone');
            localStorage.removeItem('driverStatus');
            localStorage.removeItem('torqq_driver_online');
            
            if (window.STATE) {
                window.STATE.setState('onlineStatus', 'OFFLINE');
            }
            
            const path = window.location.pathname;
            if (path.includes('/pages/')) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'pages/login.html';
            }
        });
    }
};

window.AUTH_API = AUTH_API;
