// TORQQ Driver Earnings & Payouts API Client (Connected to Backend)

var API_BASE_URL = 'http://localhost:4000/api/v1';

function getAuthHeaders() {
    const token = localStorage.getItem('driverToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

const EARNING_API = {
    getEarnings: () => {
        console.log("🔌 [API] Calling GET /api/v1/drivers/earnings");
        return fetch(`${API_BASE_URL}/drivers/earnings`, {
            method: 'GET',
            headers: getAuthHeaders()
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'Failed to fetch earnings'); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                if (window.STATE) {
                    window.STATE.setState('wallet', {
                        balance: data.data.walletBalance,
                        transactions: data.data.transactions,
                        pendingSettlement: data.data.pendingSettlement
                    });
                }
                return { success: true, earnings: data.data };
            } else {
                throw new Error(data.message || 'Earnings fetch failed.');
            }
        });
    },

    requestWithdrawal: (amount) => {
        console.log(`🔌 [API] Calling POST /api/v1/drivers/wallet/withdraw for: ₹${amount}`);
        return fetch(`${API_BASE_URL}/drivers/wallet/withdraw`, {
            method: 'POST',
            headers: getAuthHeaders(),
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
