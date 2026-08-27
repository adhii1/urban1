// TORQQ Driver Trips View Controller
// Manages completed, upcoming, and cancelled logs, details popups, and search filters

let activeTripsList = [];
let currentFilterTab = 'ALL'; // ALL, UPCOMING, COMPLETED, CANCELLED

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('tripsListContainer')) return;
    
    // Fetch Trip Database
    if (!window._tripsFetched) {
        window._tripsFetched = true;
        console.trace("TRIP_API.getTrips() - trips.js");
        window.TRIP_API.getTrips()
            .then(res => {
            activeTripsList = res.trips;
            renderTripsGrid();
            setupTripsListeners();
        });
    }
});

// Grid renderer
function renderTripsGrid() {
    const container = document.getElementById('tripsListContainer');
    if (!container) return;

    // Filter by tab
    let list = activeTripsList;
    if (currentFilterTab === 'UPCOMING') {
        list = activeTripsList.filter(t => ['AVAILABLE', 'PENDING'].includes(t.status));
    } else if (currentFilterTab === 'COMPLETED') {
        list = activeTripsList.filter(t => t.status === 'COMPLETED');
    } else if (currentFilterTab === 'CANCELLED') {
        list = activeTripsList.filter(t => t.status === 'CANCELLED');
    }

    // Apply Search term
    const searchVal = document.getElementById('tripsSearchInput')?.value.toLowerCase();
    if (searchVal) {
        list = list.filter(t => 
            t.id.toLowerCase().includes(searchVal) ||
            t.pickup.toLowerCase().includes(searchVal) ||
            t.drop.toLowerCase().includes(searchVal)
        );
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-light);">
                <i class="lucide-ban" style="font-size: 40px; color: var(--text-light); margin-bottom: 12px; display: inline-flex;"></i>
                <div style="font-weight: 700; font-size: 16px; color: var(--text-main);">No Trips Found</div>
                <div style="font-size: 13px; margin-top: 4px;">Try modifying your search query or tabs filter.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(t => {
        let badgeClass = 'badge-info';
        let statusLabel = t.status;
        if (t.status === 'COMPLETED') badgeClass = 'badge-success';
        else if (t.status === 'CANCELLED') badgeClass = 'badge-danger';
        else if (t.status === 'AVAILABLE') {
            badgeClass = 'badge-warning';
            statusLabel = 'Scheduled';
        } else if (t.status === 'PENDING') {
            badgeClass = 'badge-warning';
            statusLabel = 'Pending offer';
        }

        return `
            <div class="glass-card fade-in" style="padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
                <div class="flex-between" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 12px;">
                    <div>
                        <span class="badge ${badgeClass}">${statusLabel}</span>
                        <div style="font-size: 11px; color: var(--text-light); margin-top: 4px;">ID: ${t.id}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: var(--text-light);">${t.date}</div>
                        <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${t.time}</div>
                    </div>
                </div>

                <div class="trip-addresses" style="margin: 0; padding-left: 20px;">
                    <style>
                        .trip-addresses::before { left: 5px; top: 8px; bottom: 8px; }
                        .address-node::before { left: -20px; width: 10px; height: 10px; }
                    </style>
                    <div class="address-node node-pickup" style="margin-bottom: 12px;">
                        <div class="address-title" style="font-size: 9px;">PICKUP</div>
                        <div class="address-text" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">${t.pickup}</div>
                    </div>
                    <div class="address-node node-drop">
                        <div class="address-title" style="font-size: 9px;">DROP-OFF</div>
                        <div class="address-text" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">${t.drop}</div>
                    </div>
                </div>

                <div class="flex-between" style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 16px;">
                    <div>
                        <div style="font-size: 10px; color: var(--text-light);">EST. FARE</div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--color-primary);">${t.earnings > 0 ? window.UTILS.formatCurrency(t.earnings) : '₹0.00'}</div>
                    </div>
                    <button class="btn btn-secondary" onclick="viewTripDetails('${t.id}')" style="padding: 8px 14px; font-size: 12px;">Details</button>
                </div>
            </div>
        `;
    }).join('');
}

// Bind tabs and search inputs
function setupTripsListeners() {
    const tabs = document.querySelectorAll('.trip-filter-tab');
    tabs.forEach(tab => {
        tab.onclick = (e) => {
            tabs.forEach(t => t.classList.remove('active-tab'));
            e.target.classList.add('active-tab');
            currentFilterTab = e.target.getAttribute('data-tab');
            renderTripsGrid();
        };
    });

    const searchInput = document.getElementById('tripsSearchInput');
    if (searchInput) {
        searchInput.oninput = debounce(() => {
            renderTripsGrid();
        }, 300);
    }
}

// Modal View details for a specific historical trip ID
function viewTripDetails(tripId) {
    const t = activeTripsList.find(x => x.id === tripId);
    if (!t) return;

    let overlay = document.getElementById('torqqSharedModal');
    if (!overlay) return;

    const title = document.getElementById('sharedModalTitle');
    const body = document.getElementById('sharedModalBody');
    const footer = document.getElementById('sharedModalFooter');

    title.textContent = `Trip Details`;

    let cancelSnippet = '';
    if (t.status === 'CANCELLED') {
        cancelSnippet = `
            <div style="margin-bottom:16px; padding: 12px; border-radius: 8px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #EF4444; font-size: 13px;">
                <strong>Cancellation Reason:</strong> ${t.cancelReason || 'N/A'}
            </div>
        `;
    }

    const passengerRows = (t.passengers && t.passengers.length > 0)
        ? t.passengers.map((p, i) => `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; font-size:13px; padding-bottom:10px; border-bottom:1px solid var(--border-color);">
                <div>
                    <strong style="color:var(--text-main);">${p.name || `Passenger ${i+1}`}</strong>
                    ${p.phone ? `<div style="font-size:11px; color:var(--text-light);">${p.phone}</div>` : ''}
                    <div style="font-size:11px; color:var(--text-light); margin-top:3px;">
                        📍 ${p.pickup && p.pickup !== 'Pickup' ? p.pickup : '—'}
                    </div>
                    <div style="font-size:11px; color:var(--text-light);">
                        🏁 ${p.drop && p.drop !== 'Drop' ? p.drop : '—'}
                    </div>
                </div>
                <span class="badge ${p.status === 'COMPLETED' ? 'badge-success' : p.status === 'NO_SHOW' ? 'badge-danger' : 'badge-info'}" style="font-size:9px; padding:2px 6px; white-space:nowrap; margin-top:2px;">${p.status || 'ASSIGNED'}</span>
            </div>`)
        .join('')
        : '<div style="font-size:13px; color:var(--text-light);">No passenger data available.</div>';

    body.innerHTML = `
        ${cancelSnippet}
        <div style="margin-bottom:16px;">
            <div style="font-size:11px; color:var(--text-light); text-transform:uppercase;">Status</div>
            <span class="badge ${t.status === 'COMPLETED' ? 'badge-success' : t.status === 'CANCELLED' ? 'badge-danger' : 'badge-info'}" style="margin-top:4px;">${t.status}</span>
        </div>

        <div style="background:var(--bg-app); border-radius:var(--border-radius-md); padding:14px; border:1px solid var(--border-color); margin-bottom:16px; font-size:13px;">
            <div style="display:grid; grid-template-columns:auto 1fr; gap:4px 12px;">
                <span style="color:var(--text-light); font-size:11px;">Date</span><span style="font-weight:600;">${t.date}</span>
                <span style="color:var(--text-light); font-size:11px;">Time</span><span style="font-weight:600;">${t.time || t.pickupTime || '—'}</span>
                <span style="color:var(--text-light); font-size:11px;">Distance</span><span style="font-weight:600;">${t.distance || '—'}</span>
                <span style="color:var(--text-light); font-size:11px;">Earnings</span><span style="font-weight:700; color:var(--color-primary);">${t.earnings > 0 ? window.UTILS.formatCurrency(t.earnings) : '₹0.00'}</span>
            </div>
        </div>

        <div class="trip-addresses" style="margin-bottom:20px; padding-left:22px;">
            <div class="address-node node-pickup" style="margin-bottom:14px;">
                <div class="address-title">PICKUP</div>
                <div class="address-text" style="font-size:13px; font-weight:600;">${t.pickup && t.pickup !== 'Pickup' ? t.pickup : '—'}</div>
            </div>
            <div class="address-node node-drop">
                <div class="address-title">DROP-OFF</div>
                <div class="address-text" style="font-size:13px; font-weight:600;">${t.drop && t.drop !== 'Drop' ? t.drop : '—'}</div>
            </div>
        </div>

        <div style="background:var(--bg-app); border-radius:var(--border-radius-md); padding:16px; border:1px solid var(--border-color);">
            <div style="font-size:11px; font-weight:600; color:var(--text-light); margin-bottom:10px; text-transform:uppercase;">
                Passengers (${(t.passengers || []).length})
            </div>
            ${passengerRows}
        </div>

        ${t.navigationUrl ? `
        <div style="margin-top:16px;">
            <a href="${t.navigationUrl}" target="_blank" class="btn btn-secondary" style="width:100%; justify-content:center; text-decoration:none;">
                <i class="lucide-map"></i> Open Navigation Route
            </a>
        </div>` : ''}
    `;

    footer.innerHTML = `
        <button id="closeDetailModal" class="btn btn-secondary">Close</button>
    `;

    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.querySelector('.modal-dialog').style.transform = 'scale(1)';
    }, 50);

    const closeModal = () => {
        overlay.querySelector('.modal-dialog').style.transform = 'scale(0.95)';
        setTimeout(() => overlay.style.display = 'none', 200);
    };

    document.getElementById('closeDetailModal').onclick = closeModal;
    document.getElementById('sharedModalCloseBtn').onclick = closeModal;
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Make views accessible
window.viewTripDetails = viewTripDetails;
