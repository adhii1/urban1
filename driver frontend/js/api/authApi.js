// TORQQ Driver Authentication API Client (Connected to Backend)

var API_BASE_URL = (window.TORQQ_API_BASE || '/api/v1');

// `torqq_driver_data` is the cached profile that state.js seeds `currentDriver`
// from on every page load. It MUST be cleared with the session: it used to
// survive logout, so the next driver to sign in on the same browser saw the
// previous driver's name and rating in the sidebar until (and unless) a profile
// fetch replaced it.
const DRIVER_SESSION_KEYS = [
    'driverToken',
    'driverRefreshToken',
    'driverName',
    'driverPhone',
    'driverStatus',
    'driverUserId',
    'torqq_driver_online',
    'torqq_driver_data',
];

function clearDriverSession() {
    DRIVER_SESSION_KEYS.forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem('activeTrip');
}

function saveDriverSession(data) {
    const user = data?.user;
    if (!data?.accessToken || user?.role !== 'Driver') {
        clearDriverSession();
        throw new Error('This account is not registered as a driver. Please use the correct portal.');
    }

    // Drop whatever the previous session cached before writing this one, so no
    // field of the outgoing driver can survive into the incoming one.
    clearDriverSession();

    localStorage.setItem('driverToken', data.accessToken);
    localStorage.setItem('driverRefreshToken', data.refreshToken || '');
    localStorage.setItem('driverName', user.name);
    localStorage.setItem('driverPhone', user.phone);
    localStorage.setItem('driverStatus', user.status || 'ACTIVE');
    localStorage.setItem('driverUserId', user.id || user._id);
    return user;
}

const AUTH_API = {
    // Authenticate credentials against backend Driver Login endpoint
    login: (phone, password) => {
        console.log(`🔌 [API] Calling POST /api/v1/auth/login for: ${phone}`);
        return fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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
                const driver = saveDriverSession(data.data);

                // Seed the panel with what the login response actually returned.
                // GET /driver/profile fills in the rest (rating, vehicle, trips)
                // on the next page load; nothing here is invented.
                if (window.STATE) {
                    window.STATE.setState('currentDriver', {
                        id: driver.id || driver._id || '',
                        name: driver.name || '',
                        phone: driver.phone || '',
                        status: driver.status || 'ACTIVE',
                        rating: Number(driver.rating) || 0,
                        avatar: driver.avatar || '',
                        vehicle: driver.vehicle || { number: '', model: '' }
                    });
                }
                return { success: true, token: data.data.accessToken, driver };
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
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: driverData.phone, purpose: 'REGISTRATION' })
                })
                .then(r => r.json())
                .then((otpRes) => {
                    // In dev mode, OTP is returned in response
                    if (otpRes.data && otpRes.data.devOtp) {
                        console.log(`📱 [DEV] OTP Code: ${otpRes.data.devOtp}`);
                        alert(`DEV MODE - Your OTP: ${otpRes.data.devOtp}`);
                    }
                    return { success: true, message: data.message || "Registration successful!" };
                });
            } else {
                throw new Error(data.message || "Registration failed.");
            }
        });
    },

    // Verify OTP code during registration/sign-in flows
    verifyOTP: (phone, otp, purpose) => {
        const otpPurpose = purpose || sessionStorage.getItem('otp_purpose') || 'LOGIN';
        console.log(`🔌 [API] Calling POST /api/v1/auth/verify-otp for: ${phone} purpose: ${otpPurpose}`);
        return fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, purpose: otpPurpose })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'OTP verification failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (data.data?.accessToken) {
                    saveDriverSession(data.data);
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
            clearDriverSession();

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
