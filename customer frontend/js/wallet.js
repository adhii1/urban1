/**
 * TORQQ Customer Wallet and Ledger Operations
 * Connects wallet metrics, rewards history, referral status, and refund audit details.
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    const walletBalance = document.getElementById('walletBalance');
    const rewardPoints = document.getElementById('rewardPoints');
    const transactionsContainer = document.getElementById('transactionsContainer');
    
    // Tab Elements
    const tabItems = document.querySelectorAll('.tab-item');
    const walletPanels = document.querySelectorAll('.wallet-panel');
    
    // Referrals & Coupons Elements
    const referralCodeDisplay = document.getElementById('referralCodeDisplay');
    const couponsContainer = document.getElementById('couponsContainer');
    
    // Refunds Elements
    const refundsContainer = document.getElementById('refundsContainer');

    const btnAddMoney = document.getElementById('btnAddMoney');

    // 1. Initial Load
    await loadWalletStats();
    await loadTransactionLedger();
    await loadReferralsAndRewards();
    await loadCouponsList();
    await loadRefundHistory();

    // 2. Tabs Switch Logic
    tabItems.forEach(tab => {
        tab.addEventListener('click', () => {
            tabItems.forEach(t => t.classList.remove('active'));
            walletPanels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            const targetPanel = document.getElementById(target);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    async function loadWalletStats() {
        try {
            const res = await CUSTOMER_API.getDashboard();
            if (res.success && res.data) {
                const data = res.data;
                if (walletBalance) {
                    walletBalance.textContent = `₹ ${(data.walletBalance || 0).toFixed(2)}`;
                }
            }
        } catch (err) {
            console.error('Failed to load wallet stats:', err);
        }
    }

    async function loadReferralsAndRewards() {
        try {
            // Referrals
            const refRes = await CUSTOMER_API.getReferrals();
            if (refRes.success && refRes.data) {
                const data = refRes.data;
                if (referralCodeDisplay) {
                    referralCodeDisplay.textContent = data.referralCode || 'TORQQ-CODE';
                }
            }

            // Rewards
            const rewRes = await CUSTOMER_API.getRewards();
            if (rewRes.success && rewRes.data) {
                const data = rewRes.data;
                if (rewardPoints) {
                    rewardPoints.textContent = `₹ ${(data.rewardBalance || 0).toFixed(2)}`;
                }
            }
        } catch (err) {
            console.error('Failed to load referrals and rewards:', err);
        }
    }

    async function loadCouponsList() {
        if (!couponsContainer) return;
        try {
            const res = await CUSTOMER_API.getCoupons();
            if (res.success && res.data) {
                const coupons = res.data;
                if (coupons.length === 0) {
                    couponsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">No coupon offers available right now.</p>';
                    return;
                }

                couponsContainer.innerHTML = coupons.map(coupon => {
                    const discountText = coupon.discountType === 'PERCENT' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`;
                    return `
                        <div class="coupon-card">
                            <div style="font-weight: 700; color: var(--clr-dark-navy); font-size: 15px;">
                                ${coupon.code}
                            </div>
                            <div style="font-size: 12px; font-weight: 600; color: var(--clr-primary-green); margin: 4px 0;">
                                ${discountText}
                            </div>
                            <div style="font-size: 11px; color: var(--clr-text-main);">
                                Min Fare: ₹${coupon.minFareAmount} • Category: ${coupon.category}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Failed to load coupons:', err);
        }
    }

    async function loadRefundHistory() {
        if (!refundsContainer) return;
        try {
            const res = await CUSTOMER_API.getRefunds();
            if (res.success && res.data) {
                const refunds = res.data;
                if (refunds.length === 0) {
                    refundsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">No refunds recorded.</p>';
                    return;
                }

                refundsContainer.innerHTML = refunds.map(refund => {
                    const dateStr = new Date(refund.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    const statusClass = refund.status === 'APPROVED' ? 'status-resolved' : 'status-pending';

                    return `
                        <div class="refund-card">
                            <div class="ticket-header">
                                <span class="ticket-ref">Ref: ${refund.bookingReference}</span>
                                <span class="ticket-status ${statusClass}">${refund.status}</span>
                            </div>
                            <div style="font-size: 14px; font-weight: 700; color: var(--clr-dark-navy); margin-bottom: 4px;">
                                Refund Amount: ₹${refund.amount.toFixed(2)}
                            </div>
                            <div style="font-size: 12px; color: var(--clr-text-main);">
                                Reason: ${refund.reason} • ${dateStr}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Failed to load refunds:', err);
        }
    }

    async function loadTransactionLedger() {
        if (!transactionsContainer) return;
        transactionsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">Loading transactions...</p>';

        try {
            const upcoming = await CUSTOMER_API.getBookings('upcoming');
            const history = await CUSTOMER_API.getBookings('history');

            let allBookings = [];
            if (upcoming.success && upcoming.data) allBookings = allBookings.concat(upcoming.data);
            if (history.success && history.data) allBookings = allBookings.concat(history.data);

            // Sort newest first
            allBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            if (allBookings.length === 0) {
                transactionsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">No transactions yet.</p>';
                return;
            }

            let html = '';
            // Render transactions
            allBookings.forEach(booking => {
                const dateStr = new Date(booking.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const isCancelled = booking.status === 'CANCELLED';

                if (isCancelled) {
                    html += `
                        <div class="transaction-item" style="margin-bottom: 12px;">
                            <div class="tx-icon tx-refund" style="background: #E2E8F0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin-right: 12px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12A10 10 0 1 1 22 12A10 10 0 1 1 2 12"></path><path d="M12 8L12 12L14 14"></path></svg>
                            </div>
                            <div class="tx-details" style="flex: 1;">
                                <h4 style="font-size: 13px; font-weight: 600;">Refund Processed (Cancelled)</h4>
                                <p style="font-size: 11px; color: var(--clr-text-light);">Ref: ${booking.bookingReference} • ${dateStr}</p>
                            </div>
                            <div class="tx-amount text-green" style="font-weight: 700; color: #22c55e;">+ ₹${booking.fare}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="transaction-item" style="margin-bottom: 12px;">
                            <div class="tx-icon tx-deduct" style="background: #E2E8F0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin-right: 12px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                            </div>
                            <div class="tx-details" style="flex: 1;">
                                <h4 style="font-size: 13px; font-weight: 600;">Commute Ride Debited</h4>
                                <p style="font-size: 11px; color: var(--clr-text-light);">Ref: ${booking.bookingReference} • ${dateStr}</p>
                            </div>
                            <div class="tx-amount" style="font-weight: 700;">- ₹${booking.fare}</div>
                        </div>
                    `;
                }
            });

            transactionsContainer.innerHTML = html;

        } catch (err) {
            transactionsContainer.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 16px 0;">Failed to load ledger: ${err.message}</p>`;
        }
    }

    if (btnAddMoney) {
        btnAddMoney.addEventListener('click', () => {
            alert('Add Money portal integrated in Milestone 5.');
        });
    }
});
