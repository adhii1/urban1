// TORQQ Driver Notification Page Controller
// Coordinates reads, deletes, filter switches, search queries, and dynamic counts update

let activeNotifications = [];
let notificationFilter = 'ALL'; // ALL, UNREAD, PROMO, EMERGENCY

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('notificationsListWrap')) return;

    // Fetch initial list
    window.NOTIFICATION_API.getNotifications()
        .then(res => {
            activeNotifications = res.notifications;
            renderNotifications();
            setupNotificationsListeners();
        });
});

// Render list
function renderNotifications() {
    const listWrap = document.getElementById('notificationsListWrap');
    if (!listWrap) return;

    let list = activeNotifications;

    // Apply Filter
    if (notificationFilter === 'UNREAD') {
        list = activeNotifications.filter(n => !n.read);
    } else if (notificationFilter === 'PROMO') {
        list = activeNotifications.filter(n => n.type === 'promotion');
    } else if (notificationFilter === 'EMERGENCY') {
        list = activeNotifications.filter(n => n.type === 'emergency');
    }

    if (list.length === 0) {
        listWrap.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-light);">
                <i class="lucide-bell-ring" style="font-size: 40px; color: var(--text-light); margin-bottom: 12px; display: inline-flex;"></i>
                <div style="font-weight: 700; font-size: 16px; color: var(--text-main);">No Notifications</div>
                <div style="font-size: 13px; margin-top: 4px;">You are completely caught up!</div>
            </div>
        `;
        return;
    }

    listWrap.innerHTML = list.map(n => {
        let borderAccent = 'rgba(15, 23, 42, 0.08)';
        let typeBadge = 'badge-info';
        if (n.type === 'payout') {
            borderAccent = '#16C15D';
            typeBadge = 'badge-success';
        } else if (n.type === 'emergency') {
            borderAccent = '#EF4444';
            typeBadge = 'badge-danger';
        } else if (n.type === 'document') {
            borderAccent = '#F59E0B';
            typeBadge = 'badge-warning';
        }

        const opacity = n.read ? '0.7' : '1';
        const cardBg = n.read ? 'var(--bg-app)' : 'var(--bg-card-solid)';

        return `
            <div class="glass-card fade-in" style="
                padding: 16px 20px;
                margin-bottom: 12px;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                border-left: 4px solid ${borderAccent};
                opacity: ${opacity};
                background: ${cardBg};
                transition:none; transform:none; box-shadow:none;
            ">
                <div style="flex-grow: 1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <span class="badge ${typeBadge}" style="font-size:9px; padding:2px 6px;">${n.type}</span>
                        <strong style="font-size: 14px; color: var(--text-main);">${n.title}</strong>
                        ${!n.read ? '<span style="width:8px; height:8px; border-radius:50%; background:#EF4444;" class="online-pulse"></span>' : ''}
                    </div>
                    <p style="font-size: 13px; color: var(--text-light); line-height: 1.4; margin: 4px 0 6px;">${n.message}</p>
                    <span style="font-size:11px; color:var(--text-light); font-weight:500;">${n.time}</span>
                </div>
                
                <div style="display:flex; gap:8px;">
                    ${!n.read ? `<button class="btn btn-secondary" onclick="markRead('${n.id}')" style="padding:6px 10px; font-size:11px;"><i class="lucide-eye"></i></button>` : ''}
                    <button class="btn btn-secondary" onclick="deleteAlert('${n.id}')" style="padding:6px 10px; font-size:11px; color:#EF4444;"><i class="lucide-trash-2"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

// Click bindings
function setupNotificationsListeners() {
    const tabs = document.querySelectorAll('.noti-filter-tab');
    tabs.forEach(tab => {
        tab.onclick = (e) => {
            tabs.forEach(t => t.classList.remove('active-tab'));
            e.target.classList.add('active-tab');
            notificationFilter = e.target.getAttribute('data-tab');
            renderNotifications();
        };
    });

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.onclick = () => {
            window.NOTIFICATION_API.markAllRead()
                .then(() => {
                    activeNotifications = activeNotifications.map(n => ({ ...n, read: true }));
                    renderNotifications();
                    window.UTILS.showToast("All notifications marked as read.", "success");
                });
        };
    }
}

// Mark single notification read
function markRead(id) {
    window.NOTIFICATION_API.markAsRead(id)
        .then(() => {
            activeNotifications = activeNotifications.map(n => n.id === id ? { ...n, read: true } : n);
            renderNotifications();
        });
}

// Delete notification
function deleteAlert(id) {
    window.NOTIFICATION_API.deleteNotification(id)
        .then(() => {
            activeNotifications = activeNotifications.filter(n => n.id !== id);
            renderNotifications();
            window.UTILS.showToast("Notification deleted.", "info");
        });
}

// Export functions to global scope for html clicks
window.markRead = markRead;
window.deleteAlert = deleteAlert;
