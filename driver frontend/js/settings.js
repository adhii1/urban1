// TORQQ Driver Settings Page Controller
// Manages profile detail updates, dark mode triggers, emergency contacts list, and account deletion hooks

document.addEventListener('DOMContentLoaded', () => {
    // Check if on settings page
    if (!document.getElementById('profileSettingsForm')) return;

    // 1. Sync fields with current driver state
    populateFormFields();

    // 2. Setup Mode triggers
    setupSettingsListeners();
});

// Load values
function populateFormFields() {
    const driver = window.STATE.getState('currentDriver');
    
    const name = document.getElementById('settingsNameInput');
    const email = document.getElementById('settingsEmailInput');
    const upi = document.getElementById('settingsUpiInput');
    const bankAc = document.getElementById('settingsBankAccountInput');

    if (name) name.value = driver.name;
    if (email) email.value = driver.email;
    if (upi) upi.value = driver.bankDetails.upiId;
    if (bankAc) bankAc.value = driver.bankDetails.accountNo;

    // Sync theme settings checkbox toggle
    const themeToggle = document.getElementById('settingsDarkModeToggle');
    if (themeToggle) {
        themeToggle.checked = window.STATE.getState('theme') === 'dark';
    }
}

// Bind save actions
function setupSettingsListeners() {
    const profileForm = document.getElementById('profileSettingsForm');
    if (profileForm) {
        profileForm.onsubmit = (e) => {
            e.preventDefault();
            
            const updated = {
                name: document.getElementById('settingsNameInput').value.trim(),
                email: document.getElementById('settingsEmailInput').value.trim(),
                upiId: document.getElementById('settingsUpiInput').value.trim(),
                accountNo: document.getElementById('settingsBankAccountInput').value.trim()
            };

            // Call Driver API update
            window.DRIVER_API.updateProfile(updated)
                .then(res => {
                    window.UTILS.showToast(res.message, "success");
                });
        };
    }

    // Theme toggle switch
    const themeToggle = document.getElementById('settingsDarkModeToggle');
    if (themeToggle) {
        themeToggle.onchange = (e) => {
            const nextTheme = e.target.checked ? 'dark' : 'light';
            window.STATE.setState('theme', nextTheme);
            window.UTILS.showToast(`Theme changed to ${nextTheme} mode!`, "success");
        };
    }

    // Account deletion safety
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            window.UTILS.showConfirmDialog(
                "Delete Account Request",
                "Are you absolutely sure you want to request account deletion? This action is permanent and will suspend all active payouts.",
                "Yes, Delete Account",
                "Cancel"
            ).then(confirmed => {
                if (confirmed) {
                    window.UTILS.showToast("Deletion request registered with TORQQ Admin Support.", "error");
                }
            });
        };
    }
}
