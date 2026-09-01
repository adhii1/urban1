/**
 * TORQQ Customer — My Trips
 *
 * Loads the customer's journeys from both models and renders them in a filterable
 * list:
 *   - GET /customer/trips  scheduled subscription runs (Trip.passengers[])
 *   - GET /rides/my        on-demand Flexy rides (RideRequest)
 *
 * Upcoming journeys show the boarding OTP in full. The code is what the driver
 * asks for at pickup, so hiding it behind a mask (as this screen used to, with
 * "•••• pending") made the ride unboardable from the customer's own app. The
 * backend only ever discloses this customer's own code — co-passengers' codes are
 * stripped server-side.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('my-trips-table-container');
    const tabs = document.querySelectorAll('.trip-tab');
    let currentTab = 'all';
    let allTrips = [];

    // ── helpers ────────────────────────────────────────────────────────────

    function escHtml(v) {
        return String(v ?? '').replace(/[&<>'"]/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[c]);
    }

    const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED']);

    function statusBadge(status) {
        const map = {
            SCHEDULED: { cls: 'badge-info', label: 'Scheduled' },
            PENDING: { cls: 'badge-info', label: 'Finding a driver' },
            ACCEPTED: { cls: 'badge-info', label: 'Driver assigned' },
            RESERVED: { cls: 'badge-info', label: 'Reserved' },
            DRIVER_ARRIVING: { cls: 'badge-info', label: 'Driver on the way' },
            IN_PROGRESS: { cls: 'badge-success', label: 'In progress' },
            COMPLETED: { cls: 'badge-success', label: 'Completed' },
            CANCELLED: { cls: 'badge-danger', label: 'Cancelled' },
            EXPIRED: { cls: 'badge-danger', label: 'Expired' },
        };
        const b = map[status] || { cls: 'badge-info', label: status || 'Upcoming' };
        return `<span class="badge ${b.cls}" style="font-size:10px;padding:2px 7px;">${escHtml(b.label)}</span>`;
    }

    function formatDateTime(value, pickupTime) {
        if (!value) return { date: '—', time: pickupTime || '' };
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { date: '—', time: pickupTime || '' };

        const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        if (pickupTime && /^\d{1,2}:\d{2}$/.test(pickupTime)) {
            const [h, m] = pickupTime.split(':').map(Number);
            const at = new Date(d);
            at.setHours(h, m, 0, 0);
            return { date, time: at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) };
        }
        return { date, time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) };
    }

    // ── shape a scheduled Trip into a display object ────────────────────────

    function shapeScheduledTrip(t) {
        // `myEntry` is this customer's own row on the shared manifest — their
        // stops, their per-passenger status, and their boarding code.
        const me = t.myEntry || null;
        const passengers = Array.isArray(t.passengers) ? t.passengers : [];

        const pickupAddr = me?.pickupLocation?.address
            || me?.pickupStop?.stopName
            || passengers[0]?.pickupLocation?.address
            || t.pickupLocation?.address
            || '—';

        const dropAddr = me?.dropLocation?.address
            || me?.dropStop?.stopName
            || passengers[passengers.length - 1]?.dropLocation?.address
            || t.dropLocation?.address
            || '—';

        const { date, time } = formatDateTime(t.serviceDate, t.pickupTime);
        const driver = t.driverId || {};

        return {
            _id: t._id,
            kind: 'TRIP',
            status: t.status || 'SCHEDULED',
            date,
            time,
            pickup: pickupAddr,
            drop: dropAddr,
            driverName: driver.name || '',
            vehicleNo: driver.vehicleNumber || '',
            vehicleModel: driver.vehicleModel || '',
            myStatus: me?.status || '',
            otpCode: me?.otp?.code || '',
            otpVerified: Boolean(me?.otp?.verified),
            coPassengers: Math.max(0, passengers.length - 1),
            fare: t.fare?.final || t.fare?.estimated || 0,
            navigationUrl: t.navigationUrl || '',
        };
    }

    // ── shape an on-demand RideRequest into the same display object ──────────

    function shapeRide(r) {
        const { date, time } = formatDateTime(r.scheduledPickupAt || r.requestedAt || r.createdAt);
        const driver = r.acceptedDriverId || {};

        return {
            _id: r._id,
            kind: 'RIDE',
            status: r.status || 'PENDING',
            date,
            time,
            pickup: r.pickupLocation?.address || '—',
            drop: r.dropLocation?.address || '—',
            driverName: driver.name || '',
            vehicleNo: driver.vehicleNumber || '',
            vehicleModel: driver.vehicleModel || '',
            myStatus: r.passengerLifecycle || '',
            otpCode: r.otp?.code || '',
            otpVerified: Boolean(r.otp?.verified),
            coPassengers: 0,
            fare: r.fare?.final || r.fare?.estimated || 0,
            navigationUrl: '',
            sortKey: new Date(r.scheduledPickupAt || r.requestedAt || r.createdAt || 0).getTime(),
        };
    }

    // ── the boarding-code block ─────────────────────────────────────────────

    function boardingCodeBlock(t) {
        // Only meaningful before the journey ends.
        if (TERMINAL.has(t.status)) return '';

        if (t.otpVerified) {
            return `
                <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); display:flex; align-items:center; gap:10px;">
                    <span aria-hidden="true" style="font-size:18px;">✅</span>
                    <div>
                        <div style="font-size:11px; font-weight:700; color:#16a34a; text-transform:uppercase; letter-spacing:.4px;">Boarding confirmed</div>
                        <div style="font-size:12px; color:var(--clr-text-light, #64748b);">Your driver has verified your code for this ride.</div>
                    </div>
                </div>`;
        }

        if (!t.otpCode) {
            return `
                <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(148,163,184,0.1); border:1px dashed rgba(148,163,184,0.5);">
                    <div style="font-size:11px; font-weight:700; color:var(--clr-text-light, #64748b); text-transform:uppercase; letter-spacing:.4px;">Boarding code</div>
                    <div style="font-size:12px; color:var(--clr-text-light, #64748b); margin-top:2px;">
                        Issued once a driver is assigned to this ride.
                    </div>
                </div>`;
        }

        const digits = String(t.otpCode).split('');
        return `
            <div style="margin-top:14px; padding:14px; border-radius:12px; background:linear-gradient(135deg, rgba(22,193,93,.10), rgba(59,130,246,.10)); border:1px solid rgba(22,193,93,.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div>
                        <div style="font-size:11px; font-weight:700; color:#16a34a; text-transform:uppercase; letter-spacing:.4px;">Your boarding code</div>
                        <div style="font-size:11px; color:var(--clr-text-light, #64748b); margin-top:2px;">Show this to your driver at pickup.</div>
                    </div>
                    <button type="button" class="otp-copy-btn" data-otp="${escHtml(t.otpCode)}"
                        style="padding:6px 12px; border-radius:8px; border:1px solid rgba(22,193,93,.4); background:#fff; color:#16a34a; font-weight:700; font-size:11px; cursor:pointer;">
                        Copy
                    </button>
                </div>
                <div role="group" aria-label="Boarding code ${escHtml(digits.join(' '))}"
                    style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                    ${digits.map(d => `
                        <span aria-hidden="true" style="min-width:34px; height:42px; display:flex; align-items:center; justify-content:center;
                            background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:9px;
                            font-size:20px; font-weight:800; letter-spacing:1px; color:var(--clr-text-main, #0f172a);
                            font-variant-numeric:tabular-nums;">${escHtml(d)}</span>`).join('')}
                </div>
                <div style="font-size:11px; color:var(--clr-text-light, #64748b); margin-top:8px;">
                    🔒 Never share this code before you are in the vehicle.
                </div>
            </div>`;
    }

    // ── render ──────────────────────────────────────────────────────────────

    function filterTrips() {
        if (currentTab === 'upcoming') return allTrips.filter(t => !TERMINAL.has(t.status));
        if (currentTab === 'completed') return allTrips.filter(t => t.status === 'COMPLETED');
        if (currentTab === 'cancelled') return allTrips.filter(t => ['CANCELLED', 'EXPIRED'].includes(t.status));
        return allTrips;
    }

    function renderTrips() {
        if (!container) return;

        const list = filterTrips();

        if (list.length === 0) {
            container.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--clr-text-light, #94a3b8);">
                    <div style="font-size:36px; margin-bottom:12px;" aria-hidden="true">🗓️</div>
                    <div style="font-weight:700; font-size:15px; color:var(--clr-text-main, #0f172a);">No trips here yet</div>
                    <div style="font-size:13px; margin-top:6px;">
                        ${currentTab === 'all'
                            ? 'Book a ride or a subscription to see your journeys.'
                            : `No ${escHtml(currentTab)} trips found.`}
                    </div>
                    ${currentTab === 'all' ? `<a href="booking.html" class="btn btn-primary" style="margin-top:20px; display:inline-flex; text-decoration:none;">Book a ride</a>` : ''}
                </div>`;
            return;
        }

        container.innerHTML = list.map(t => `
            <div class="glass-card fade-in" style="padding:18px 20px; margin-bottom:16px;">
                <div class="flex-between" style="margin-bottom:14px; flex-wrap:wrap; gap:8px; display:flex; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        ${statusBadge(t.status)}
                        <span style="font-size:11px; color:var(--clr-text-light,#64748b);">${escHtml(t.date)} ${escHtml(t.time)}</span>
                        <span style="font-size:10px; font-weight:700; color:var(--clr-text-light,#64748b); text-transform:uppercase; letter-spacing:.3px;">
                            ${t.kind === 'RIDE' ? 'On-demand' : 'Subscription'}
                        </span>
                    </div>
                    <span style="font-size:11px; color:var(--clr-text-light,#64748b);">
                        ${t.coPassengers > 0 ? `Sharing with ${t.coPassengers} other${t.coPassengers === 1 ? '' : 's'}` : 'Solo journey'}
                    </span>
                </div>

                <div style="display:grid; grid-template-columns:20px 1fr; gap:4px 10px; font-size:13px; margin-bottom:14px;">
                    <span aria-hidden="true" style="color:#22c55e; font-size:16px; line-height:1.2;">●</span>
                    <div>
                        <div style="font-size:10px; font-weight:700; color:var(--clr-text-light,#64748b); text-transform:uppercase;">Pickup</div>
                        <div style="font-weight:600; color:var(--clr-text-main,#0f172a);">${escHtml(t.pickup)}</div>
                    </div>
                    <span aria-hidden="true" style="color:var(--clr-text-light,#64748b); font-size:10px; text-align:center;">│</span><span></span>
                    <span aria-hidden="true" style="color:#3b82f6; font-size:16px; line-height:1.2;">●</span>
                    <div>
                        <div style="font-size:10px; font-weight:700; color:var(--clr-text-light,#64748b); text-transform:uppercase;">Drop-off</div>
                        <div style="font-weight:600; color:var(--clr-text-main,#0f172a);">${escHtml(t.drop)}</div>
                    </div>
                </div>

                ${boardingCodeBlock(t)}

                <div style="font-size:12px; color:var(--clr-text-light,#64748b); border-top:1px solid var(--border-color,rgba(0,0,0,.08)); padding-top:10px; margin-top:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <span>${t.driverName
                        ? `🚗 ${escHtml(t.driverName)}${t.vehicleNo ? ` · ${escHtml(t.vehicleNo)}` : ''}`
                        : '🚗 Driver assigned closer to pickup'}</span>
                    ${t.fare ? `<span>₹${escHtml(t.fare)}</span>` : ''}
                    ${t.navigationUrl ? `<a href="${escHtml(t.navigationUrl)}" target="_blank" rel="noopener" style="color:var(--color-primary,#16c15d); font-weight:600; text-decoration:none; font-size:11px;">📍 View route</a>` : ''}
                </div>
            </div>`).join('');

        bindCopyButtons();
    }

    function bindCopyButtons() {
        container.querySelectorAll('.otp-copy-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const code = button.dataset.otp;
                try {
                    await navigator.clipboard.writeText(code);
                    button.textContent = 'Copied';
                } catch {
                    // Clipboard access is denied in some in-app browsers; the code
                    // is on screen either way, so this is not an error state.
                    button.textContent = 'Copy failed';
                }
                setTimeout(() => { button.textContent = 'Copy'; }, 1800);
            });
        });
    }

    // ── load from API ───────────────────────────────────────────────────────

    function showSkeleton() {
        if (!container) return;
        container.innerHTML = [1, 2, 3].map(() => `
            <div class="glass-card skeleton-pulse" style="height:180px; margin-bottom:16px; border-radius:12px;"></div>`).join('');
    }

    async function loadTrips() {
        showSkeleton();

        // Both sources are fetched together and failures are handled per-source:
        // an account with no on-demand history still gets its scheduled trips.
        const [tripsResult, ridesResult] = await Promise.allSettled([
            CUSTOMER_API.getTrips(),
            CUSTOMER_API.getMyRides(),
        ]);

        if (tripsResult.status === 'rejected' && ridesResult.status === 'rejected') {
            if (container) {
                container.innerHTML = `
                    <div style="padding:32px; text-align:center; color:#ef4444; font-size:13px;">
                        Could not load your trips. ${escHtml(tripsResult.reason?.message || '')}
                        <br><button class="btn btn-secondary" style="margin-top:16px;" onclick="location.reload()">Retry</button>
                    </div>`;
            }
            return;
        }

        const scheduled = tripsResult.status === 'fulfilled' && Array.isArray(tripsResult.value?.data)
            ? tripsResult.value.data.map(shapeScheduledTrip)
            : [];
        const onDemand = ridesResult.status === 'fulfilled' && Array.isArray(ridesResult.value?.data)
            ? ridesResult.value.data.map(shapeRide)
            : [];

        // Active journeys first, then most recent. A customer opens this screen to
        // find the ride they are about to take, not the one they took last month.
        allTrips = [...scheduled, ...onDemand].sort((a, b) => {
            const aLive = TERMINAL.has(a.status) ? 1 : 0;
            const bLive = TERMINAL.has(b.status) ? 1 : 0;
            if (aLive !== bLive) return aLive - bLive;
            return new Date(`${b.date} ${b.time}`) - new Date(`${a.date} ${a.time}`);
        });

        renderTrips();
    }

    // ── tab wiring ──────────────────────────────────────────────────────────

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.style.background = 'rgba(0,0,0,0.05)';
                t.style.color = 'var(--clr-text-main, #0f172a)';
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.style.background = '#16C15D';
            tab.style.color = '#FFF';
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            currentTab = tab.getAttribute('data-tab') || 'all';
            renderTrips();
        });
    });

    await loadTrips();

    // Boarding codes are issued when a driver is assigned, and clear when the
    // driver verifies them, so this screen refreshes rather than going stale.
    setInterval(loadTrips, 30000);
});
