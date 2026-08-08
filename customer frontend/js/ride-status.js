/**
 * TORQQ Shared Mobility - Ride Status 10-Stage Dynamic Timeline Component
 */

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('ride-status-root');
    const stages = TORQQ_CONSTANTS ? TORQQ_CONSTANTS.BOOKING_STAGES : [];
    let currentStageIndex = 3; // Default to "Driver Assigned" (Stage 4)
    let autoInterval = null;

    const bookingRes = await bookingService.getBookingById('TRQ-BK-8841');
    const booking = bookingRes.data;

    function render() {
        if (!root) return;

        const currentStage = stages[currentStageIndex];

        root.innerHTML = `
            <!-- Current Status Hero Banner -->
            <div class="glass-card" style="margin-bottom:24px; padding:24px; background:linear-gradient(135deg, #0F172A 0%, #1E293B 100%); color:#FFFFFF;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <div>
                        <span style="font-size:12px; color:#16C15D; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Active Trip Status</span>
                        <h2 style="font-size:22px; font-weight:800; margin-top:2px;">${currentStage.label}</h2>
                    </div>
                    <span style="background:rgba(22,193,93,0.2); color:#16C15D; font-size:12px; font-weight:700; padding:6px 14px; border-radius:20px;">
                        Stage ${currentStage.step} of 10
                    </span>
                </div>

                <div style="font-size:13px; color:#94A3B8; margin-bottom:16px;">
                    Ride ID: <strong style="color:#FFF;">${booking.id}</strong> | Model: <strong style="color:#FFF;">${booking.modelLabel}</strong>
                </div>

                <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px;">
                    <div>📍 Pickup: <strong>${booking.pickup}</strong></div>
                    <div>🎯 Drop: <strong>${booking.destination}</strong></div>
                </div>
            </div>

            <!-- Dynamic 10-Stage Timeline Card -->
            <div class="glass-card" style="padding:24px; margin-bottom:24px;">
                <h3 style="font-size:16px; font-weight:700; margin-bottom:20px;">Progress Lifecycle Timeline</h3>
                <div style="display:flex; flex-direction:column; gap:20px; position:relative; padding-left:12px;">
                    ${stages.map((stg, idx) => {
                        const isDone = idx < currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        const isPending = idx > currentStageIndex;

                        return `
                            <div style="display:flex; gap:16px; align-items:flex-start; opacity:${isPending ? 0.45 : 1}; transition:all 0.3s ease;">
                                <div style="width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; background:${isDone ? '#16C15D' : isCurrent ? '#3B82F6' : 'rgba(0,0,0,0.08)'}; color:${isDone || isCurrent ? '#FFF' : 'var(--clr-text-light)'}; box-shadow:${isCurrent ? '0 0 0 4px rgba(59,130,246,0.2)' : 'none'}; flex-shrink:0;">
                                    ${isDone ? '✓' : stg.step}
                                </div>
                                <div style="flex:1; padding-top:4px;">
                                    <div style="font-weight:700; font-size:14px; color:var(--clr-text-main);">${stg.label}</div>
                                    <div style="font-size:12px; color:var(--clr-text-light); margin-top:2px;">
                                        ${isCurrent ? 'Current stage in progress...' : isDone ? 'Completed' : 'Pending stage'}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Dynamic Quick Actions -->
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
                <a href="active-ride.html" class="btn-redesign-primary" style="flex:1; text-align:center; padding:12px 18px;">
                    View Active Ride Card →
                </a>
                <a href="tracking.html" style="flex:1; text-align:center; padding:12px 18px; background:rgba(59,130,246,0.1); color:#3B82F6; font-weight:700; border-radius:12px;">
                    Open Live GPS Tracking →
                </a>
            </div>
        `;
    }

    document.getElementById('sim-prev-btn').addEventListener('click', () => {
        if (currentStageIndex > 0) {
            currentStageIndex--;
            render();
        }
    });

    document.getElementById('sim-next-btn').addEventListener('click', () => {
        if (currentStageIndex < stages.length - 1) {
            currentStageIndex++;
            render();
        }
    });

    document.getElementById('sim-auto-btn').addEventListener('click', () => {
        if (autoInterval) {
            clearInterval(autoInterval);
            autoInterval = null;
            document.getElementById('sim-auto-btn').textContent = 'Auto Auto-Play';
        } else {
            document.getElementById('sim-auto-btn').textContent = 'Pause Auto-Play';
            autoInterval = setInterval(() => {
                if (currentStageIndex < stages.length - 1) {
                    currentStageIndex++;
                    render();
                } else {
                    clearInterval(autoInterval);
                    autoInterval = null;
                    document.getElementById('sim-auto-btn').textContent = 'Auto Auto-Play';
                }
            }, 1800);
        }
    });

    render();
});
