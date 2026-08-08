/**
 * TORQQ Shared Mobility - Customer Dashboard Handler
 */

document.addEventListener('DOMContentLoaded', async () => {
    const nameDisplay = document.getElementById('userNameDisplay');
    const btnNtf = document.getElementById('btn-open-notifications');

    if (typeof customerService !== 'undefined') {
        const res = await customerService.getCustomerProfile();
        if (res.success && nameDisplay) {
            nameDisplay.textContent = `${res.data.name} 👋`;
        }
    }

    if (btnNtf && typeof UIComponents !== 'undefined') {
        btnNtf.addEventListener('click', () => {
            UIComponents.openNotificationCenter();
        });
    }
});
