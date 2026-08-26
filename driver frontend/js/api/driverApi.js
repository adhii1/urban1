// TORQQ Driver Profile API Client (Connected to Backend)

var API_BASE_URL = (window.TORQQ_API_BASE || '/api/v1');

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    if (!token) {
        // No driver token in localStorage — do NOT send a blank Authorization
        // header. Cookies are shared by domain across ports, so if another
        // role (admin/customer) logged in more recently in this browser, a
        // blank Bearer header would cause the backend to silently fall back
        // to that OTHER role's cookie, producing a confusing 403 error.
        // Force re-login instead.
        console.warn('[Auth] No driver token found — redirecting to login.');
        localStorage.setItem('driverAuthError', 'Session expired. Please log in again.');
        const path = window.location.pathname;
        window.location.href = path.includes('/pages/') ? 'login.html' : 'pages/login.html';
        throw new Error('No driver session. Redirecting to login.');
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

const DRIVER_API = {
    getProfile: () => {
        console.log("🔌 [API] Calling GET /api/v1/driver/profile");
        return fetch(`${API_BASE_URL}/driver/profile`, {
            method: 'GET',
            headers: getAuthHeaders(),
            credentials: 'include'
        })
        .then(async res => {
            if ((res.status === 401 || res.status === 403) && window.refreshDriverSession) {
                const refreshed = await window.refreshDriverSession();
                if (refreshed) {
                    return fetch(`${API_BASE_URL}/driver/profile`, {
                        method: 'GET',
                        headers: getAuthHeaders(),
                        credentials: 'include'
                    });
                }
            }
            return res;
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch profile'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (data.data.userId) {
                    localStorage.setItem('driverUserId', data.data.userId);
                    if (window.SOCKET && window.STATE && window.STATE.getState('onlineStatus') === 'ONLINE') {
                        window.SOCKET.connect();
                    }
                }
                if (window.STATE) {
                    window.STATE.setState('currentDriver', data.data);
                }
                return { success: true, driver: data.data };
            } else {
                throw new Error(data.message || 'Profile fetch failed.');
            }
        });
    },

    updateProfile: (profileData) => {
        console.log("🔌 [API] Calling PUT /api/v1/driver/profile", profileData);
        return fetch(`${API_BASE_URL}/driver/profile`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include",
            credentials: 'include',
            body: JSON.stringify(profileData)
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Profile update failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (window.STATE) {
                    window.STATE.setState('currentDriver', data.data);
                }
                return { success: true, message: data.message || "Profile updated successfully!", driver: data.data };
            } else {
                throw new Error(data.message || 'Profile update failed.');
            }
        });
    },

    uploadDocument: (docType, fileName) => {
        console.log(`🔌 [API] Calling POST /api/v1/driver/documents/upload for type: ${docType}`);
        const token = localStorage.getItem('driverToken');
        const formData = new FormData();
        formData.append('documentType', docType);
        
        const blob = new Blob(["Simulated Document content"], { type: "text/plain" });
        formData.append('document', blob, fileName || 'doc.pdf');

        return fetch(`${API_BASE_URL}/driver/documents/upload`, {
            method: 'POST',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
            },
            credentials: 'include',
            body: formData
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Document upload failed'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { 
                    success: true, 
                    message: data.message || `${docType} uploaded successfully and sent for verification.`,
                    document: data.data
                };
            } else {
                throw new Error(data.message || 'Document upload failed.');
            }
        });
    },

    getAnalytics: () => {
        console.log("🔌 [API] Calling GET /api/v1/driver/earnings");
        return fetch(`${API_BASE_URL}/driver/earnings`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include",
            credentials: 'include'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch analytics'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, analytics: data.data };
            } else {
                throw new Error(data.message || 'Analytics fetch failed.');
            }
        });
    },

    updateDutyStatus: (dutyStatus, available) => {
        console.log(`🔌 [API] Calling PUT /api/v1/driver/duty to: ${dutyStatus}, available: ${available}`);
        return fetch(`${API_BASE_URL}/driver/duty`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include",
            body: JSON.stringify({ dutyStatus, available })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to update duty status'); });
            }
            return res.json();
        });
    },

    getRatingSummary: () => {
        console.log("🔌 [API] Calling GET /api/v1/driver/ratings/summary");
        return fetch(`${API_BASE_URL}/driver/ratings/summary`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch rating summary'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, summary: data.data };
            } else {
                throw new Error(data.message || 'Rating summary fetch failed.');
            }
        });
    },

    getRatings: (page = 1, limit = 20) => {
        console.log("🔌 [API] Calling GET /api/v1/driver/ratings");
        return fetch(`${API_BASE_URL}/driver/ratings?page=${page}&limit=${limit}`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch ratings'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return { success: true, ratings: data.data.ratings || [], pagination: data.data.pagination };
            } else {
                throw new Error(data.message || 'Ratings fetch failed.');
            }
        });
    }
};

window.DRIVER_API = DRIVER_API;
