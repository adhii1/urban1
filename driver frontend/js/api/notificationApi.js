// TORQQ Driver Notifications API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

const NOTIFICATION_API = {
    getNotifications: () => {
        console.log("🔌 [API] Calling GET /api/v1/drivers/notifications");
        return fetch(`${API_BASE_URL}/drivers/notifications`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch notifications'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (window.STATE) {
                    window.STATE.setState('notifications', data.data);
                }
                return { success: true, notifications: data.data };
            } else {
                throw new Error(data.message || 'Notifications fetch failed.');
            }
        });
    },

    markAsRead: (id) => {
        console.log(`🔌 [API] Calling PUT /api/v1/drivers/notifications/${id}/read`);
        return fetch(`${API_BASE_URL}/drivers/notifications/${id}/read`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to mark notification read'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return NOTIFICATION_API.getNotifications().then(() => {
                    return { success: true, message: "Notification marked as read." };
                });
            } else {
                throw new Error(data.message || 'Failed to update read status.');
            }
        });
    },

    deleteNotification: (id) => {
        console.log(`🔌 [API] Calling DELETE /api/v1/drivers/notifications/${id}`);
        return fetch(`${API_BASE_URL}/drivers/notifications/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to delete notification'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return NOTIFICATION_API.getNotifications().then(() => {
                    return { success: true, message: "Notification deleted." };
                });
            } else {
                throw new Error(data.message || 'Failed to delete notification.');
            }
        });
    },

    markAllRead: () => {
        console.log("🔌 [API] Calling POST /api/v1/drivers/notifications/read-all");
        return fetch(`${API_BASE_URL}/drivers/notifications/read-all`, {
            method: 'POST',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to mark all notifications read'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return NOTIFICATION_API.getNotifications().then(() => {
                    return { success: true, message: "All notifications marked as read." };
                });
            } else {
                throw new Error(data.message || 'Failed to update status.');
            }
        });
    }
};

window.NOTIFICATION_API = NOTIFICATION_API;
