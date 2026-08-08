/**
 * TORQQ Shared Mobility - Notification Center Service API Interface
 */

const notificationService = (() => {
    function getDelay() { return 300; }

    async function getNotifications() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const notifications = TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.notifications : [];
                resolve({ success: true, count: notifications.length, data: notifications });
            }, getDelay());
        });
    }

    async function markAsRead(notificationId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (TORQQ_MOCK_DATA) {
                    const item = TORQQ_MOCK_DATA.notifications.find(n => n.id === notificationId);
                    if (item) item.read = true;
                }
                resolve({ success: true, notificationId });
            }, getDelay());
        });
    }

    async function markAllAsRead() {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (TORQQ_MOCK_DATA) {
                    TORQQ_MOCK_DATA.notifications.forEach(n => n.read = true);
                }
                resolve({ success: true, message: 'All notifications marked as read' });
            }, getDelay());
        });
    }

    return {
        getNotifications,
        markAsRead,
        markAllAsRead
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = notificationService;
}
