// TORQQ Driver Map Component
// Uses HTML5 Canvas to draw a premium, real-time animated vector map
// Exposes API methods ready for Google Maps / Mapbox replacement

class TorqqMap {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Map container #${containerId} not found.`);
            return;
        }

        // Initialize Canvas
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        // Map States
        this.theme = localStorage.getItem('torqq_driver_theme') || 'light';
        this.driverLocation = { x: 120, y: 350 };
        this.passengerLocations = [
            { x: 380, y: 120, type: 'pickup', pulse: 0 },
            { x: 550, y: 220, type: 'drop', pulse: 0 }
        ];
        this.routePoints = [];
        this.etaString = "5 mins";
        
        // Bind events & sizes
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Listen for Theme Toggles
        window.addEventListener('stateChanged_theme', (e) => {
            this.theme = e.detail;
            this.draw();
        });
        
        // Start Render & Animation Loops
        this.animationFrameId = null;
        this.animate();
        
        console.log("🗺️ [Map] Component initialized in container: " + containerId);
    }

    // Set canvas dimensions based on parent container
    resize() {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width || 600;
        this.canvas.height = rect.height || 400;
        this.generateMockRoute();
        this.draw();
    }

    // Generate a set of bezier curve points to represent roads
    generateMockRoute() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        this.driverLocation = { x: w * 0.15, y: h * 0.75 };
        this.passengerLocations = [
            { x: w * 0.50, y: h * 0.35, label: "Pickup: Indiranagar", type: 'pickup', pulse: 0 },
            { x: w * 0.85, y: h * 0.20, label: "Drop: Manyata Tech Park", type: 'drop', pulse: 0 }
        ];

        // Draw a path from Driver -> Pickup -> Drop
        this.routePoints = [
            this.driverLocation,
            { x: w * 0.25, y: h * 0.65 },
            { x: w * 0.38, y: h * 0.60 },
            { x: w * 0.42, y: h * 0.45 },
            this.passengerLocations[0], // Pickup
            { x: w * 0.60, y: h * 0.30 },
            { x: w * 0.72, y: h * 0.38 },
            this.passengerLocations[1]  // Drop
        ];
    }

    // API: Update vehicle position
    updateDriverLocation(lat, lng) {
        // Here we map mock coordinates to canvas coordinates
        // Simulate vehicle movement towards pickup point
        const target = this.passengerLocations[0];
        const dx = target.x - this.driverLocation.x;
        const dy = target.y - this.driverLocation.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > 5) {
            this.driverLocation.x += (dx / dist) * 1.8;
            this.driverLocation.y += (dy / dist) * 1.8;
        } else {
            // Already arrived, drift around pickup
            this.driverLocation.x += (Math.random() - 0.5) * 0.5;
            this.driverLocation.y += (Math.random() - 0.5) * 0.5;
        }
        this.routePoints[0] = this.driverLocation;
    }

    // API: Update passengers marker positions
    updatePassengerLocations(locationsArray) {
        // Update mock location objects
        this.draw();
    }

    // API: Recalculate route pathing
    drawRoute(pointsArray) {
        // Redraw route line on canvas
        this.draw();
    }

    // API: Update ETA text in layout
    updateETA(eta) {
        this.etaString = eta;
        this.draw();
    }

    // API: Center view
    centerMap() {
        console.log("🗺️ [Map] Centered map display around Driver");
        this.draw();
    }

    // Render loop
    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const isDark = this.theme === 'dark';

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        // 1. Background Fill (Sleek Map Styles)
        ctx.fillStyle = isDark ? '#0F172A' : '#F8FAFC';
        ctx.fillRect(0, 0, w, h);

        // 2. Draw styled Grid lines (representing street coordinates blocks)
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // 3. Draw abstract roads (mock city structure)
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const roads = [
            [{x: 0, y: h * 0.5}, {x: w, y: h * 0.5}],
            [{x: w * 0.3, y: 0}, {x: w * 0.3, y: h}],
            [{x: w * 0.7, y: 0}, {x: w * 0.7, y: h}],
            [{x: 0, y: h * 0.2}, {x: w, y: h * 0.2}],
            [{x: 0, y: h * 0.8}, {x: w, y: h * 0.8}]
        ];
        
        roads.forEach(r => {
            ctx.beginPath();
            ctx.moveTo(r[0].x, r[0].y);
            ctx.lineTo(r[1].x, r[1].y);
            ctx.stroke();
        });

        // 4. Draw Active Route Glow Path
        if (this.routePoints.length > 1) {
            // Under-path glow
            ctx.strokeStyle = 'rgba(22, 193, 93, 0.15)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(this.routePoints[0].x, this.routePoints[0].y);
            for (let i = 1; i < this.routePoints.length; i++) {
                ctx.lineTo(this.routePoints[i].x, this.routePoints[i].y);
            }
            ctx.stroke();

            // Core green route line
            ctx.strokeStyle = '#16C15D';
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 4]); // Animated dashed road pattern
            ctx.lineDashOffset = -((Date.now() / 80) % 24);
            ctx.beginPath();
            ctx.moveTo(this.routePoints[0].x, this.routePoints[0].y);
            for (let i = 1; i < this.routePoints.length; i++) {
                ctx.lineTo(this.routePoints[i].x, this.routePoints[i].y);
            }
            ctx.stroke();
            ctx.setLineDash([]); // Reset
        }

        // 5. Draw Passenger Pickup & Drop Points
        this.passengerLocations.forEach(loc => {
            loc.pulse = (loc.pulse + 0.05) % (Math.PI * 2);
            const pulseRadius = 12 + Math.sin(loc.pulse) * 6;
            
            // Outer Pulsating Glow
            ctx.fillStyle = loc.type === 'pickup' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
            ctx.beginPath();
            ctx.arc(loc.x, loc.y, pulseRadius, 0, Math.PI * 2);
            ctx.fill();

            // Inner Dot
            ctx.fillStyle = loc.type === 'pickup' ? '#22C55E' : '#EF4444';
            ctx.beginPath();
            ctx.arc(loc.x, loc.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // Border ring
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(loc.x, loc.y, 6, 0, Math.PI * 2);
            ctx.stroke();

            // Label Box
            ctx.fillStyle = isDark ? '#1E293B' : '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 8;
            
            // Rounded Label Rectangle
            const textWidth = ctx.measureText(loc.label).width;
            const rectW = textWidth + 16;
            const rectH = 22;
            const rx = loc.x - rectW/2;
            const ry = loc.y - 32;

            ctx.beginPath();
            ctx.roundRect(rx, ry, rectW, rectH, 6);
            ctx.fill();
            ctx.shadowBlur = 0; // Reset shadow

            // Border for label
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label text
            ctx.fillStyle = isDark ? '#E2E8F0' : '#0F172A';
            ctx.font = 'bold 9px Poppins';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(loc.label || "Stop", loc.x, ry + rectH/2);
        });

        // 6. Draw Driver Car Marker
        ctx.shadowColor = 'rgba(22, 193, 93, 0.4)';
        ctx.shadowBlur = 10;
        
        // Outer pulsing ring
        ctx.strokeStyle = 'rgba(22, 193, 93, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.driverLocation.x, this.driverLocation.y, 14, 0, Math.PI * 2);
        ctx.stroke();

        // Car dot representation (circular dashboard style with heading arrow)
        ctx.fillStyle = '#16C15D';
        ctx.beginPath();
        ctx.arc(this.driverLocation.x, this.driverLocation.y, 9, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.driverLocation.x, this.driverLocation.y, 9, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glowing core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.driverLocation.x, this.driverLocation.y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0; // Reset
    }

    animate() {
        this.updateDriverLocation();
        this.draw();
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }
}

// Make it available in global scope
window.TorqqMap = TorqqMap;
