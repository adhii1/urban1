/**
 * TORQQ Shared Mobility - Driver Service API Interface
 */

const driverService = (() => {
    function getDelay() { return 350; }

    async function getDriverProfile() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const driver = TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.drivers[0] : null;
                resolve({ success: true, data: driver });
            }, getDelay());
        });
    }

    async function toggleDutyStatus(isOnline) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (TORQQ_MOCK_DATA && TORQQ_MOCK_DATA.drivers[0]) {
                    TORQQ_MOCK_DATA.drivers[0].status = isOnline ? 'online' : 'offline';
                    TORQQ_MOCK_DATA.drivers[0].breakStatus = false;
                }
                resolve({ success: true, isOnline, status: isOnline ? 'online' : 'offline' });
            }, getDelay());
        });
    }

    async function toggleBreakMode(isOnBreak) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (TORQQ_MOCK_DATA && TORQQ_MOCK_DATA.drivers[0]) {
                    TORQQ_MOCK_DATA.drivers[0].breakStatus = isOnBreak;
                    TORQQ_MOCK_DATA.drivers[0].status = isOnBreak ? 'on_break' : 'online';
                }
                resolve({ success: true, isOnBreak, status: isOnBreak ? 'on_break' : 'online' });
            }, getDelay());
        });
    }

    async function triggerEmergencySOS(locationData) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.warn('[EMERGENCY SOS TRIGGERED]', locationData);
                resolve({ success: true, alertId: `SOS-${Date.now()}`, message: 'Emergency dispatch center alerted instantly. Stand by.' });
            }, 200);
        });
    }

    return {
        getDriverProfile,
        toggleDutyStatus,
        toggleBreakMode,
        triggerEmergencySOS
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = driverService;
}
