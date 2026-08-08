// TORQQ Driver Profile API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

const DRIVER_API = {
    getProfile: () => {
        console.log("🔌 [API] Calling GET /api/v1/driver/profile");
        return fetch(`${API_BASE_URL}/driver/profile`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include",
            credentials: 'include'
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
        console.log(`🔌 [API] Calling PUT /api/v1/drivers/duty to: ${dutyStatus}, available: ${available}`);
        return fetch(`${API_BASE_URL}/drivers/duty`, {
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
    }
};

window.DRIVER_API = DRIVER_API;
