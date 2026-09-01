/**
 * TORQQ Driver Profile Page Controller
 *
 * Binds the profile card to the `currentDriver` state rather than reading it
 * once on DOMContentLoaded. The profile is fetched asynchronously by common.js,
 * so a one-shot read renders whatever was cached from a previous session — the
 * reason this page kept showing a stale (or placeholder) driver identity.
 */
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('profileDriverNameText')) return;

    const el = (id) => document.getElementById(id);

    const set = (id, value, fallback = '—') => {
        const node = el(id);
        if (!node) return;
        const text = value === 0 ? '0' : value;
        node.textContent = text || text === '0' ? String(text) : fallback;
    };

    window.STATE.subscribe('currentDriver', (driver) => {
        if (!driver) return;

        const name = String(driver.name || '').trim();
        set('profileDriverNameText', name || 'Driver profile unavailable');

        const avatar = el('profileDriverAvatarImg');
        if (avatar) {
            avatar.src = driver.avatar || window.UTILS.initialsAvatar(name, 200);
            avatar.alt = name ? `${name} profile photo` : 'Driver profile photo';
        }

        const rating = Number(driver.rating);
        set('profileDriverRatingText', Number.isFinite(rating) && rating > 0 ? rating.toFixed(2) : 'Not rated yet');
        set('profileTotalRatingsText', Number.isFinite(Number(driver.totalRatings)) ? Number(driver.totalRatings) : 0);
        set('profileTotalTripsText', Number.isFinite(Number(driver.completedTrips)) ? Number(driver.completedTrips) : 0);

        set('profilePhoneText', driver.phone ? `+91 ${driver.phone}` : '');
        set('profileVehicleNumberText', driver.vehicleNumber);
        set('profileVehicleModelText', driver.vehicleModel);
        set('profileLicenseText', driver.licenseNumber);

        const summary = el('profileVehicleSummary');
        if (summary) {
            summary.textContent = driver.vehicleModel
                ? `TORQQ Shuttle Partner · ${driver.vehicleModel}`
                : 'TORQQ Shuttle Partner';
        }
    });
});
