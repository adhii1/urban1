/**
 * TORQQ Shared Mobility - Customer Live GPS Tracking Module
 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('customerMapCanvas');
    const btnSos = document.getElementById('btn-sos-floating');
    const btnChat = document.getElementById('btn-chat-driver');
    const btnShare = document.getElementById('btnShareTrip');
    const btnCancel = document.getElementById('btnCancelRide');

    if (canvas) {
        const ctx = canvas.getContext('2d');
        function resizeCanvas() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        let progress = 0.2;

        function drawMap() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Background terrain
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Grid Roads
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1.5;
            for (let x = 0; x < canvas.width; x += 60) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 60) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            // Draw Route Polyline (Green glowing path)
            const p1 = { x: 80, y: canvas.height - 100 };
            const p2 = { x: canvas.width / 2, y: canvas.height / 2 };
            const p3 = { x: canvas.width - 80, y: 100 };

            ctx.shadowColor = '#16C15D';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#16C15D';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(p2.x, p2.y, p3.x, p3.y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Pickup Node (Green)
            ctx.fillStyle = '#22C55E';
            ctx.beginPath(); ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2); ctx.fill();

            // Destination Node (Red)
            ctx.fillStyle = '#EF4444';
            ctx.beginPath(); ctx.arc(p3.x, p3.y, 8, 0, Math.PI * 2); ctx.fill();

            // Animated Vehicle Marker along curve
            const t = progress;
            const curX = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * p2.x + t * t * p3.x;
            const curY = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * p2.y + t * t * p3.y;

            ctx.fillStyle = '#3B82F6';
            ctx.shadowColor = '#3B82F6';
            ctx.shadowBlur = 15;
            ctx.beginPath(); ctx.arc(curX, curY, 12, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            progress += 0.001;
            if (progress > 0.95) progress = 0.1;

            requestAnimationFrame(drawMap);
        }

        drawMap();
    }

    if (btnSos) {
        btnSos.addEventListener('click', async () => {
            if (confirm('EMERGENCY SOS ALERT:\nAre you sure you want to alert the emergency dispatch team immediately?')) {
                if (typeof driverService !== 'undefined') {
                    const res = await driverService.triggerEmergencySOS({ lat: 12.9116, lng: 77.6389 });
                    if (typeof UIComponents !== 'undefined') {
                        UIComponents.showToast(`🚨 ${res.message}`, 'error', 6000);
                    }
                }
            }
        });
    }

    // ── the live ride ───────────────────────────────────────────────────────
    // Everything below reads GET /rides/active. The bottom sheet used to hardcode
    // a driver name, plate, ETA and a booking id, so it described the same ride to
    // every customer and "Cancel Ride" cancelled a fixture that does not exist.

    let activeRide = null;

    const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[c]);

    function initialsAvatar(name, size = 96) {
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

    const STATUS_TEXT = {
        PENDING: 'Finding a driver…',
        SCHEDULED: 'Scheduled — a driver is assigned closer to pickup',
        ACCEPTED: 'Driver assigned',
        RESERVED: 'Reserved in a shared bundle',
        DRIVER_ARRIVING: 'Your driver is on the way',
        IN_PROGRESS: 'Ride in progress',
    };

    function renderBoardingCode(ride) {
        const slot = document.getElementById('liveBoardingCode');
        if (!slot) return;

        const code = ride?.otp?.code;
        if (!ride || ride.status === 'IN_PROGRESS' && ride.otp?.verified) {
            slot.innerHTML = ride?.otp?.verified
                ? '<div style="margin-top:12px; font-size:12px; font-weight:600; color:#16a34a;">✅ Boarding confirmed by your driver</div>'
                : '';
            return;
        }
        if (!code) {
            slot.innerHTML = '<div style="margin-top:12px; font-size:11px; color:var(--clr-text-light,#64748b);">Your boarding code appears once a driver is assigned.</div>';
            return;
        }

        const digits = String(code).split('');
        slot.innerHTML = `
            <div style="margin-top:12px; padding:12px; border-radius:10px; background:rgba(22,193,93,.08); border:1px solid rgba(22,193,93,.28);">
                <div style="font-size:10px; font-weight:700; color:#16a34a; text-transform:uppercase; letter-spacing:.4px;">Your boarding code</div>
                <div role="group" aria-label="Boarding code ${esc(digits.join(' '))}" style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                    ${digits.map(d => `<span aria-hidden="true" style="min-width:28px; height:34px; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:8px; font-size:16px; font-weight:800; font-variant-numeric:tabular-nums; color:#0f172a;">${esc(d)}</span>`).join('')}
                </div>
                <div style="font-size:10px; color:var(--clr-text-light,#64748b); margin-top:6px;">Show it to your driver at pickup.</div>
            </div>`;
    }

    function renderRide(ride) {
        activeRide = ride;

        const statusEl = document.getElementById('liveStatusText');
        const routeEl = document.getElementById('liveRouteText');
        const plateEl = document.getElementById('liveVehiclePlate');
        const nameEl = document.getElementById('liveDriverName');
        const modelEl = document.getElementById('liveVehicleModel');
        const avatarEl = document.getElementById('liveDriverAvatar');
        const callEl = document.getElementById('btn-call-driver');

        if (!ride) {
            if (statusEl) statusEl.textContent = 'No ride in progress';
            if (routeEl) routeEl.textContent = 'Book a ride to track it here.';
            if (plateEl) plateEl.textContent = '—';
            if (nameEl) nameEl.textContent = 'No driver assigned';
            if (modelEl) modelEl.textContent = '';
            if (avatarEl) avatarEl.src = initialsAvatar('', 96);
            if (callEl) { callEl.hidden = true; callEl.style.display = 'none'; }
            renderBoardingCode(null);
            if (btnCancel) btnCancel.disabled = true;
            return;
        }

        const driver = ride.acceptedDriverId || {};

        if (statusEl) statusEl.textContent = STATUS_TEXT[ride.status] || ride.status;
        if (routeEl) {
            routeEl.textContent = `${ride.pickupLocation?.address || '—'} → ${ride.dropLocation?.address || '—'}`;
        }
        if (plateEl) plateEl.textContent = driver.vehicleNumber || '—';
        if (nameEl) nameEl.textContent = driver.name || 'Driver being assigned';
        if (modelEl) modelEl.textContent = driver.vehicleModel || '';
        if (avatarEl) {
            avatarEl.src = initialsAvatar(driver.name, 96);
            avatarEl.alt = driver.name ? `${driver.name} avatar` : '';
        }

        const phone = ride.driverPhone || driver.phone;
        if (callEl) {
            if (phone) {
                callEl.href = `tel:${String(phone).replace(/[^\d+]/g, '')}`;
                callEl.hidden = false;
                callEl.style.display = 'inline-flex';
            } else {
                callEl.hidden = true;
                callEl.style.display = 'none';
            }
        }

        renderBoardingCode(ride);
        if (btnCancel) {
            btnCancel.disabled = !['PENDING', 'SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING'].includes(ride.status);
        }
    }

    async function loadActiveRide() {
        if (typeof CUSTOMER_API === 'undefined') return;
        try {
            const payload = await CUSTOMER_API.getActiveRide();
            renderRide(payload?.data || null);
        } catch (error) {
            console.error('[tracking] Failed to load the active ride:', error);
            renderRide(null);
        }
    }

    loadActiveRide();
    setInterval(loadActiveRide, 15000);

    if (btnChat && typeof UIComponents !== 'undefined') {
        btnChat.addEventListener('click', () => {
            const name = activeRide?.acceptedDriverId?.name;
            UIComponents.showToast(
                name ? `Messaging is not available yet — call ${name} instead.` : 'No driver is assigned to message yet.',
                'info'
            );
        });
    }

    if (btnShare && typeof UIComponents !== 'undefined') {
        btnShare.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href);
            UIComponents.showToast('🔗 Live trip tracking link copied to clipboard!', 'success');
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', async () => {
            if (!activeRide) return;
            if (!confirm('Cancel this ride? A cancellation fee may apply once a driver has been assigned.')) return;

            try {
                // Cancels the ride actually in progress. This used to post a
                // hardcoded booking id, so it could never cancel anything real.
                const result = await CUSTOMER_API.cancelRide(activeRide._id, 'Cancelled from live tracking');
                UIComponents?.showToast?.(result.message || 'Ride cancelled.', 'info');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
            } catch (error) {
                UIComponents?.showToast?.(error.message || 'Could not cancel the ride.', 'error');
            }
        });
    }
});
