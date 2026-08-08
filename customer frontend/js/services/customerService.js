/**
 * TORQQ Shared Mobility - Customer Profile & Preferences API Interface
 */

const customerService = (() => {
    function getDelay() { return 300; }

    async function getCustomerProfile() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    data: {
                        id: 'CUST-8041',
                        name: localStorage.getItem('userName') || 'Adhikshitha V.',
                        phone: localStorage.getItem('mobileNumber') || '+91 98800 11223',
                        email: 'adhikshitha@example.com',
                        walletBalance: 1250.00,
                        activePasses: 18,
                        savedLocations: [
                            { id: 'LOC-1', label: 'Home', address: 'Sector 4, HSR Layout, Bangalore', icon: 'home' },
                            { id: 'LOC-2', label: 'Office', address: 'Embassy TechVillage, Outer Ring Rd', icon: 'briefcase' },
                            { id: 'LOC-3', label: 'Gym', address: 'Gold Gym, 14th Main, HSR', icon: 'activity' }
                        ]
                    }
                });
            }, getDelay());
        });
    }

    async function updateProfile(profileData) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (profileData.name) localStorage.setItem('userName', profileData.name);
                if (profileData.phone) localStorage.setItem('mobileNumber', profileData.phone);
                resolve({ success: true, message: 'Profile updated successfully' });
            }, getDelay());
        });
    }

    return {
        getCustomerProfile,
        updateProfile
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = customerService;
}
