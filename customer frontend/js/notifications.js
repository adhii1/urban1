/**
 * TORQQ Customer Notifications Page
 * Displays alerts, marks notifications read, and supports soft-deleting.
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    const container = document.getElementById('notificationsContainer');
    const btnMarkAllRead = document.getElementById('btnMarkAllRead');

    await fetchNotifications();

    async function fetchNotifications() {
        if (!container) return;
        container.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 32px 0;">Loading notifications...</p>';

        try {
            const res = await CUSTOMER_API.getNotifications();
            if (res.success && res.data) {
                // Filter out soft deleted ones
                const list = res.data.filter(n => !n.isDeleted);

                if (list.length === 0) {
                    container.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 32px 0;">You have no notifications.</p>';
                    return;
                }

                let html = '';
                list.forEach(n => {
                    const dateStr = new Date(n.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    const isUnread = n.readStatus === 'UNREAD';
                    const unreadStyle = isUnread ? 'background: #f0fdf4; border-left: 4px solid var(--clr-primary-green);' : 'background: white;';
                    const dotHtml = isUnread ? '<span style="display:inline-block; width:8px; height:8px; background:var(--clr-primary-green); border-radius:50%; margin-left:6px;"></span>' : '';

                    html += `
                        <div class="card" style="border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-sm); position: relative; ${unreadStyle}">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <h4 style="font-size: 14px; color: var(--clr-dark-navy); margin-bottom: 4px; font-weight:600; display:flex; align-items:center;">
                                    ${n.title} ${dotHtml}
                                </h4>
                                <button class="btnDeleteNotification" data-id="${n._id}" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; font-weight: 500;">Delete</button>
                            </div>
                            <p style="font-size: 13px; color: var(--clr-text-main); margin-top: 4px;">${n.message}</p>
                            <span style="display: block; margin-top: 8px; font-size: 11px; color: var(--clr-text-light);">${dateStr}</span>
                        </div>
                    `;
                });
                container.innerHTML = html;

                // Bind deletes
                container.querySelectorAll('.btnDeleteNotification').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        try {
                            const delRes = await CUSTOMER_API.deleteNotification(id);
                            if (delRes.success) {
                                await fetchNotifications();
                            }
                        } catch (err) {
                            alert(`Failed to delete notification: ${err.message}`);
                        }
                    });
                });
            }
        } catch (err) {
            container.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 32px 0;">Failed to load notifications: ${err.message}</p>`;
        }
    }

    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener('click', async () => {
            try {
                const res = await CUSTOMER_API.markRead({ notificationIds: [] });
                if (res.success) {
                    await fetchNotifications();
                }
            } catch (err) {
                alert(`Error marking notifications as read: ${err.message}`);
            }
        });
    }
});
