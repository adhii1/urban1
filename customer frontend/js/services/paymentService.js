/**
 * TORQQ Shared Mobility - Payment Gateway & Invoicing Service API Interface
 */

const paymentService = (() => {
    function getDelay() { return 450; }

    async function processPayment(paymentDetails) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate 95% success rate or forced failure test
                if (paymentDetails.simulateFailure) {
                    reject({ success: false, code: 'PAYMENT_DECLINED', message: 'Payment declined by issuing bank. Please retry or pick another method.' });
                } else {
                    resolve({
                        success: true,
                        transactionId: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
                        amount: paymentDetails.amount || 160.00,
                        method: paymentDetails.method || 'TORQQ Pass',
                        timestamp: new Date().toISOString(),
                        receiptUrl: `/receipts/TXN-${Date.now()}.pdf`
                    });
                }
            }, getDelay() + 300);
        });
    }

    async function getTransactions() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const txns = [
                    { id: 'TXN-984102', date: '2026-07-21', description: 'Flexy Pass Ride Booking (TRQ-BK-8841)', amount: -160.00, status: 'Completed', type: 'debit' },
                    { id: 'TXN-984090', date: '2026-07-18', description: 'TORQQ Wallet Top-Up (UPI)', amount: +1000.00, status: 'Completed', type: 'credit' },
                    { id: 'TXN-984001', date: '2026-07-15', description: 'Weekdays Pass 5-Day Activation', amount: -750.00, status: 'Completed', type: 'debit' }
                ];
                resolve({ success: true, count: txns.length, data: txns });
            }, getDelay());
        });
    }

    return {
        processPayment,
        getTransactions
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = paymentService;
}
