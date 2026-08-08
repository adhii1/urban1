/**
 * TORQQ Shared Mobility - Payment Lifecycle Screen Handler
 */

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('payment-process-root');
    if (!root) return;

    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || 'process'; // process, success, failed

    function renderProcessing() {
        root.innerHTML = `
            <div class="glass-card" style="padding:40px 24px; text-align:center; max-width:480px; margin:40px auto;">
                <div style="width:56px; height:56px; border:4px solid rgba(22,193,93,0.2); border-top-color:#16C15D; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 20px;"></div>
                <h2 style="font-size:20px; font-weight:800; margin-bottom:8px;">Processing Secure Payment</h2>
                <p style="font-size:13px; color:var(--clr-text-light); margin-bottom:24px;">Communicating with TORQQ payment gateway & bank servers. Do not close this window...</p>
                <div style="font-size:11px; font-weight:700; color:#3B82F6; background:rgba(59,130,246,0.1); padding:8px 14px; border-radius:8px; display:inline-block;">🔒 256-bit SSL Encrypted Payment Stream</div>
            </div>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
        `;

        setTimeout(async () => {
            try {
                const res = await paymentService.processPayment({ amount: 160.00, method: 'TORQQ Pass' });
                renderSuccess(res);
            } catch (err) {
                renderFailed(err);
            }
        }, 1800);
    }

    function renderSuccess(res) {
        root.innerHTML = `
            <div class="glass-card" style="padding:40px 24px; text-align:center; max-width:480px; margin:40px auto;">
                ${UIComponents.renderSuccessCheckmark()}
                <h2 style="font-size:22px; font-weight:800; color:#16C15D; margin-bottom:6px;">Payment Successful!</h2>
                <p style="font-size:13px; color:var(--clr-text-light); margin-bottom:24px;">Transaction ID: <strong>${res.transactionId}</strong></p>

                <div style="background:rgba(15,23,42,0.03); padding:16px; border-radius:12px; font-size:13px; text-align:left; margin-bottom:24px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Amount Paid:</span><strong>₹${res.amount.toFixed(2)}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Payment Method:</span><strong>${res.method}</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>Date:</span><strong>${new Date().toLocaleTimeString()}</strong></div>
                </div>

                <div style="display:flex; gap:12px; justify-content:center;">
                    <a href="ride-status.html" class="btn-redesign-primary" style="padding:10px 18px; font-size:13px;">View Ride Status →</a>
                    <button style="padding:10px 18px; background:rgba(0,0,0,0.06); font-weight:600; border-radius:10px; font-size:13px;" onclick="window.print()">Download Receipt</button>
                </div>
            </div>
        `;
    }

    function renderFailed(err) {
        root.innerHTML = `
            <div class="glass-card" style="padding:40px 24px; text-align:center; max-width:480px; margin:40px auto;">
                <div style="font-size:48px; margin-bottom:12px;">❌</div>
                <h2 style="font-size:22px; font-weight:800; color:#EF4444; margin-bottom:6px;">Payment Failed</h2>
                <p style="font-size:13px; color:var(--clr-text-light); margin-bottom:24px;">${err.message || 'Payment processing failed. Please try again.'}</p>

                <div style="display:flex; gap:12px; justify-content:center;">
                    <button class="btn-redesign-primary" style="padding:10px 20px; background:#EF4444;" onclick="location.reload()">Retry Payment</button>
                    <a href="dashboard.html" style="padding:10px 20px; background:rgba(0,0,0,0.06); font-weight:600; border-radius:10px; font-size:13px; color:var(--clr-text-main);">Return to Home</a>
                </div>
            </div>
        `;
    }

    if (mode === 'failed') renderFailed({ message: 'Simulated payment failure test' });
    else renderProcessing();
});
