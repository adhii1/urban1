/**
 * TORQQ Shared Mobility - Detailed Customer Ride Screen & Invoice
 */

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('ride-details-root');
    if (!root) return;

    root.innerHTML = UIComponents.renderSkeleton('card');

    const urlParams = new URLSearchParams(window.location.search);
    const rideId = urlParams.get('id') || 'TRQ-BK-8841';

    const res = await bookingService.getBookingById(rideId);
    if (!res.success) {
        root.innerHTML = UIComponents.renderErrorState();
        return;
    }

    const b = res.data;
    const d = b.driver;
    const v = b.vehicle;

    root.innerHTML = `
        <div class="glass-card" style="padding:24px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.06); padding-bottom:16px;">
                <div>
                    <span style="font-size:11px; font-weight:700; color:#16C15D; text-transform:uppercase;">OFFICIAL TAX INVOICE</span>
                    <h2 style="font-size:20px; font-weight:800; margin-top:2px;">Ride ${b.id}</h2>
                    <span style="font-size:12px; color:var(--clr-text-light);">Date: ${b.date} at ${b.time}</span>
                </div>
                <button class="btn-redesign-primary" id="btn-download-receipt" style="padding:8px 16px; font-size:13px;">
                    📥 Download PDF Receipt
                </button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; font-size:13px;">
                <div>
                    <div style="font-size:11px; font-weight:700; color:var(--clr-text-light); text-transform:uppercase; margin-bottom:4px;">PICKUP LOCATION</div>
                    <div style="font-weight:700;">${b.pickup}</div>
                </div>
                <div>
                    <div style="font-size:11px; font-weight:700; color:var(--clr-text-light); text-transform:uppercase; margin-bottom:4px;">DESTINATION STOP</div>
                    <div style="font-weight:700;">${b.destination}</div>
                </div>
            </div>

            <div style="background:rgba(15,23,42,0.03); padding:16px; border-radius:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                    <div style="font-size:12px; color:var(--clr-text-light);">Assigned Driver & Vehicle</div>
                    <div style="font-size:14px; font-weight:800;">${d.name} (${v.model})</div>
                    <div style="font-size:12px; color:#16C15D; font-weight:700;">${v.number}</div>
                </div>
                <div>
                    <div style="font-size:12px; color:var(--clr-text-light);">Booking Model</div>
                    <div style="font-size:14px; font-weight:800; text-transform:uppercase;">${b.bookingModel}</div>
                </div>
                <div>
                    <div style="font-size:12px; color:var(--clr-text-light);">Distance</div>
                    <div style="font-size:14px; font-weight:800;">${b.distanceKm} km</div>
                </div>
            </div>

            <div style="border-top:1px dashed rgba(0,0,0,0.1); padding-top:16px; font-size:13px;">
                <div style="font-size:12px; font-weight:700; color:var(--clr-text-light); text-transform:uppercase; margin-bottom:10px;">PAYMENT BREAKDOWN</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span>Base Shared Corridor Fare:</span>
                    <span>₹${b.estimatedFare.toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span>Taxes & Platform Fee:</span>
                    <span>₹0.00</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:800; color:var(--clr-text-main); margin-top:8px;">
                    <span>Paid via ${b.paymentMethod}:</span>
                    <span style="color:#16C15D;">₹${b.estimatedFare.toFixed(2)} (Paid)</span>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-download-receipt').addEventListener('click', () => {
        window.print();
        UIComponents.showToast('Printing / Downloading receipt...', 'info');
    });
});
