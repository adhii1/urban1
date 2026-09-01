/**
 * TORQQ Driver Route & Stop Sequence Controller
 *
 * Builds the corridor stop sequence from the driver's real trip manifest. This
 * page used to ship a hardcoded two-rider sequence, so every driver saw the same
 * two passenger names on every route no matter which customers were booked.
 *
 * A stop is derived per manifest entry: one pickup event and one drop event each,
 * ordered by the optimizer's pickupOrder. Drops follow all pickups, in reverse
 * pickup order, which is how a shared shuttle unwinds a pooled route.
 */
(function () {
    const esc = (value) => window.UTILS.escapeHtml(value);

    // A trip the driver is actually going to run today, most imminent first.
    const RUNNABLE = new Set(['AVAILABLE', 'PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS']);

    const PICKUP_DONE = new Set(['OTP_VERIFIED', 'RIDE_STARTED', 'DROPPING_OFF', 'BOARDED', 'COMPLETED', 'DROPPED']);
    const DROP_DONE = new Set(['COMPLETED', 'DROPPED']);
    const NO_SHOW = new Set(['NO_SHOW']);

    let trips = [];
    let selectedTripId = null;

    function el(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const node = el(id);
        if (node) node.textContent = value;
    }

    /**
     * Expand a manifest into an ordered list of stop events.
     * Each event is { kind, label, stopName, riderName, state }.
     */
    function stopSequenceOf(trip) {
        const riders = [...(trip.passengers || [])].sort(
            (a, b) => (Number(a.pickupOrder) || 0) - (Number(b.pickupOrder) || 0)
        );

        const pickups = riders.map((rider, index) => ({
            kind: 'PICKUP',
            label: `Passenger pickup ${index + 1}`,
            stopName: rider.pickup || '',
            riderName: window.UTILS.riderName(rider, null),
            state: NO_SHOW.has(rider.status) ? 'NO_SHOW'
                : PICKUP_DONE.has(rider.status) ? 'DONE'
                    : 'PENDING',
        }));

        // Drops unwind in reverse pickup order: the first rider on board is
        // typically the last one off on a pooled corridor run.
        const drops = [...riders].reverse().map((rider, index) => ({
            kind: 'DROP',
            label: `Passenger drop ${index + 1}`,
            stopName: rider.drop || '',
            riderName: window.UTILS.riderName(rider, null),
            state: NO_SHOW.has(rider.status) ? 'NO_SHOW'
                : DROP_DONE.has(rider.status) ? 'DONE'
                    : 'PENDING',
        }));

        return [...pickups, ...drops];
    }

    function stopMarkup(stop, isNextTarget) {
        const accent = stop.kind === 'PICKUP' ? '#22C55E' : '#3B82F6';
        const badge = stop.state === 'DONE'
            ? '<span class="badge badge-success" style="font-size:9px;">Completed</span>'
            : stop.state === 'NO_SHOW'
                ? '<span class="badge badge-danger" style="font-size:9px;">No-show</span>'
                : isNextTarget
                    ? '<span class="badge badge-warning" style="font-size:9px;">Current target</span>'
                    : '<span class="badge badge-info" style="font-size:9px;">Upcoming</span>';

        const who = stop.riderName
            ? `${stop.kind === 'PICKUP' ? 'Boarder' : 'Drop for'}: ${esc(stop.riderName)}`
            : '<em style="font-style:normal;">Passenger details unavailable</em>';

        return `
            <div style="padding:14px; background:var(--bg-app); border-radius:12px; border:1px solid var(--border-color); border-left:4px solid ${accent};">
                <div class="flex-between" style="gap:8px;">
                    <span style="font-size:10px; font-weight:700; color:${accent}; text-transform:uppercase;">${esc(stop.label)}</span>
                    ${badge}
                </div>
                <strong style="display:block; font-size:13px; margin:4px 0 2px 0;">${esc(stop.stopName || 'Stop not set')}</strong>
                <span style="font-size:11px; color:var(--text-light);">${who}</span>
            </div>`;
    }

    function renderEmpty(message) {
        const container = el('routeStopsContainer');
        if (container) {
            container.innerHTML = `
                <div style="padding:32px 16px; text-align:center; color:var(--text-light);">
                    <div style="font-weight:700; font-size:14px; color:var(--text-main);">No route to show</div>
                    <div style="font-size:12px; margin-top:6px;">${esc(message)}</div>
                </div>`;
        }
        setText('routeTripLabel', '—');
        setText('routeOnboardCount', '—');
        setText('routeDistance', '—');
        setText('routeDeparture', '—');
        setText('routeFirstStop', '—');
        setText('routeNextStop', '—');
        setText('routeProgressLabel', 'No active trip');

        const badge = el('routeStatusBadge');
        if (badge) {
            badge.textContent = 'Idle';
            badge.className = 'badge badge-info';
        }
    }

    function render() {
        const trip = trips.find((t) => t.id === selectedTripId) || trips[0];
        if (!trip) {
            renderEmpty('You have no assigned or in-progress trips right now.');
            return;
        }

        const stops = stopSequenceOf(trip);
        const nextIndex = stops.findIndex((stop) => stop.state === 'PENDING');

        const container = el('routeStopsContainer');
        if (container) {
            container.innerHTML = stops.length === 0
                ? '<div style="font-size:12px; color:var(--text-light);">This trip has no passengers on its manifest yet.</div>'
                : stops.map((stop, index) => stopMarkup(stop, index === nextIndex)).join('');
        }

        const onboard = (trip.passengers || []).filter(
            (p) => ['RIDE_STARTED', 'DROPPING_OFF', 'BOARDED'].includes(p.status)
        ).length;
        const settled = stops.filter((stop) => stop.state !== 'PENDING').length;
        const progress = stops.length > 0 ? Math.round((settled / stops.length) * 100) : 0;

        setText('routeTripLabel', `${trip.pickup || '—'} → ${trip.drop || '—'}`);
        setText('routeOnboardCount', `${onboard} of ${trip.passengerCount || (trip.passengers || []).length}`);
        setText('routeDistance', trip.distance || '—');
        setText('routeDeparture', trip.time ? `${trip.time} · ${trip.date}` : trip.date || '—');
        setText('routeFirstStop', stops[0]?.stopName || '—');
        setText('routeNextStop', nextIndex >= 0 ? (stops[nextIndex].stopName || '—') : 'All stops served');
        setText('routeProgressLabel', stops.length > 0
            ? `${progress}% complete (stop ${Math.min(settled + 1, stops.length)} of ${stops.length})`
            : 'No stops on this trip');

        const fill = el('routeProgressFill');
        if (fill) fill.style.width = `${progress}%`;
        const bar = el('routeProgressBar');
        if (bar) bar.setAttribute('aria-valuenow', String(progress));

        const badge = el('routeStatusBadge');
        if (badge) {
            const live = trip.canonicalStatus === 'IN_PROGRESS';
            badge.textContent = live ? 'Trip in progress' : 'Scheduled';
            badge.className = live ? 'badge badge-success online-pulse' : 'badge badge-info';
        }
    }

    function renderTripSelector() {
        const select = el('routeTripSelect');
        if (!select) return;

        if (trips.length <= 1) {
            select.style.display = 'none';
            return;
        }

        // A driver can run several slots in a day (an 08:00 commute and an 18:00
        // return are different people in the vehicle), so which trip is being
        // described has to be selectable rather than assumed.
        select.style.display = '';
        select.innerHTML = trips.map((trip) =>
            `<option value="${esc(trip.id)}"${trip.id === selectedTripId ? ' selected' : ''}>${esc(trip.time || trip.date || trip.id)}</option>`
        ).join('');
        select.onchange = () => {
            selectedTripId = select.value;
            render();
        };
    }

    function load() {
        if (!window.TRIP_API || !window.TRIP_API.getTrips) {
            renderEmpty('The trip API is unavailable on this page.');
            return;
        }

        window.TRIP_API.getTrips()
            .then((res) => {
                if (!res.success) {
                    renderEmpty('Trips could not be loaded.');
                    return;
                }
                trips = (res.trips || [])
                    .filter((trip) => RUNNABLE.has(trip.status))
                    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

                // Prefer a live trip; otherwise the next one due.
                const live = trips.find((trip) => trip.canonicalStatus === 'IN_PROGRESS');
                selectedTripId = (live || trips[0])?.id || null;

                renderTripSelector();
                render();
            })
            .catch((error) => {
                console.error('[routes] Failed to load trips:', error);
                renderEmpty(error.message || 'Trips could not be loaded.');
            });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!el('routeStopsContainer')) return;
        load();

        // Keep the sequence current while the driver works the route.
        setInterval(load, 20000);
        window.SOCKET?.on?.('trip:bundle:updated', load);
    });
})();
