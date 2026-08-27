/**
 * TORQQ Customer — My Trips
 * Loads real trips from GET /customer/trips and renders them in a filterable
 * grid. Falls back to empty-state when the customer has no trips yet.
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

    function statusBadge(status) {
        const map = {
            SCHEDULED: { cls: 'badge-info',    label: 'Scheduled' },
            ACCEPTED:  { cls: 'badge-info',    label: 'Accepted' },
            IN_PROGRESS: { cls: 'badge-success', label: 'In Progress' },
            COMPLETED: { cls: 'badge-success', label: 'Completed' },
            CANCELLED: { cls: 'badge-danger',  label: 'Cancelled' },
        };
        const b = map[status] || { cls: 'badge-info', label: status || 'Upcoming' };
        return `<span class="badge ${b.cls}" style="font-size:10px;padding:2px 7px;">${escHtml(b.label)}</span>`;
    }

    // ── shape a raw Trip API response into a display object ─────────────────

    function shapTrip(t) {
        // Pickup / drop — from myEntry first, then first/last passenger
        const me = t.myEntry || null;
        const passengers = Array.isArray(t.passengers) ? t.passengers : [];

        const pickupAddr = me?.pickupLocation?.address
            || passengers[0]?.pickupLocation?.address
            || t.pickupLocation?.address
            || '—';

        const dropAddr = me?.dropLocation?.address
            || passengers[passengers.length - 1]?.dropLocation?.address
            || t.dropLocation?.address
            || '—';

        // Date + time
        const serviceDate = t.serviceDate ? new Date(t.serviceDate) : null;
        const dateStr = serviceDate
            ? serviceDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        let timeStr = t.pickupTime || '';
        if (t.pickupTime && serviceDate) {
            const [h, m] = t.pickupTime.split(':').map(Number);
            const d = new Date(serviceDate);
            d.setHours(h, m, 0, 0);
            timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        }

        // Driver info
        const driver = t.driverId || {};
        const driverName = driver.name || '—';
        const vehicleNo  = driver.vehicleNumber || '—';

        return {
            _id:       t._id,
            status:    t.status || 'SCHEDULED',
            date:      dateStr,
            time:      timeStr,
            pickup:    pickupAddr,
            drop:      dropAddr,
            driverName,
            vehicleNo,
            myStatus:  me?.status || t.status || '—',
            otp:       me?.otp?.verified ? '✓ verified' : (me?.otp?.code ? '•••• pending' : '—'),
            passengers: passengers.length,
            navigationUrl: t.navigationUrl || '',
        };
    }

    // ── render ──────────────────────────────────────────────────────────────

    function renderTrips() {
        if (!container) return;

        let list = allTrips;
        if (currentTab === 'upcoming') {
            list = list.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status));
        } else if (currentTab === 'completed') {
            list = list.filter(t => t.status === 'COMPLETED');
        } else if (currentTab === 'cancelled') {
            list = list.filter(t => t.status === 'CANCELLED');
        }

        if (list.length === 0) {
            container.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--text-light, #94a3b8);">
                    <div style="font-size:36px; margin-bottom:12px;">🗓️</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main, #0f172a);">No trips here yet</div>
                    <div style="font-size:13px; margin-top:6px;">
                        ${currentTab === 'all'
                            ? 'Book a subscription to see your scheduled trips.'
                            : `No ${currentTab} trips found.`}
                    </div>
                    ${currentTab === 'all' ? `<a href="booking.html" class="btn btn-primary" style="margin-top:20px; display:inline-flex; text-decoration:none;">Book a ride</a>` : ''}
                </div>`;
            return;
        }

        container.innerHTML = list.map(t => `
            <div class="glass-card fade-in" style="padding:18px 20px; margin-bottom:16px;">
                <div class="flex-between" style="margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${statusBadge(t.status)}
                        <span style="font-size:11px; color:var(--text-light);">${escHtml(t.date)} ${escHtml(t.time)}</span>
                    </div>
                    <span style="font-size:11px; color:var(--text-light);">${t.passengers} passenger${t.passengers !== 1 ? 's' : ''} in trip</span>
                </div>

                <div style="display:grid; grid-template-columns:20px 1fr; gap:4px 10px; font-size:13px; margin-bottom:14px;">
                    <span style="color:#22c55e; font-size:16px; line-height:1.2;">●</span>
                    <div>
                        <div style="font-size:10px; font-weight:700; color:var(--text-light); text-transform:uppercase;">Pickup</div>
                        <div style="font-weight:600; color:var(--text-main);">${escHtml(t.pickup)}</div>
                    </div>
                    <span style="color:var(--text-light); font-size:10px; text-align:center;">│</span><span></span>
                    <span style="color:#3b82f6; font-size:16px; line-height:1.2;">●</span>
                    <div>
                        <div style="font-size:10px; font-weight:700; color:var(--text-light); text-transform:uppercase;">Drop-off</div>
                        <div style="font-weight:600; color:var(--text-main);">${escHtml(t.drop)}</div>
                    </div>
                </div>

                <div style="font-size:12px; color:var(--text-light); border-top:1px solid var(--border-color,rgba(0,0,0,.08)); padding-top:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                    <span>🚗 ${escHtml(t.driverName)} · ${escHtml(t.vehicleNo)}</span>
                    <span>OTP: ${escHtml(t.otp)}</span>
                    ${t.navigationUrl ? `<a href="${escHtml(t.navigationUrl)}" target="_blank" style="color:var(--color-primary,#16c15d); font-weight:600; text-decoration:none; font-size:11px;">📍 View route</a>` : ''}
                </div>
            </div>`).join('');
    }

    // ── load from API ───────────────────────────────────────────────────────

    function showSkeleton() {
        if (!container) return;
        container.innerHTML = [1, 2, 3].map(() => `
            <div class="glass-card skeleton-pulse" style="height:140px; margin-bottom:16px; border-radius:12px;"></div>`).join('');
    }

    async function loadTrips() {
        showSkeleton();
        try {
            const payload = await CUSTOMER_API.getTrips();
            const raw = Array.isArray(payload.data) ? payload.data : [];
            allTrips = raw.map(shapTrip);
            renderTrips();
        } catch (err) {
            console.error('[my-trips] Failed to load trips:', err);
            if (container) {
                container.innerHTML = `
                    <div style="padding:32px; text-align:center; color:#ef4444; font-size:13px;">
                        Could not load trips. ${escHtml(err.message || '')}
                        <br><button class="btn btn-secondary" style="margin-top:16px;" onclick="location.reload()">Retry</button>
                    </div>`;
            }
        }
    }

    // ── tab wiring ──────────────────────────────────────────────────────────

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.style.background = 'rgba(0,0,0,0.05)';
                t.style.color = 'var(--clr-text-main, #0f172a)';
                t.classList.remove('active');
            });
            tab.style.background = '#16C15D';
            tab.style.color = '#FFF';
            tab.classList.add('active');
            currentTab = tab.getAttribute('data-tab') || 'all';
            renderTrips();
        });
    });

    await loadTrips();
});
