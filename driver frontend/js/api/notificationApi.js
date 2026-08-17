// TORQQ Driver Notifications API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return token
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

// Transform backend Notification documents into the shape the frontend UI expects
function transformNotification(n) {
    let type = 'system';
    switch (n.type) {
        case 'RIDE': type = 'info'; break;
        case 'PAYMENT': type = 'payout'; break;
        case 'SUBSCRIPTION': type = 'info'; break;
        case 'PROMO': type = 'promotion'; break;
        case 'ALERT': type = 'emergency'; break;
        default: type = 'system';
    }
    return {
        id: n._id || n.id,
        title: n.title,
        message: n.body || '',
        type,
        read: !!n.isRead,
        time: n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    };
}

const NOTIFICATION_API = {
    getNotifications: () => {
        console.log("🔌 [API] Calling GET /api/v1/notifications");
        return fetch(`${API_BASE_URL}/notifications`, {
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
                const notifications = (data.data || []).map(transformNotification);
                if (window.STATE) {
                    window.STATE.setState('notifications', notifications);
                }
                return { success: true, notifications };
            } else {
                throw new Error(data.message || 'Notifications fetch failed.');
            }
        });
    },

    markAsRead: (id) => {
        console.log(`🔌 [API] Calling PUT /api/v1/notifications/read for id: ${id}`);
        return fetch(`${API_BASE_URL}/notifications/read`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include",
            body: JSON.stringify({ ids: [id] })
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
        console.log(`🔌 [API] Calling DELETE /api/v1/notifications/${id}`);
        return fetch(`${API_BASE_URL}/notifications/${id}`, {
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
        console.log("🔌 [API] Calling PUT /api/v1/notifications/read (all)");
        return fetch(`${API_BASE_URL}/notifications/read`, {
            method: 'PUT',
            headers: getAuthHeaders(), credentials: "include",
            body: JSON.stringify({})
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
