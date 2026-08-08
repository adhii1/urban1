/**
 * TORQQ Shared Mobility - My Trips Orchestrator with DataTable, Search, Filter & Rating Modal
 */

document.addEventListener('DOMContentLoaded', async () => {
    const tableContainer = 'my-trips-table-container';
    const tabs = document.querySelectorAll('.trip-tab');
    let currentTab = 'all';

    const res = await bookingService.getBookings();
    let bookings = res.success ? res.data : [];

    const columns = [
        { key: 'id', label: 'Ride ID', render: (val) => `<a href="ride-details.html?id=${val}" style="color:#16C15D; font-weight:700;">${val}</a>` },
        { key: 'modelLabel', label: 'Booking Model' },
        { key: 'pickup', label: 'Pickup Location' },
        { key: 'destination', label: 'Destination' },
        { key: 'date', label: 'Date & Time', render: (val, row) => `${val} ${row.time || ''}` },
        { key: 'estimatedFare', label: 'Fare', render: (val) => `₹${val.toFixed(2)}` },
        {
            key: 'stageLabel',
            label: 'Status',
            render: (val, row) => {
                const isComp = row.stage === 'COMPLETED';
                const isCanc = row.stage === 'CANCELLED';
                const bg = isComp ? '#16C15D' : isCanc ? '#EF4444' : '#3B82F6';
                return `<span style="background:${bg}; color:#FFF; font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700;">${val || 'Confirmed'}</span>`;
            }
        },
        {
            key: 'id',
            label: 'Actions',
            render: (val, row) => {
                if (row.stage === 'COMPLETED') {
                    return `<button style="padding:4px 10px; background:rgba(22,193,93,0.1); color:#16C15D; border-radius:6px; font-weight:600; font-size:11px;" onclick="openRateModal('${val}')">⭐ Rate Driver</button>`;
                }
                return `<a href="ride-details.html?id=${val}" style="padding:4px 10px; background:rgba(0,0,0,0.06); color:var(--clr-text-main); border-radius:6px; font-weight:600; font-size:11px;">Details</a>`;
            }
        }
    ];

    function renderTable() {
        let filtered = [...bookings];
        if (currentTab === 'upcoming') filtered = filtered.filter(b => b.stage !== 'COMPLETED' && b.stage !== 'CANCELLED');
        else if (currentTab === 'completed') filtered = filtered.filter(b => b.stage === 'COMPLETED');
        else if (currentTab === 'cancelled') filtered = filtered.filter(b => b.stage === 'CANCELLED');

        UIComponents.renderDataTable({
            containerId: tableContainer,
            columns,
            data: filtered,
            searchPlaceholder: 'Search by Ride ID, Pickup, Destination...'
        });
    }

    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(tab => {
                tab.style.background = 'rgba(0,0,0,0.05)';
                tab.style.color = 'var(--clr-text-main)';
                tab.classList.remove('active');
            });
            t.style.background = '#16C15D';
            t.style.color = '#FFF';
            t.classList.add('active');
            currentTab = t.getAttribute('data-tab');
            renderTable();
        });
    });

    window.openRateModal = (rideId) => {
        const modal = document.getElementById('rate-driver-modal');
        if (modal) modal.style.display = 'flex';
    };

    const submitRating = document.getElementById('btn-submit-rating');
    if (submitRating) {
        submitRating.addEventListener('click', () => {
            const modal = document.getElementById('rate-driver-modal');
            if (modal) modal.style.display = 'none';
            UIComponents.showToast('Thank you! Driver rating submitted successfully.', 'success');
        });
    }

    renderTable();
});
