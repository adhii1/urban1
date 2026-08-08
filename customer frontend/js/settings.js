/**
 * TORQQ Customer Settings Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    const darkModeToggle = document.getElementById('darkModeToggle');
    const notificationsToggle = document.getElementById('notificationsToggle');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    // Initialize Theme State
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (darkModeToggle) darkModeToggle.checked = savedTheme === 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            const newTheme = isDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            if (typeof UIComponents !== 'undefined') {
                UIComponents.showToast(`Switched to ${newTheme} mode`, 'info');
            }
        });
    }

    if (notificationsToggle) {
        notificationsToggle.addEventListener('change', (e) => {
            if (typeof UIComponents !== 'undefined') {
                UIComponents.showToast(`Push notifications ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            }
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'index.html';
        });
    }
});
