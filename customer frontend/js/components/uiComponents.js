/**
 * TORQQ Shared Mobility - Reusable Global UI Components Library
 */

const UIComponents = (() => {
    // 1. Toast Notification Helper
    function showToast(message, type = 'success', duration = 3500) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const iconSvg = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
        toast.innerHTML = `<span>${iconSvg}</span> <div>${message}</div>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // 2. Notification Center Drawer
    function setupNotificationCenter() {
        if (document.getElementById('notification-drawer')) return;

        const drawer = document.createElement('div');
        drawer.id = 'notification-drawer';
        drawer.className = 'notification-drawer';
        drawer.innerHTML = `
            <div class="notification-header">
                <div style="font-weight:700; font-size:16px; display:flex; align-items:center; gap:8px;">
                    <span>Notification Center</span>
                    <span id="ntf-count-badge" style="background:#16C15D; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">0</span>
                </div>
                <button id="close-ntf-drawer" style="font-size:18px; color:var(--clr-text-light); cursor:pointer;">✕</button>
            </div>
            <div style="padding: 10px 20px; border-bottom: 1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between;">
                <span style="font-size:12px; color:var(--clr-text-light);">Recent Alerts</span>
                <button id="mark-all-ntf-read" style="font-size:12px; color:#16C15D; font-weight:600; cursor:pointer;">Mark all as read</button>
            </div>
            <div class="notification-body" id="ntf-drawer-body">
                <!-- Loaded dynamically -->
            </div>
        `;

        const backdrop = document.createElement('div');
        backdrop.id = 'notification-backdrop';
        backdrop.className = 'notification-backdrop';

        document.body.appendChild(drawer);
        document.body.appendChild(backdrop);

        document.getElementById('close-ntf-drawer').addEventListener('click', closeNotificationCenter);
        backdrop.addEventListener('click', closeNotificationCenter);
        document.getElementById('mark-all-ntf-read').addEventListener('click', async () => {
            if (typeof notificationService !== 'undefined') {
                await notificationService.markAllAsRead();
                loadNotificationCenterData();
                showToast('All notifications marked as read', 'info');
            }
        });
    }

    async function openNotificationCenter() {
        setupNotificationCenter();
        document.getElementById('notification-drawer').classList.add('open');
        document.getElementById('notification-backdrop').classList.add('open');
        await loadNotificationCenterData();
    }

    function closeNotificationCenter() {
        const drawer = document.getElementById('notification-drawer');
        const backdrop = document.getElementById('notification-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    }

    async function loadNotificationCenterData() {
        const body = document.getElementById('ntf-drawer-body');
        const badge = document.getElementById('ntf-count-badge');
        if (!body) return;

        body.innerHTML = renderSkeleton('card');

        if (typeof notificationService !== 'undefined') {
            const res = await notificationService.getNotifications();
            if (res.success && res.data.length > 0) {
                const unreadCount = res.data.filter(n => !n.read).length;
                if (badge) badge.textContent = unreadCount;
                body.innerHTML = res.data.map(n => `
                    <div class="notification-card ${n.read ? '' : 'unread'}">
                        <div style="flex:1;">
                            <div style="font-weight:600; font-size:13px; margin-bottom:4px;">${n.title}</div>
                            <div style="font-size:12px; color:var(--clr-text-light); line-height:1.4;">${n.message}</div>
                            <div style="font-size:10px; color:#94A3B8; margin-top:6px;">${n.timestamp}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                body.innerHTML = renderEmptyState('No notifications', 'You have no new alerts right now.');
            }
        }
    }

    // 3. Generic Search, Filter, Sort, Pagination, CSV & PDF Export DataTable
    function renderDataTable({ containerId, columns, data, searchPlaceholder = 'Search records...' }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let currentPage = 1;
        const pageSize = 5;
        let searchQuery = '';
        let sortKey = columns[0].key;
        let sortAsc = true;

        function getFilteredData() {
            let result = [...data];
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                result = result.filter(row => {
                    return columns.some(col => String(row[col.key] || '').toLowerCase().includes(q));
                });
            }
            result.sort((a, b) => {
                let valA = a[sortKey] || '';
                let valB = b[sortKey] || '';
                if (valA < valB) return sortAsc ? -1 : 1;
                if (valA > valB) return sortAsc ? 1 : -1;
                return 0;
            });
            return result;
        }

        function render() {
            const filtered = getFilteredData();
            const totalPages = Math.ceil(filtered.length / pageSize) || 1;
            const startIdx = (currentPage - 1) * pageSize;
            const pageData = filtered.slice(startIdx, startIdx + pageSize);

            container.innerHTML = `
                <div class="data-table-wrapper">
                    <div class="data-table-toolbar">
                        <input type="text" class="data-table-search" id="${containerId}-search" placeholder="${searchPlaceholder}" value="${searchQuery}">
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    ${columns.map(c => `<th data-key="${c.key}">${c.label} ${sortKey === c.key ? (sortAsc ? '▲' : '▼') : ''}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${pageData.length > 0 ? pageData.map(row => `
                                    <tr>
                                        ${columns.map(c => `<td>${c.render ? c.render(row[c.key], row) : (row[c.key] !== undefined ? row[c.key] : '-')}</td>`).join('')}
                                    </tr>
                                `).join('') : `<tr><td colspan="${columns.length}">${renderEmptyState('No records found', 'Try adjusting your search filter.')}</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                    <div class="data-table-pagination">
                        <span>Showing ${filtered.length > 0 ? startIdx + 1 : 0} to ${Math.min(startIdx + pageSize, filtered.length)} of ${filtered.length} entries</span>
                        <div style="display:flex; gap:8px;">
                            <button id="${containerId}-prev" ${currentPage === 1 ? 'disabled' : ''} style="padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1;">Prev</button>
                            <span>Page ${currentPage} of ${totalPages}</span>
                            <button id="${containerId}-next" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1;">Next</button>
                        </div>
                    </div>
                </div>
            `;

            // Attach Table Listeners
            const searchInput = document.getElementById(`${containerId}-search`);
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    searchQuery = e.target.value;
                    currentPage = 1;
                    render();
                });
            }

            const thList = container.querySelectorAll('th');
            thList.forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.getAttribute('data-key');
                    if (sortKey === key) sortAsc = !sortAsc;
                    else { sortKey = key; sortAsc = true; }
                    render();
                });
            });

            const prevBtn = document.getElementById(`${containerId}-prev`);
            const nextBtn = document.getElementById(`${containerId}-next`);
            if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; render(); } });
            if (nextBtn) nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; render(); } });
        }

        render();
    }

    function exportToCSV(columns, rows, filename) {
        const headerStr = columns.map(c => `"${c.label}"`).join(',');
        const rowStrs = rows.map(r => columns.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`).join(','));
        const csvContent = 'data:text/csv;charset=utf-8,' + [headerStr, ...rowStrs].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('CSV exported successfully', 'success');
    }

    function exportToPDF(title, columns, rows) {
        window.print();
        showToast('Print dialog launched for PDF export', 'info');
    }

    // 4. Skeleton Loaders
    function renderSkeleton(type = 'card') {
        if (type === 'table') {
            return `
                <div style="padding:16px;">
                    <div class="skeleton" style="width:100%; height:32px; margin-bottom:12px;"></div>
                    <div class="skeleton" style="width:100%; height:24px; margin-bottom:8px;"></div>
                    <div class="skeleton" style="width:100%; height:24px; margin-bottom:8px;"></div>
                    <div class="skeleton" style="width:100%; height:24px;"></div>
                </div>
            `;
        }
        return `
            <div style="padding:20px; border-radius:12px; border:1px solid rgba(0,0,0,0.05); margin-bottom:12px;">
                <div class="skeleton" style="width:40%; height:20px; margin-bottom:10px;"></div>
                <div class="skeleton" style="width:80%; height:14px; margin-bottom:8px;"></div>
                <div class="skeleton" style="width:60%; height:14px;"></div>
            </div>
        `;
    }

    // 5. Empty State
    function renderEmptyState(title = 'No Data Found', description = 'There are no items to display.', buttonLabel = '', onButtonClick = null) {
        return `
            <div style="padding:36px 20px; text-align:center; color:var(--clr-text-light);">
                <div style="font-size:36px; margin-bottom:10px;">📭</div>
                <div style="font-size:15px; font-weight:700; color:var(--clr-text-main); margin-bottom:4px;">${title}</div>
                <div style="font-size:13px; margin-bottom:16px;">${description}</div>
                ${buttonLabel ? `<button class="btn-redesign-primary" style="display:inline-block; padding:8px 18px; font-size:13px;" onclick="${onButtonClick}">${buttonLabel}</button>` : ''}
            </div>
        `;
    }

    // 6. Error State
    function renderErrorState(title = 'Connection Error', description = 'Unable to reach backend servers. Please retry.', onRetry = 'location.reload()') {
        return `
            <div style="padding:36px 20px; text-align:center; color:#EF4444;">
                <div style="font-size:36px; margin-bottom:10px;">⚠️</div>
                <div style="font-size:15px; font-weight:700; color:var(--clr-text-main); margin-bottom:4px;">${title}</div>
                <div style="font-size:13px; color:var(--clr-text-light); margin-bottom:16px;">${description}</div>
                <button style="padding:8px 18px; background:#EF4444; color:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;" onclick="${onRetry}">Retry Request</button>
            </div>
        `;
    }

    // 7. Success Animated Checkmark SVG
    function renderSuccessCheckmark() {
        return `
            <div class="success-checkmark-wrapper">
                <svg class="success-checkmark-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle class="success-checkmark-circle" cx="26" cy="26" r="23" fill="none"/>
                    <path class="success-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
            </div>
        `;
    }

    // 8. Breadcrumbs Renderer
    function renderBreadcrumb(items = []) {
        return `
            <nav style="font-size:12px; color:var(--clr-text-light); margin-bottom:16px; display:flex; gap:6px; align-items:center;">
                <a href="/dashboard.html" style="color:inherit;">Home</a>
                ${items.map(item => `
                    <span>/</span>
                    ${item.url ? `<a href="${item.url}" style="color:inherit;">${item.label}</a>` : `<span style="font-weight:600; color:var(--clr-text-main);">${item.label}</span>`}
                `).join('')}
            </nav>
        `;
    }

    return {
        showToast,
        setupNotificationCenter,
        openNotificationCenter,
        closeNotificationCenter,
        renderDataTable,
        renderSkeleton,
        renderEmptyState,
        renderErrorState,
        renderSuccessCheckmark,
        renderBreadcrumb
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIComponents;
}
