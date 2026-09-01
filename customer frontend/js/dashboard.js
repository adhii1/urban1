/**
 * TORQQ Customer Dashboard
 *
 * Binds the dashboard to real account data. Every section on this page used to
 * ship hardcoded sample content — a fixed driver, a fixed upcoming ride, a fixed
 * wallet balance — so it read the same for every customer who signed in.
 *
 * Journeys come from both models, because a customer's rides span both:
 *   GET /rides/active   the ride currently underway, if any
 *   GET /customer/trips scheduled subscription runs
 *   GET /rides/my       on-demand Flexy rides
 *
 * Upcoming journeys carry the boarding OTP. The code is what the driver asks for
 * at pickup, so it is shown in full; the backend discloses only this customer's
 * own code and strips co-passengers' codes from the response.
 */

document.addEventListener('DOMContentLoaded', () => {
    const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED']);

    const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[c]);

    const el = (id) => document.getElementById(id);

    const money = (value) => new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 2,
    }).format(Number(value) || 0);

    function initialsAvatar(name, size = 80) {
        const label = String(name || '').trim();
        const initials = label
            ? label.split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('')
            : '?';
        let hash = 0;
        for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 360;
        const hue = label ? hash : 215;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
            + `<rect width="${size}" height="${size}" rx="${size / 2}" fill="hsl(${hue} 65% 92%)"/>`
            + `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Poppins, sans-serif"`
            + ` font-size="${size * 0.4}" font-weight="700" fill="hsl(${hue} 55% 32%)">${initials}</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    function whenLabel(value, pickupTime) {
        if (!value) return pickupTime || '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return pickupTime || '—';

        if (pickupTime && /^\d{1,2}:\d{2}$/.test(pickupTime)) {
            const [h, m] = pickupTime.split(':').map(Number);
            d.setHours(h, m, 0, 0);
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const dayDiff = Math.round((day - today) / 86400000);
        const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        if (dayDiff === 0) return `Today • ${time}`;
        if (dayDiff === 1) return `Tomorrow • ${time}`;
        return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • ${time}`;
    }

    // ── journey shaping ─────────────────────────────────────────────────────

    function shapeScheduledTrip(t) {
        const me = t.myEntry || null;
        const passengers = Array.isArray(t.passengers) ? t.passengers : [];
        const driver = t.driverId || {};

        return {
            id: t._id,
            kind: 'Subscription',
            status: t.status || 'SCHEDULED',
            when: whenLabel(t.serviceDate, t.pickupTime),
            sortAt: new Date(t.serviceDate || 0).getTime(),
            pickup: me?.pickupLocation?.address || me?.pickupStop?.stopName || passengers[0]?.pickupLocation?.address || '—',
            drop: me?.dropLocation?.address || me?.dropStop?.stopName || passengers[passengers.length - 1]?.dropLocation?.address || '—',
            driverName: driver.name || '',
            vehicleNo: driver.vehicleNumber || '',
            vehicleModel: driver.vehicleModel || '',
            otpCode: me?.otp?.code || '',
            otpVerified: Boolean(me?.otp?.verified),
        };
    }

    function shapeRide(r) {
        const driver = r.acceptedDriverId || {};
        const at = r.scheduledPickupAt || r.requestedAt || r.createdAt;
        return {
            id: r._id,
            kind: 'On-demand',
            status: r.status || 'PENDING',
            when: whenLabel(at),
            sortAt: new Date(at || 0).getTime(),
            pickup: r.pickupLocation?.address || '—',
            drop: r.dropLocation?.address || '—',
            driverName: driver.name || '',
            vehicleNo: driver.vehicleNumber || '',
            vehicleModel: driver.vehicleModel || '',
            otpCode: r.otp?.code || '',
            otpVerified: Boolean(r.otp?.verified),
        };
    }

    // ── boarding code ───────────────────────────────────────────────────────

    function otpMarkup(journey, { compact = false } = {}) {
        if (TERMINAL.has(journey.status)) return '';

        if (journey.otpVerified) {
            return `<div style="margin-top:10px; font-size:12px; font-weight:600; color:#16a34a;">✅ Boarding confirmed by your driver</div>`;
        }
        if (!journey.otpCode) {
            return `<div style="margin-top:10px; font-size:11px; color:var(--clr-text-light,#64748b);">Boarding code is issued once a driver is assigned.</div>`;
        }

        const digits = String(journey.otpCode).split('');
        return `
            <div style="margin-top:12px; padding:12px; border-radius:10px; background:rgba(22,193,93,.08); border:1px solid rgba(22,193,93,.28);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:10px; font-weight:700; color:#16a34a; text-transform:uppercase; letter-spacing:.4px;">Boarding code</span>
                    <button type="button" class="otp-copy-btn" data-otp="${esc(journey.otpCode)}"
                        style="padding:4px 10px; border-radius:7px; border:1px solid rgba(22,193,93,.4); background:#fff; color:#16a34a; font-weight:700; font-size:10px; cursor:pointer;">Copy</button>
                </div>
                <div role="group" aria-label="Boarding code ${esc(digits.join(' '))}" style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                    ${digits.map(d => `<span aria-hidden="true" style="min-width:${compact ? 26 : 30}px; height:${compact ? 32 : 38}px; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:8px; font-size:${compact ? 15 : 18}px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--clr-text-main,#0f172a);">${esc(d)}</span>`).join('')}
                </div>
                <div style="font-size:10px; color:var(--clr-text-light,#64748b); margin-top:6px;">Share only with your driver, at pickup.</div>
            </div>`;
    }

    function bindCopyButtons(scope) {
        scope.querySelectorAll('.otp-copy-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(button.dataset.otp);
                    button.textContent = 'Copied';
                } catch {
                    button.textContent = 'Copy failed';
                }
                setTimeout(() => { button.textContent = 'Copy'; }, 1800);
            });
        });
    }

    // ── renderers ───────────────────────────────────────────────────────────

    function renderActiveRide(ride) {
        const section = el('activeRideSection');
        if (!section) return;

        if (!ride) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        const journey = shapeRide(ride);

        el('activeRideStatus').textContent = journey.status.replaceAll('_', ' ').toLowerCase();
        el('activeRidePickup').textContent = journey.pickup;
        el('activeRideDrop').textContent = journey.drop;
        el('activeRideVehicle').textContent = journey.vehicleNo || 'Vehicle pending';
        el('activeRideDriver').textContent = journey.driverName
            ? [journey.driverName, journey.vehicleModel].filter(Boolean).join(' • ')
            : 'Driver being assigned';

        const avatar = el('activeRideDriverAvatar');
        if (avatar) {
            avatar.src = initialsAvatar(journey.driverName, 80);
            avatar.alt = journey.driverName ? `${journey.driverName} avatar` : '';
        }

        const otpSlot = el('activeRideOtp');
        if (otpSlot) {
            otpSlot.innerHTML = otpMarkup(journey);
            bindCopyButtons(otpSlot);
        }
    }

    function journeyCard(journey) {
        return `
            <div class="glass-card" style="padding:16px; margin-bottom:12px; border-left:4px solid #3B82F6;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
                    <span style="font-size:11px; font-weight:700; color:#3B82F6; text-transform:uppercase; letter-spacing:.4px;">${esc(journey.kind)}</span>
                    <span style="font-size:12px; font-weight:600; color:var(--clr-text-light,#64748b);">${esc(journey.when)}</span>
                </div>
                <div style="font-weight:700; font-size:14px; line-height:1.35;">${esc(journey.pickup)} ➔ ${esc(journey.drop)}</div>
                <div style="font-size:12px; color:var(--clr-text-light,#64748b); margin-top:3px;">
                    ${journey.driverName
                        ? `${esc(journey.driverName)}${journey.vehicleNo ? ` · ${esc(journey.vehicleNo)}` : ''}`
                        : 'Driver assigned closer to pickup'}
                </div>
                ${otpMarkup(journey, { compact: true })}
            </div>`;
    }

    function renderUpcoming(journeys) {
        const container = el('upcomingRidesContainer');
        if (!container) return;

        if (journeys.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="padding:24px; text-align:center; color:var(--clr-text-light,#64748b);">
                    <div style="font-weight:700; font-size:14px; color:var(--clr-text-main,#0f172a);">No upcoming rides</div>
                    <div style="font-size:12px; margin-top:4px;">Book a ride or a subscription to see it here.</div>
                    <a href="booking.html" class="btn-redesign-primary" style="margin-top:14px; display:inline-flex; padding:8px 16px; font-size:13px; text-decoration:none;">Book a ride</a>
                </div>`;
            return;
        }

        container.innerHTML = journeys.slice(0, 3).map(journeyCard).join('');
        bindCopyButtons(container);
    }

    function renderRecent(journeys) {
        const container = el('recentRidesContainer');
        if (!container) return;

        if (journeys.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="padding:20px; text-align:center; font-size:12px; color:var(--clr-text-light,#64748b);">
                    Your completed rides will appear here.
                </div>`;
            return;
        }

        container.innerHTML = journeys.slice(0, 3).map(journey => `
            <div class="glass-card" style="padding:14px 16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:700;">${esc(journey.pickup)} ➔ ${esc(journey.drop)}</div>
                    <div style="font-size:11px; color:var(--clr-text-light,#64748b); margin-top:2px;">
                        ${esc(journey.when)}${journey.driverName ? ` · ${esc(journey.driverName)}` : ''}
                    </div>
                </div>
                <span style="background:${journey.status === 'COMPLETED' ? 'rgba(22,193,93,0.1)' : 'rgba(239,68,68,0.1)'}; color:${journey.status === 'COMPLETED' ? '#16C15D' : '#EF4444'}; font-size:11px; padding:3px 10px; border-radius:10px; font-weight:700;">${esc(journey.status)}</span>
            </div>`).join('');
    }

    function renderSavedLocations(profile) {
        const grid = el('savedLocationsGrid');
        if (!grid) return;

        const saved = [
            { icon: '🏠', label: 'Home', value: profile?.homeLocation?.address },
            { icon: '📍', label: 'Usual pickup', value: profile?.pickupLocation?.address },
            { icon: '🏢', label: 'Usual drop', value: profile?.dropLocation?.address },
        ].filter(entry => entry.value);

        if (saved.length === 0) {
            grid.innerHTML = `
                <div class="glass-card" style="padding:16px; grid-column:1/-1; font-size:12px; color:var(--clr-text-light,#64748b);">
                    No saved addresses yet.
                    <a href="profile.html" style="color:#16C15D; font-weight:600; text-decoration:none;">Add them in your profile →</a>
                </div>`;
            return;
        }

        grid.innerHTML = saved.map(entry => `
            <a href="booking.html" class="glass-card" style="padding:14px; text-decoration:none; color:inherit; display:block;">
                <div style="font-size:18px;" aria-hidden="true">${entry.icon}</div>
                <div style="font-weight:700; font-size:14px;">${esc(entry.label)}</div>
                <div style="font-size:11px; color:var(--clr-text-light,#64748b);">${esc(entry.value)}</div>
            </a>`).join('');
    }

    function renderPassAndWallet({ subscription, wallet }) {
        const passNode = el('dashPassCount');
        const walletNode = el('dashWalletBalance');

        if (passNode) {
            if (!subscription) {
                passNode.textContent = 'No active pass';
            } else {
                const count = subscription.subscriptionCount || 1;
                const remaining = subscription.remainingPauseDays;
                passNode.textContent = `${count} active pass${count === 1 ? '' : 'es'}`;
                if (Number.isFinite(Number(remaining))) {
                    passNode.title = `${remaining} pause day(s) remaining`;
                }
            }
        }

        if (walletNode) {
            const balance = wallet?.walletBalance ?? wallet?.balance;
            walletNode.textContent = balance === undefined || balance === null
                ? 'Wallet balance unavailable'
                : `TORQQ wallet balance: ${money(balance)}`;
        }
    }

    // ── load ────────────────────────────────────────────────────────────────

    async function load() {
        const [profileRes, tripsRes, ridesRes, activeRes, subRes, walletRes] = await Promise.allSettled([
            CUSTOMER_API.getProfile(),
            CUSTOMER_API.getTrips(),
            CUSTOMER_API.getMyRides(),
            CUSTOMER_API.getActiveRide(),
            CUSTOMER_API.getSubscription(),
            CUSTOMER_API.request('/wallet'),
        ]);

        const profile = profileRes.status === 'fulfilled' ? profileRes.value?.data : null;
        const nameNode = el('userNameDisplay');
        if (nameNode) {
            nameNode.textContent = profile?.name ? `${profile.name} 👋` : 'Welcome 👋';
        }
        renderSavedLocations(profile);

        const scheduled = tripsRes.status === 'fulfilled' && Array.isArray(tripsRes.value?.data)
            ? tripsRes.value.data.map(shapeScheduledTrip) : [];
        const onDemand = ridesRes.status === 'fulfilled' && Array.isArray(ridesRes.value?.data)
            ? ridesRes.value.data.map(shapeRide) : [];
        const journeys = [...scheduled, ...onDemand];

        const active = activeRes.status === 'fulfilled' ? activeRes.value?.data : null;
        renderActiveRide(active);

        // Exclude the ride already shown in the active card from "upcoming", so
        // the same journey is not presented twice.
        const activeId = active?._id ? String(active._id) : null;

        renderUpcoming(
            journeys
                .filter(j => !TERMINAL.has(j.status) && String(j.id) !== activeId)
                .sort((a, b) => a.sortAt - b.sortAt)
        );

        renderRecent(
            journeys
                .filter(j => TERMINAL.has(j.status))
                .sort((a, b) => b.sortAt - a.sortAt)
        );

        renderPassAndWallet({
            subscription: subRes.status === 'fulfilled' ? subRes.value?.data : null,
            wallet: walletRes.status === 'fulfilled' ? walletRes.value?.data : null,
        });
    }

    const btnNtf = el('btn-open-notifications');
    if (btnNtf && typeof UIComponents !== 'undefined') {
        btnNtf.addEventListener('click', () => UIComponents.openNotificationCenter());
    }

    load().catch((error) => console.error('[dashboard] Failed to load:', error));

    // Boarding codes appear when a driver is assigned and clear once verified.
    setInterval(() => load().catch(() => {}), 30000);
});
