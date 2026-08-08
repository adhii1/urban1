/**
 * TORQQ Shared Mobility - Active Ride Screen Component
 */

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('active-ride-root');
    if (!root) return;

    root.innerHTML = UIComponents.renderSkeleton('card');

    const res = await bookingService.getBookingById('TRQ-BK-8841');
    if (!res.success) {
        root.innerHTML = UIComponents.renderErrorState();
        return;
    }

    const b = res.data;
    const d = b.driver;
    const v = b.vehicle;

    root.innerHTML = `
        <!-- Live Metrics Card -->
        <div class="glass-card" style="margin-bottom:20px; padding:20px; background:linear-gradient(135deg, #16C15D 0%, #0F9F47 100%); color:#FFFFFF;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div>
                    <span style="font-size:11px; text-transform:uppercase; opacity:0.9; font-weight:700;">ESTIMATED ARRIVAL</span>
                    <div style="font-size:32px; font-weight:800;">${b.etaMinutes} Mins</div>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:11px; text-transform:uppercase; opacity:0.9; font-weight:700;">REMAINING DISTANCE</span>
                    <div style="font-size:24px; font-weight:800;">${b.distanceKm} km</div>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.2); height:6px; border-radius:3px; overflow:hidden;">
                <div style="width:65%; height:100%; background:#FFF;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:6px; opacity:0.9;">
                <span>Pickup: ${b.pickup}</span>
                <span>Drop: ${b.destination}</span>
            </div>
        </div>

        <!-- Driver Card -->
        <div class="glass-card" style="margin-bottom:20px; padding:20px;">
            <div style="font-size:11px; font-weight:700; color:#16C15D; text-transform:uppercase; margin-bottom:12px;">ASSIGNED DRIVER & VEHICLE</div>
            <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px;">
                <img src="${d.avatar}" alt="${d.name}" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid #16C15D;">
                <div style="flex:1;">
                    <div style="font-size:16px; font-weight:800; color:var(--clr-text-main);">${d.name}</div>
                    <div style="font-size:13px; color:var(--clr-text-light);">⭐ ${d.rating} rating • ${d.tripsCount} trips</div>
                    <div style="font-size:13px; font-weight:700; color:#16C15D; margin-top:2px;">${v.model} (${v.color})</div>
                    <div style="font-size:12px; font-weight:800; background:rgba(0,0,0,0.06); display:inline-block; padding:2px 8px; border-radius:6px; margin-top:4px;">${v.number}</div>
                </div>
            </div>
            <div style="display:flex; gap:10px;">
                <a href="tel:${d.phone}" style="flex:1; text-align:center; padding:10px; background:#16C15D; color:#FFF; font-weight:700; border-radius:10px; font-size:13px;">📞 Call Driver</a>
                <button style="flex:1; padding:10px; background:rgba(59,130,246,0.1); color:#3B82F6; font-weight:700; border-radius:10px; font-size:13px;" onclick="UIComponents.showToast('In-app chat drawer opened', 'info')">💬 Chat</button>
            </div>
        </div>

        <!-- Shared Pooling Seating Order Card -->
        <div class="glass-card" style="margin-bottom:20px; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:11px; font-weight:700; color:#16C15D; text-transform:uppercase;">SHARED MOBILITY POOLING</div>
                <span style="font-size:12px; font-weight:700; color:#3B82F6; background:rgba(59,130,246,0.1); padding:2px 8px; border-radius:8px;">You are Pickup #${b.pickupOrder}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${b.coPassengers.map(p => `
                    <div style="padding:10px 14px; background:rgba(15,23,42,0.03); border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                        <div>
                            <strong>${p.name}</strong> (${p.seatCount} Seat)
                            <div style="font-size:11px; color:var(--clr-text-light);">Stop: ${p.pickupStop}</div>
                        </div>
                        <span style="font-size:11px; font-weight:700; color:${p.status === 'Boarded' ? '#16C15D' : '#F59E0B'};">${p.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Quick Actions & Tracking Link -->
        <div style="display:flex; gap:12px;">
            <a href="tracking.html" class="btn-redesign-primary" style="flex:1; text-align:center; padding:12px;">Open Live Map Tracking →</a>
            <a href="ride-details.html?id=${b.id}" style="flex:1; text-align:center; padding:12px; background:rgba(0,0,0,0.06); font-weight:700; border-radius:12px; font-size:13px; color:var(--clr-text-main);">View Ride Invoice</a>
        </div>
    `;
});
