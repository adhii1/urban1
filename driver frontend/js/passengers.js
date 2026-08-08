// TORQQ Driver Passenger Directory Controller
// Manages search queries, filters, passenger information modals, and lost item reporting

let passengersList = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('passengersListContainer')) return;

    // Load live passenger records from driver's completed trips
    if (window.TRIP_API && window.TRIP_API.getTrips) {
        console.trace("TRIP_API.getTrips() - passengers.js");
        window.TRIP_API.getTrips()
            .then(res => {
                if (res.success && res.trips) {
                    const uniquePassengers = new Map();
                    res.trips.forEach(trip => {
                        if (trip.passengers && Array.isArray(trip.passengers)) {
                            trip.passengers.forEach(p => {
                                const id = p.id || p._id || p.phone || p.name;
                                uniquePassengers.set(id, {
                                    id: id,
                                    name: p.name,
                                    phone: p.phone || 'N/A',
                                    gender: p.gender || 'Unknown',
                                    isWomenOnly: p.isWomenOnly || false,
                                    avatar: p.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150'
                                });
                            });
                        }
                    });
                    passengersList = Array.from(uniquePassengers.values());
                    renderPassengersGrid();
                }
            })
            .catch(err => {
                console.error("Failed to load passenger directory:", err);
                renderPassengersGrid();
            });
    }

    setupPassengersListeners();
});

// Render cards
function renderPassengersGrid() {
    const container = document.getElementById('passengersListContainer');
    if (!container) return;

    const searchVal = document.getElementById('passengersSearchInput')?.value.toLowerCase();
    const genderFilter = document.getElementById('passengerFilterSelect')?.value; // ALL, MALE, FEMALE, WOMEN_ONLY

    let list = passengersList;

    // Search filter
    if (searchVal) {
        list = list.filter(p => p.name.toLowerCase().includes(searchVal) || p.phone.includes(searchVal));
    }

    // Dropdown filters
    if (genderFilter === 'MALE') {
        list = list.filter(p => p.gender === 'Male');
    } else if (genderFilter === 'FEMALE') {
        list = list.filter(p => p.gender === 'Female');
    } else if (genderFilter === 'WOMEN_ONLY') {
        list = list.filter(p => p.isWomenOnly);
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

    container.innerHTML = list.map(p => `
        <div class="glass-card fade-in" style="padding: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display:flex; align-items:center; gap:16px;">
                <img src="${p.avatar}" style="width: 50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--border-color);" alt="${p.name}">
                <div>
                    <h3 style="font-size: 14px; font-weight:700; color:var(--text-main);">${p.name}</h3>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                        <span class="badge ${p.gender === 'Male' ? 'badge-info' : 'badge-success'}" style="font-size:9px; padding:2px 6px;">${p.gender}</span>
                        ${p.isWomenOnly ? '<span class="badge badge-warning" style="font-size:9px; padding:2px 6px;">Women Only</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="window.UTILS.showToast('Calling: ${p.phone}', 'info')" style="padding:8px 12px; font-size:12px;"><i class="lucide-phone"></i> Call</button>
                <button class="btn btn-primary" onclick="triggerLostItemReport('${p.id}', '${p.name}')" style="padding:8px 12px; font-size:12px; background-color:#EF4444;"><i class="lucide-package-open"></i> Report Lost</button>
            </div>
        </div>
    `).join('');
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

    title.textContent = `Report Lost Item - Passenger: ${name}`;
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
