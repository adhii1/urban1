// TORQQ Driver Shared Utilities
// Formatting, Validation, Toast, Modal, and Loading UI components

const UTILS = {
    // Formatters
    formatCurrency: (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(value);
    },

    formatDistance: (meters) => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${meters} m`;
    },

    formatDuration: (minutes) => {
        if (minutes >= 60) {
            const hrs = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
        }
        return `${minutes} mins`;
    },

    formatDate: (dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatTime: (timeStr) => {
        // Can handle ISO date string or HH:MM format
        if (!timeStr) return '';
        if (timeStr.includes('T')) {
            const d = new Date(timeStr);
            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        // Assuming already HH:MM
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        return `${displayH}:${minutes} ${ampm}`;
    },

    formatPhone: (phone) => {
        return phone.replace(/(\d{2})(\d{5})(\d{5})/, '+$1 $2-$3');
    },

    // Validators
    validateEmail: (email) => {
        const re = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return re.test(String(email).toLowerCase());
    },

    validatePhone: (phone) => {
        const re = /^[6-9]\d{9}$/; // 10 digit Indian mobile numbers
        return re.test(String(phone).replace(/\D/g, ''));
    },

    validateUPI: (upi) => {
        const re = /^[\w.-]+@[\w.-]+$/;
        return re.test(upi);
    },

    // Toast Manager (Dynamic creation, aria accessibility, auto-cleanup)
    showToast: (message, type = 'success') => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.position = 'fixed';
            container.style.bottom = '24px';
            container.style.right = '24px';
            container.style.zIndex = '9999';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '10px';
            container.style.maxWidth = '360px';
            container.style.width = 'calc(100% - 48px)';
            container.setAttribute('role', 'alert');
            container.setAttribute('aria-live', 'assertive');
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in-up`;
        
        // Define color styles based on type
        let bgColor = 'var(--bg-glass-card, rgba(255, 255, 255, 0.9))';
        let borderLeft = '4px solid #16C15D';
        let iconHtml = '✓';
        
        if (type === 'error') {
            borderLeft = '4px solid #EF4444';
            iconHtml = '✕';
        } else if (type === 'warning') {
            borderLeft = '4px solid #F59E0B';
            iconHtml = '⚠';
        } else if (type === 'info') {
            borderLeft = '4px solid #3B82F6';
            iconHtml = 'ℹ';
        }

        toast.style.background = bgColor;
        toast.style.color = 'var(--text-main)';
        toast.style.padding = '14px 18px';
        toast.style.borderRadius = '12px';
        toast.style.borderLeft = borderLeft;
        toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)';
        toast.style.backdropFilter = 'blur(12px)';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '12px';
        toast.style.fontSize = '14px';
        toast.style.fontWeight = '500';
        toast.style.transition = 'all 0.3s ease';

        toast.innerHTML = `
            <span class="toast-icon" style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                font-size: 11px;
                font-weight: bold;
                background-color: ${borderLeft.split(' ')[2]};
                color: #FFFFFF;
            ">${iconHtml}</span>
            <div style="flex-grow: 1;">${message}</div>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; color: var(--text-light); font-size: 16px;">&times;</button>
        `;

        container.appendChild(toast);

        // Auto remove toast
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px) scale(0.9)';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    },

    // Skeleton Generator utility for loading states
    createSkeleton: (width = '100%', height = '20px', borderRadius = '4px') => {
        const s = document.createElement('div');
        s.className = 'skeleton-pulse';
        s.style.width = width;
        s.style.height = height;
        s.style.borderRadius = borderRadius;
        s.style.background = 'linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)';
        s.style.backgroundSize = '200% 100%';
        s.style.animation = 'skeleton-loading 1.5s infinite';
        return s;
    },

    // Dialog Modals Manager
    showConfirmDialog: (title, message, confirmText = 'Confirm', cancelText = 'Cancel') => {
        return new Promise((resolve) => {
            const modalId = 'confirm-dialog-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
            modal.style.backdropFilter = 'blur(6px)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '99999';
            modal.style.padding = '20px';

            const modalContent = document.createElement('div');
            modalContent.style.background = 'var(--card-bg, #FFFFFF)';
            modalContent.style.width = '100%';
            modalContent.style.maxWidth = '420px';
            modalContent.style.borderRadius = '20px';
            modalContent.style.padding = '24px';
            modalContent.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
            modalContent.style.transform = 'scale(0.9)';
            modalContent.style.opacity = '0';
            modalContent.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

            modalContent.innerHTML = `
                <h3 style="font-size: 18px; font-weight: 700; color: var(--text-main, #0F172A); margin-bottom: 12px;">${title}</h3>
                <p style="font-size: 14px; color: var(--text-light, #64748B); line-height: 1.5; margin-bottom: 24px;">${message}</p>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="cancelConfirmBtn" style="padding: 10px 18px; border-radius: 12px; border: 1px solid var(--border-color, #E2E8F0); background: transparent; font-weight: 600; color: var(--text-main, #0F172A); font-size: 14px; cursor: pointer;">${cancelText}</button>
                    <button id="acceptConfirmBtn" style="padding: 10px 18px; border-radius: 12px; border: none; background: #16C15D; font-weight: 600; color: #FFFFFF; font-size: 14px; cursor: pointer;">${confirmText}</button>
                </div>
            `;

            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Animate In
            setTimeout(() => {
                modalContent.style.transform = 'scale(1)';
                modalContent.style.opacity = '1';
            }, 50);

            const cleanup = (value) => {
                modalContent.style.transform = 'scale(0.9)';
                modalContent.style.opacity = '0';
                setTimeout(() => {
                    modal.remove();
                    resolve(value);
                }, 200);
            };

            document.getElementById('cancelConfirmBtn').onclick = () => cleanup(false);
            document.getElementById('acceptConfirmBtn').onclick = () => cleanup(true);
            modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
        });
    },

    escapeHtml: (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]),

    /**
     * The name to display for a rider, taken only from real data.
     *
     * Returns an explicitly provisional label when the server sent no name, so
     * an unresolved rider is visibly unresolved. A generic default like
     * "Passenger" reads as a real name and is why every driver screen appeared
     * to show the same person for every customer.
     */
    riderName: (rider, fallback = 'Awaiting passenger details') => {
        if (!rider) return fallback;
        const candidates = [
            rider.passengerName,
            rider.customerName,
            rider.name,
            rider.customer && typeof rider.customer === 'object' ? rider.customer.name : null,
            rider.customerId && typeof rider.customerId === 'object' ? rider.customerId.name : null,
        ];
        for (const candidate of candidates) {
            const value = typeof candidate === 'string' ? candidate.trim() : '';
            if (value) return value;
        }
        return fallback;
    },

    riderPhone: (rider) => {
        if (!rider) return '';
        return rider.passengerPhone
            || rider.phone
            || rider.customerPhone
            || rider.customer?.userId?.phone
            || rider.customer?.phone
            || rider.customerId?.userId?.phone
            || rider.customerId?.phone
            || '';
    },

    /**
     * Initials avatar as an inline SVG data URI.
     *
     * Riders have no uploaded photo, so the screens used to point every avatar at
     * the same remote stock portrait — which made distinct passengers look like
     * one person and put a third-party request on the critical path.
     */
    initialsAvatar: (name, size = 96) => {
        const label = String(name || '').trim();
        const initials = label
            ? label.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
            : '?';
        // Deterministic hue per name so the same rider keeps the same colour.
        let hash = 0;
        for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 360;
        const hue = label ? hash : 215;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
            + `<rect width="${size}" height="${size}" rx="${size / 2}" fill="hsl(${hue} 65% 92%)"/>`
            + `<text x="50%" y="50%" dy="0.35em" text-anchor="middle"`
            + ` font-family="Poppins, Segoe UI, sans-serif" font-size="${size * 0.4}" font-weight="700"`
            + ` fill="hsl(${hue} 55% 32%)">${initials}</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },
};

// Make it available in global scope
window.UTILS = UTILS;
