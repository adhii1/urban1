// TORQQ Driver Earnings and Wallet Controller
// Manages transaction tables, bank withdrawal requests, incentives charts, and referrals

let earningsData = {};

document.addEventListener('DOMContentLoaded', () => {
    // Check if on earnings page
    if (!document.getElementById('walletBalanceVal')) return;

    // Fetch initial balances
    window.EARNING_API.getEarnings()
        .then(res => {
            earningsData = res.earnings;
            
            // Sync values from state
            renderWalletDetails();
            renderTransactionsList();
            renderIncentiveBars();
            
            // Draw visual graph placeholder
            drawEarningsGraph();
        });

    setupWithdrawalTriggers();
});

// Render metrics
function renderWalletDetails() {
    const balance = document.getElementById('walletBalanceVal');
    const pending = document.getElementById('pendingSettlementVal');
    const referral = document.getElementById('referralBonusVal');

    // Load from reactive state
    const stateWallet = window.STATE.getState('wallet');
    
    if (balance) balance.textContent = window.UTILS.formatCurrency(stateWallet.balance);
    if (pending) pending.textContent = window.UTILS.formatCurrency(stateWallet.pendingSettlement);
    if (referral) referral.textContent = window.UTILS.formatCurrency(stateWallet.referralBonus);
}

// Render transaction logs
function renderTransactionsList() {
    const list = document.getElementById('transactionsTableBody');
    if (!list) return;

    const stateWallet = window.STATE.getState('wallet');
    const txns = stateWallet.transactions.length > 0 ? stateWallet.transactions : earningsData.transactions;

    if (!txns || txns.length === 0) {
        list.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-light);">No transactions logged yet.</td></tr>`;
        return;
    }

    list.innerHTML = txns.map(t => {
        const isDebit = t.amount < 0;
        const color = isDebit ? '#EF4444' : '#16C15D';
        const sign = isDebit ? '-' : '+';
        const absVal = Math.abs(t.amount);

        return `
            <tr style="border-bottom: 1px solid var(--border-color); font-size:13px;">
                <td style="padding:16px 12px; font-weight:600; color:var(--text-main);">${t.id}</td>
                <td style="padding:16px 12px; color:var(--text-main);">${t.desc}</td>
                <td style="padding:16px 12px; color:var(--text-light);">${window.UTILS.formatDate(t.date)}</td>
                <td style="padding:16px 12px; font-weight:700; color:${color}; text-align:right;">
                    ${sign}${window.UTILS.formatCurrency(absVal)}
                </td>
            </tr>
        `;
    }).join('');
}

// Withdraw funds triggers
function setupWithdrawalTriggers() {
    const withdrawBtn = document.getElementById('withdrawBtn');
    if (!withdrawBtn) return;

    withdrawBtn.onclick = () => {
        const wallet = window.STATE.getState('wallet');
        
        let overlay = document.getElementById('torqqSharedModal');
        if (!overlay) return;

        const title = document.getElementById('sharedModalTitle');
        const body = document.getElementById('sharedModalBody');
        const footer = document.getElementById('sharedModalFooter');

        title.textContent = "Withdraw Funds to Bank";
        body.innerHTML = `
            <div style="margin-bottom:16px;">
                <div style="font-size:11px; color:var(--text-light);">AVAILABLE BALANCE</div>
                <div style="font-size:28px; font-weight:800; color:var(--color-primary);">${window.UTILS.formatCurrency(wallet.balance)}</div>
            </div>
            
            <div class="form-group">
                <label for="withdrawAmountInput">WITHDRAWAL AMOUNT (₹)</label>
                <input type="number" id="withdrawAmountInput" class="form-input" min="100" max="${wallet.balance}" placeholder="Enter amount to withdraw" required>
                <div style="font-size:11px; color:var(--text-light); margin-top:6px;">Minimum withdraw: ₹100.00 • Connected account: ${window.STATE.getState('currentDriver').bankDetails.accountNo}</div>
            </div>
        `;

        footer.innerHTML = `
            <button id="cancelWithdrawal" class="btn btn-secondary">Cancel</button>
            <button id="confirmWithdrawalBtn" class="btn btn-primary">Withdraw Payout</button>
        `;

        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.querySelector('.modal-dialog').style.transform = 'scale(1)';
        }, 50);

        const closeModal = () => {
            overlay.querySelector('.modal-dialog').style.transform = 'scale(0.95)';
            setTimeout(() => overlay.style.display = 'none', 200);
        };

        document.getElementById('cancelWithdrawal').onclick = closeModal;
        document.getElementById('sharedModalCloseBtn').onclick = closeModal;

        document.getElementById('confirmWithdrawalBtn').onclick = () => {
            const val = parseFloat(document.getElementById('withdrawAmountInput').value);
            if (isNaN(val) || val < 100 || val > wallet.balance) {
                window.UTILS.showToast("Please enter a valid amount within your limits.", "error");
                return;
            }

            // Call API
            window.EARNING_API.requestWithdrawal(val)
                .then(res => {
                    closeModal();
                    window.UTILS.showToast(res.message, "success");
                    
                    // Re-render
                    renderWalletDetails();
                    renderTransactionsList();
                })
                .catch(err => {
                    window.UTILS.showToast(err.message, "error");
                });
        };
    };
}

// Render dynamic incentive cards list
function renderIncentiveBars() {
    const list = document.getElementById('incentivesProgressList');
    if (!list) return;

    const incs = window.STATE.getState('wallet').incentives;
    list.innerHTML = incs.map(i => {
        const percent = Math.min(100, (i.progress / i.target) * 100);
        
        return `
            <div class="glass-card" style="padding:16px; margin-bottom:12px; transition:none; transform:none; box-shadow:none;">
                <div class="flex-between" style="margin-bottom:6px;">
                    <div>
                        <strong style="font-size:13px; color:var(--text-main);">${i.title}</strong>
                        <div style="font-size:11px; color:var(--text-light);">${i.condition}</div>
                    </div>
                    <span class="badge ${i.status === 'Completed' ? 'badge-success' : 'badge-info'}" style="font-size:10px;">${i.status}</span>
                </div>
                
                <div style="margin-top:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; margin-bottom:4px;">
                        <span style="color:var(--text-light);">Completed: ${i.progress} / ${i.target}</span>
                        <span style="color:var(--color-primary); font-weight:700;">+${window.UTILS.formatCurrency(i.amount)}</span>
                    </div>
                    <!-- Progress Bar -->
                    <div style="width:100%; height:8px; background:var(--border-color); border-radius:10px; overflow:hidden;">
                        <div style="width:${percent}%; height:100%; background:var(--color-primary); border-radius:10px; transition:width 0.6s ease;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Draw dynamic inline SVG path graph representing earnings trends
function drawEarningsGraph() {
    const graphBox = document.getElementById('earningsGraphPlaceholder');
    if (!graphBox) return;

    // Clear
    graphBox.innerHTML = '';
    
    // Draw an SVG line chart
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", "0 0 500 200");
    svg.style.overflow = "visible";

    // Grid coordinates
    const points = [
        { x: 30, y: 160, val: "Jul 3" },
        { x: 130, y: 120, val: "Jul 4" },
        { x: 230, y: 90, val: "Jul 5" },
        { x: 330, y: 50, val: "Jul 6" },
        { x: 430, y: 100, val: "Jul 7" }
    ];

    // Gridlines
    for (let y = 30; y <= 160; y += 40) {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", "30");
        line.setAttribute("y1", y);
        line.setAttribute("x2", "470");
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "var(--border-color)");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
    }

    // Path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#16C15D");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);

    // Points markers & text labels
    points.forEach(p => {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", "5");
        c.setAttribute("fill", "#FFFFFF");
        c.setAttribute("stroke", "#16C15D");
        c.setAttribute("stroke-width", "3");
        svg.appendChild(c);

        const txt = document.createElementNS(svgNS, "text");
        txt.setAttribute("x", p.x);
        txt.setAttribute("y", "185");
        txt.setAttribute("font-size", "10");
        txt.setAttribute("font-family", "Poppins");
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("fill", "var(--text-light)");
        txt.textContent = p.val;
        svg.appendChild(txt);
    });

    graphBox.appendChild(svg);
}
