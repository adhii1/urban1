/**
 * TORQQ Customer Decoupled Map Component
 * Implements drawing interface on HTML5 Canvas.
 * Can be swapped out for Google Maps / Mapbox SDK without breaking GPS/Tracking services.
 */

class TorqqCustomerMapComponent {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Map Canvas #${canvasId} not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Coordinates and paths (expressed in Lat/Lng)
        this.driverPos = null;
        this.customerPos = null;
        this.targetType = 'pickup'; // 'pickup' or 'drop'
        this.routePath = []; // Array of { lat, lng }

        // Setup resize
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Animation timing
        this.pulse = 0;
        this.animationId = null;
        this.animate();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || 600;
        this.canvas.height = rect.height || 400;
        this.draw();
    }

    // Replaceable SDK method equivalent: Update markers
    updatePositions(driverPos, customerPos, targetType = 'pickup') {
        this.driverPos = driverPos;
        this.customerPos = customerPos;
        this.targetType = targetType;
        this.draw();
    }

    // Replaceable SDK method equivalent: Draw route
    setRoutePath(pathArray) {
        this.routePath = pathArray || [];
        this.draw();
    }

    centerMap() {
        console.log("🗺️ [Customer Map] Re-centering viewport around driver & customer.");
        this.draw();
    }

    // Mapping utility to convert Lat/Lng into Canvas pixel coordinates
    getPixelCoords(lat, lng) {
        if (!this.driverPos) {
            return { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        }

        // Center map around midpoint of driver and customer
        let centerLat = this.driverPos.latitude;
        let centerLng = this.driverPos.longitude;

        if (this.customerPos) {
            centerLat = (this.driverPos.latitude + this.customerPos.latitude) / 2;
            centerLng = (this.driverPos.longitude + this.customerPos.longitude) / 2;
        }

        const w = this.canvas.width;
        const h = this.canvas.height;

        // Dynamic scale factor: fit both markers inside screen
        let scale = 14000;
        if (this.customerPos) {
            const dLat = Math.abs(this.customerPos.latitude - this.driverPos.latitude);
            const dLng = Math.abs(this.customerPos.longitude - this.driverPos.longitude);
            const maxDelta = Math.max(dLat, dLng);
            if (maxDelta > 0.002) {
                scale = Math.min(14000, (h * 0.35) / maxDelta);
            }
        }

        const x = w / 2 + (lng - centerLng) * scale * Math.cos(centerLat * Math.PI / 180);
        const y = h / 2 - (lat - centerLat) * scale;

        return { x, y };
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // 1. Background Style (Premium Light Canvas)
        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(0, 0, w, h);

        // 2. Street Grid Lines
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // 3. Draw Route Path Polyline
        if (this.routePath.length > 1) {
            // Glow layer
            ctx.strokeStyle = 'rgba(29, 185, 84, 0.15)'; // clr-primary-green lightened
            ctx.lineWidth = 8;
            ctx.beginPath();
            let firstPt = this.getPixelCoords(this.routePath[0].lat, this.routePath[0].lng);
            ctx.moveTo(firstPt.x, firstPt.y);
            for (let i = 1; i < this.routePath.length; i++) {
                let pt = this.getPixelCoords(this.routePath[i].lat, this.routePath[i].lng);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();

            // Core Line
            ctx.strokeStyle = '#1DB954'; // --clr-primary-green
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -((Date.now() / 80) % 24);
            ctx.beginPath();
            ctx.moveTo(firstPt.x, firstPt.y);
            for (let i = 1; i < this.routePath.length; i++) {
                let pt = this.getPixelCoords(this.routePath[i].lat, this.routePath[i].lng);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.setLineDash([]); // Reset
        }

        // 4. Customer Marker
        if (this.customerPos) {
            const custPixel = this.getPixelCoords(this.customerPos.latitude, this.customerPos.longitude);
            const pulseRadius = 12 + Math.sin(this.pulse) * 6;

            // Pulsing Ring
            ctx.fillStyle = 'rgba(37, 99, 235, 0.15)'; // clr-primary-blue lightened
            ctx.beginPath();
            ctx.arc(custPixel.x, custPixel.y, pulseRadius, 0, Math.PI * 2);
            ctx.fill();

            // Inner Pin Dot
            ctx.fillStyle = '#2563EB'; // --clr-primary-blue
            ctx.beginPath();
            ctx.arc(custPixel.x, custPixel.y, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(custPixel.x, custPixel.y, 6, 0, Math.PI * 2);
            ctx.stroke();

            // Text Label Box
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 8;

            const text = this.targetType === 'pickup' ? "YOUR PICKUP STOP" : "YOUR DESTINATION";
            ctx.font = 'bold 9px Poppins';
            const textWidth = ctx.measureText(text).width;
            const rectW = textWidth + 16;
            const rectH = 20;
            const rx = custPixel.x - rectW / 2;
            const ry = custPixel.y - 30;

            ctx.beginPath();
            ctx.roundRect(rx, ry, rectW, rectH, 6);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.stroke();

            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, custPixel.x, ry + rectH / 2);
        }

        // 5. Driver Vehicle Marker
        if (this.driverPos) {
            const driverPixel = this.getPixelCoords(this.driverPos.latitude, this.driverPos.longitude);

            ctx.shadowColor = 'rgba(29, 185, 84, 0.4)';
            ctx.shadowBlur = 10;

            // Directed bearing ring
            ctx.strokeStyle = 'rgba(29, 185, 84, 0.3)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(driverPixel.x, driverPixel.y, 14, 0, Math.PI * 2);
            ctx.stroke();

            // Vehicle Center
            ctx.fillStyle = '#1DB954';
            ctx.beginPath();
            ctx.arc(driverPixel.x, driverPixel.y, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(driverPixel.x, driverPixel.y, 9, 0, Math.PI * 2);
            ctx.stroke();

            // Center core
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(driverPixel.x, driverPixel.y, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
        }
    }

    animate() {
        this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

window.TorqqCustomerMapComponent = TorqqCustomerMapComponent;
window.TorqqMapComponent = TorqqCustomerMapComponent; // unified naming compatibility
