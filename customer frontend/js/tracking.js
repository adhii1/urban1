/**
 * TORQQ Shared Mobility - Customer Live GPS Tracking Module
 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('customerMapCanvas');
    const btnSos = document.getElementById('btn-sos-floating');
    const btnChat = document.getElementById('btn-chat-driver');
    const btnShare = document.getElementById('btnShareTrip');
    const btnCancel = document.getElementById('btnCancelRide');

    if (canvas) {
        const ctx = canvas.getContext('2d');
        function resizeCanvas() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        let progress = 0.2;

        function drawMap() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Background terrain
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Grid Roads
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1.5;
            for (let x = 0; x < canvas.width; x += 60) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 60) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            // Draw Route Polyline (Green glowing path)
            const p1 = { x: 80, y: canvas.height - 100 };
            const p2 = { x: canvas.width / 2, y: canvas.height / 2 };
            const p3 = { x: canvas.width - 80, y: 100 };

            ctx.shadowColor = '#16C15D';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#16C15D';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(p2.x, p2.y, p3.x, p3.y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Pickup Node (Green)
            ctx.fillStyle = '#22C55E';
            ctx.beginPath(); ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2); ctx.fill();

            // Destination Node (Red)
            ctx.fillStyle = '#EF4444';
            ctx.beginPath(); ctx.arc(p3.x, p3.y, 8, 0, Math.PI * 2); ctx.fill();

            // Animated Vehicle Marker along curve
            const t = progress;
            const curX = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * p2.x + t * t * p3.x;
            const curY = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * p2.y + t * t * p3.y;

            ctx.fillStyle = '#3B82F6';
            ctx.shadowColor = '#3B82F6';
            ctx.shadowBlur = 15;
            ctx.beginPath(); ctx.arc(curX, curY, 12, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            progress += 0.001;
            if (progress > 0.95) progress = 0.1;

            requestAnimationFrame(drawMap);
        }

        drawMap();
    }

    if (btnSos) {
        btnSos.addEventListener('click', async () => {
            if (confirm('EMERGENCY SOS ALERT:\nAre you sure you want to alert the emergency dispatch team immediately?')) {
                if (typeof driverService !== 'undefined') {
                    const res = await driverService.triggerEmergencySOS({ lat: 12.9116, lng: 77.6389 });
                    if (typeof UIComponents !== 'undefined') {
                        UIComponents.showToast(`🚨 ${res.message}`, 'error', 6000);
                    }
                }
            }
        });
    }

    if (btnChat && typeof UIComponents !== 'undefined') {
        btnChat.addEventListener('click', () => {
            UIComponents.showToast('💬 Opening live chat with driver Rajesh...', 'info');
        });
    }

    if (btnShare && typeof UIComponents !== 'undefined') {
        btnShare.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href);
            UIComponents.showToast('🔗 Live trip tracking link copied to clipboard!', 'success');
        });
    }

    if (btnCancel && typeof UIComponents !== 'undefined') {
        btnCancel.addEventListener('click', async () => {
            if (confirm('Cancel Ride:\nAre you sure you want to cancel this booking? 1 Pass will be refunded.')) {
                if (typeof bookingService !== 'undefined') {
                    await bookingService.cancelBooking('TRQ-BK-8841');
                    UIComponents.showToast('Ride cancelled. Pass refunded.', 'info');
                    setTimeout(() => window.location.href = 'dashboard.html', 1200);
                }
            }
        });
    }
});
