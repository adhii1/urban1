// TORQQ Driver Earnings & Payouts API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return token
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

const EARNING_API = {
    getEarnings: (period = 'all') => {
        console.log("🔌 [API] Calling GET /api/v1/driver/earnings");
        return fetch(`${API_BASE_URL}/driver/earnings?period=${period}`, {
            method: 'GET',
            headers: getAuthHeaders(), credentials: "include"
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch earnings'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                const e = data.data || {};
                if (window.STATE) {
                    window.STATE.setState('wallet', {
                        balance: e.totalEarnings || 0,
                        transactions: e.transactions || [],
                        pendingSettlement: e.pendingSettlement || 0
                    });
                    window.STATE.setState('earnings', {
                        totalEarnings: e.totalEarnings || 0,
                        totalTrips: e.totalTrips || 0,
                        totalDistance: e.totalDistance || 0,
                        totalDuration: e.totalDuration || 0,
                        period: e.period || 'today'
                    });
                }
                // Trigger dashboard KPI refresh if available
                if (typeof window.updateMetricsValues === 'function') {
                    window.updateMetricsValues();
                }
                return { success: true, earnings: e };
            } else {
                throw new Error(data.message || 'Earnings fetch failed.');
            }
        });
    },

    requestWithdrawal: (amount) => {
        console.log(`🔌 [API] Calling POST /api/v1/driver/wallet/withdraw for: ₹${amount}`);
        return fetch(`${API_BASE_URL}/driver/wallet/withdraw`, {
            method: 'POST',
            headers: getAuthHeaders(), credentials: "include",
            body: JSON.stringify({ amount })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to process withdrawal request'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                return EARNING_API.getEarnings().then(() => {
                    return { 
                        success: true, 
                        message: data.message || `Payout of ₹${amount} initiated successfully!`,
                        transaction: data.data.transaction
                    };
                });
            } else {
                throw new Error(data.message || 'Withdrawal failed.');
            }
        });
    }
};

window.EARNING_API = EARNING_API;
