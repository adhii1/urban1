/**
 * TORQQ Driver Documents Controller
 *
 * Renders the driver's real compliance state from GET /driver/documents and
 * uploads through POST /driver/documents/upload. The page previously hardcoded
 * three "Approved" documents with sample licence and registration numbers, so
 * every driver looked fully verified whatever they had actually submitted.
 */
document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('documentsList');
    if (!list) return;

    const esc = (value) => window.UTILS.escapeHtml(value);

    // The three types the backend accepts, with the labels drivers recognise.
    const DOCUMENT_TYPES = [
        { key: 'license', label: 'Driving licence', icon: 'lucide-file-text' },
        { key: 'vehicleRC', label: 'Vehicle registration certificate (RC)', icon: 'lucide-car' },
        { key: 'insurance', label: 'Vehicle insurance', icon: 'lucide-shield' },
    ];

    function statusBadge(doc) {
        if (!doc || !doc.url) return '<span class="badge badge-danger">Not uploaded</span>';
        if (doc.verified) return '<span class="badge badge-success">Verified</span>';
        return '<span class="badge badge-warning">Pending verification</span>';
    }

    function detailLine(doc) {
        if (!doc || !doc.url) return 'Upload this document to complete your onboarding.';

        const parts = [];
        if (doc.uploadedAt) {
            parts.push(`Uploaded ${new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
        }
        if (doc.expiryDate) {
            const expiry = new Date(doc.expiryDate);
            const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
            parts.push(daysLeft < 0
                ? `Expired ${expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                : `Expires ${expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
        }
        if (doc.verifiedAt && doc.verified) {
            parts.push(`Verified ${new Date(doc.verifiedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`);
        }
        return parts.join(' · ') || 'Uploaded, awaiting review.';
    }

    function render(documents) {
        list.innerHTML = DOCUMENT_TYPES.map(({ key, label, icon }) => {
            const doc = documents?.[key];
            return `
            <div class="glass-card" style="padding:20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:16px; min-width:0;">
                    <div style="background:var(--bg-hover); padding:12px; border-radius:10px; color:var(--color-primary);"><i class="${icon}" style="font-size:24px;"></i></div>
                    <div style="min-width:0;">
                        <h3 style="font-size:14px; font-weight:700; color:var(--text-main);">${esc(label)}</h3>
                        <div style="font-size:11px; color:var(--text-light); margin-top:3px;">${esc(detailLine(doc))}</div>
                    </div>
                </div>
                ${statusBadge(doc)}
            </div>`;
        }).join('');

        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderError(message) {
        list.innerHTML = `
            <div class="glass-card" style="padding:24px; text-align:center; color:var(--text-light); font-size:13px;">
                Could not load your documents. ${esc(message || '')}
            </div>`;
    }

    function load() {
        const token = localStorage.getItem('driverToken');
        if (!token) return;

        fetch(`${window.TORQQ_API_BASE || '/api/v1'}/driver/documents`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'omit',
        })
            .then((res) => res.json())
            .then((payload) => {
                if (!payload.success) throw new Error(payload.message || 'Request failed');
                render(payload.data?.documents || {});
            })
            .catch((error) => {
                console.error('[documents] Failed to load:', error);
                renderError(error.message);
            });
    }

    // Insurance is the only type with an expiry the backend stores.
    const typeSelect = document.getElementById('documentTypeSelect');
    const expiryGroup = document.getElementById('insuranceExpiryGroup');
    if (typeSelect && expiryGroup) {
        const syncExpiry = () => {
            expiryGroup.style.display = typeSelect.value === 'insurance' ? '' : 'none';
        };
        typeSelect.onchange = syncExpiry;
        syncExpiry();
    }

    const uploadBtn = document.getElementById('documentUploadBtn');
    if (uploadBtn) {
        uploadBtn.onclick = () => {
            const fileInput = document.getElementById('documentFileInput');
            const file = fileInput?.files?.[0];
            if (!file) {
                window.UTILS.showToast('Choose a file to upload first.', 'warning');
                return;
            }

            const token = localStorage.getItem('driverToken');
            if (!token) {
                window.UTILS.showToast('Your session expired. Please sign in again.', 'error');
                return;
            }

            const form = new FormData();
            form.append('document', file, file.name);
            // The backend reads `type`, not `documentType` — sending the wrong
            // field name made every upload fail validation.
            form.append('type', typeSelect?.value || 'license');
            const expiry = document.getElementById('documentExpiryInput')?.value;
            if (typeSelect?.value === 'insurance' && expiry) form.append('expiryDate', expiry);

            uploadBtn.disabled = true;
            fetch(`${window.TORQQ_API_BASE || '/api/v1'}/driver/documents/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'omit',
                body: form,
            })
                .then((res) => res.json())
                .then((payload) => {
                    if (!payload.success) throw new Error(payload.message || 'Upload failed');
                    window.UTILS.showToast(payload.message || 'Document uploaded for verification.', 'success');
                    if (fileInput) fileInput.value = '';
                    load();
                })
                .catch((error) => {
                    window.UTILS.showToast(error.message || 'Upload failed.', 'error');
                })
                .finally(() => { uploadBtn.disabled = false; });
        };
    }

    load();
});
