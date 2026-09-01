// TORQQ Driver Passenger Directory Controller
// Manages search queries, filters, passenger information modals, and lost item reporting

let passengersList = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('passengersListContainer')) return;

    if (!window.TRIP_API || !window.TRIP_API.getTrips) {
        // Previously this page shipped without tripApi.js loaded, so this guard
        // failed silently and the directory rendered nothing at all.
        renderDirectoryMessage('The trip API is unavailable, so the passenger directory cannot load.');
        return;
    }

    renderDirectorySkeleton();

    // Load live passenger records from the driver's assigned trips.
    window.TRIP_API.getTrips()
        .then(res => {
            if (!res.success || !res.trips) {
                renderDirectoryMessage('No passenger records were returned.');
                return;
            }

            // De-duplicate by customer identity, not by display name: two riders
            // can legitimately share a name, and keying on the name silently
            // merged them into one directory entry.
            const uniquePassengers = new Map();
            res.trips.forEach(trip => {
                (trip.passengers || []).forEach(p => {
                    const id = p.customerId || p.rideRequestId || p.passengerId || p.id;
                    if (!id) return;
                    const key = String(id);
                    const existing = uniquePassengers.get(key) || {};
                    uniquePassengers.set(key, {
                        id: key,
                        tripId: p.tripId || existing.tripId,
                        name: p.name || existing.name || null,
                        phone: p.phone || existing.phone || '',
                        pickup: p.pickup || existing.pickup || '',
                        drop: p.drop || existing.drop || '',
                        trips: (existing.trips || 0) + 1,
                        lastStatus: p.status || existing.lastStatus || '',
                    });
                });
            });

            passengersList = Array.from(uniquePassengers.values())
                .sort((a, b) => String(a.name || '\uffff').localeCompare(String(b.name || '\uffff')));
            renderPassengersGrid();
        })
        .catch(err => {
            console.error("Failed to load passenger directory:", err);
            renderDirectoryMessage(err.message || 'Could not load the passenger directory.');
        });

    setupPassengersListeners();
});

function renderDirectorySkeleton() {
    const container = document.getElementById('passengersListContainer');
    if (!container) return;
    container.innerHTML = [1, 2, 3].map(() =>
        '<div class="glass-card skeleton-pulse" style="height:92px; border-radius:12px;"></div>'
    ).join('');
}

function renderDirectoryMessage(message) {
    const container = document.getElementById('passengersListContainer');
    if (!container) return;
    container.innerHTML = `
        <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-light);">
            <div style="font-weight: 700; font-size: 15px; color: var(--text-main);">Passenger directory unavailable</div>
            <div style="font-size: 13px; margin-top: 6px;">${window.UTILS.escapeHtml(message)}</div>
        </div>`;
}

// Render cards
function renderPassengersGrid() {
    const container = document.getElementById('passengersListContainer');
    if (!container) return;

    const searchVal = document.getElementById('passengersSearchInput')?.value.toLowerCase();
    const stateFilter = document.getElementById('passengerFilterSelect')?.value || 'ALL';

    const ONBOARD = new Set(['RIDE_STARTED', 'DROPPING_OFF', 'BOARDED', 'OTP_VERIFIED']);
    const DONE = new Set(['COMPLETED', 'DROPPED', 'NO_SHOW']);

    let list = passengersList;

    if (stateFilter === 'ONBOARD') {
        list = list.filter(p => ONBOARD.has(p.lastStatus));
    } else if (stateFilter === 'DONE') {
        list = list.filter(p => DONE.has(p.lastStatus));
    } else if (stateFilter === 'WAITING') {
        list = list.filter(p => !ONBOARD.has(p.lastStatus) && !DONE.has(p.lastStatus));
    }

    // Search across name, phone and stops. `p.name` may legitimately be null,
    // so this no longer calls .toLowerCase() on it unguarded — that threw and
    // left the grid frozen on the first keystroke.
    if (searchVal) {
        list = list.filter(p =>
            [p.name, p.phone, p.pickup, p.drop]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(searchVal)
        );
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-light);">
                <i class="lucide-ban" style="font-size: 40px; color: var(--text-light); margin-bottom: 12px; display: inline-flex;"></i>
                <div style="font-weight: 700; font-size: 16px; color: var(--text-main);">No Boarders Found</div>
                <div style="font-size: 13px; margin-top: 4px;">Try adjusting your query or filter keywords.</div>
            </div>
        `;
        return;
    }

    const esc = window.UTILS.escapeHtml;

    container.innerHTML = list.map(p => {
        const name = p.name;
        const label = name || 'Passenger details unavailable';
        const tel = String(p.phone || '').replace(/[^\d+]/g, '');
        return `
        <div class="glass-card fade-in" style="padding: 20px; display: flex; align-items: center; justify-content: space-between; gap:16px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:16px; min-width:0;">
                <img src="${esc(window.UTILS.initialsAvatar(name || '', 100))}" style="width: 50px; height:50px; border-radius:50%; border:2px solid var(--border-color); flex-shrink:0;" alt="">
                <div style="min-width:0;">
                    <h3 style="font-size: 14px; font-weight:700; color:${name ? 'var(--text-main)' : 'var(--text-light)'}; overflow:hidden; text-overflow:ellipsis;">${esc(label)}</h3>
                    <div style="font-size:11px; color:var(--text-light); margin-top:2px;">
                        ${p.phone ? esc(p.phone) : 'No contact number'} · ${p.trips} trip${p.trips === 1 ? '' : 's'} together
                    </div>
                    ${p.pickup || p.drop ? `<div style="font-size:11px; color:var(--text-light); margin-top:2px;">${esc(p.pickup || '—')} → ${esc(p.drop || '—')}</div>` : ''}
                </div>
            </div>

            <div style="display:flex; gap:8px;">
                ${tel
                    ? `<a class="btn btn-secondary" href="tel:${esc(tel)}" style="padding:8px 12px; font-size:12px; text-decoration:none;"><i class="lucide-phone"></i> Call</a>`
                    : '<button class="btn btn-secondary" disabled style="padding:8px 12px; font-size:12px;"><i class="lucide-phone-off"></i> No number</button>'}
                <button class="btn btn-primary" data-lost-item-for="${esc(p.id)}" style="padding:8px 12px; font-size:12px; background-color:#EF4444;"><i class="lucide-package-open"></i> Report Lost</button>
            </div>
        </div>
    `;
    }).join('');

    // Bound as listeners rather than inline onclick with an interpolated name:
    // a passenger whose name contains a quote broke the generated attribute.
    container.querySelectorAll('[data-lost-item-for]').forEach((button) => {
        button.onclick = () => {
            const rider = passengersList.find(p => p.id === button.dataset.lostItemFor);
            if (rider) triggerLostItemReport(rider.id, rider.name || 'this passenger');
        };
    });
}

// Bind search changes
function setupPassengersListeners() {
    const search = document.getElementById('passengersSearchInput');
    const filter = document.getElementById('passengerFilterSelect');

    if (search) search.oninput = () => renderPassengersGrid();
    if (filter) filter.onchange = () => renderPassengersGrid();
}

// Lost item form popup trigger
function triggerLostItemReport(passengerId, name) {
    let overlay = document.getElementById('torqqSharedModal');
    if (!overlay) return;

    const title = document.getElementById('sharedModalTitle');
    const body = document.getElementById('sharedModalBody');
    const footer = document.getElementById('sharedModalFooter');

    // textContent, so a name is never interpreted as markup.
    title.textContent = `Report lost item — ${name}`;
    body.innerHTML = `
        <div class="form-group">
            <label for="lostItemDesc">ITEM DESCRIPTION</label>
            <input type="text" id="lostItemDesc" class="form-input" placeholder="e.g. Black leather wallet, iPhone 13" required>
        </div>
        <div class="form-group">
            <label for="lostItemNotes">ADDITIONAL NOTES / TICKET DETAILS</label>
            <textarea id="lostItemNotes" class="form-input" rows="4" placeholder="Mention drop location, seat side, or where found..."></textarea>
        </div>
    `;

    footer.innerHTML = `
        <button id="cancelLostItemBtn" class="btn btn-secondary">Cancel</button>
        <button id="submitLostItemBtn" class="btn btn-primary" style="background:#EF4444;">Submit Report</button>
    `;

    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.querySelector('.modal-dialog').style.transform = 'scale(1)';
    }, 50);

    const closeModal = () => {
        overlay.querySelector('.modal-dialog').style.transform = 'scale(0.95)';
        setTimeout(() => overlay.style.display = 'none', 200);
    };

    document.getElementById('cancelLostItemBtn').onclick = closeModal;
    document.getElementById('sharedModalCloseBtn').onclick = closeModal;

    document.getElementById('submitLostItemBtn').onclick = () => {
        const item = document.getElementById('lostItemDesc').value.trim();
        if (!item) {
            window.UTILS.showToast("Please describe the item found.", "error");
            return;
        }

        // Simulating submission
        window.UTILS.showToast(`Lost item report for ${item} submitted to Support center!`, "success");
        closeModal();
    };
}

window.triggerLostItemReport = triggerLostItemReport;
