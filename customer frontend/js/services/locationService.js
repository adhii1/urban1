/**
 * TORQQ Shared Mobility - Location & Geocoding Service API Interface
 */

const locationService = (() => {
    function getDelay() { return 300; }

    const PREDEFINED_BUS_STOPS = [
        { id: 'STP-01', name: 'Majestic Bus Terminal', lat: 12.9767, lng: 77.5713, corridor: 'Central Corridor' },
        { id: 'STP-02', name: 'Kempegowda Bus Station', lat: 12.9772, lng: 77.5708, corridor: 'Central Corridor' },
        { id: 'STP-03', name: 'Silk Board', lat: 12.9177, lng: 77.6238, corridor: 'ORR South Line' },
        { id: 'STP-04', name: 'Marathahalli', lat: 12.9562, lng: 77.7019, corridor: 'ORR East Line' },
        { id: 'STP-05', name: 'Whitefield', lat: 12.9698, lng: 77.7499, corridor: 'IT Corridor Line' },
        { id: 'STP-06', name: 'KR Puram', lat: 13.0012, lng: 77.6965, corridor: 'East Corridor Line' },
        { id: 'STP-07', name: 'Hebbal', lat: 13.0359, lng: 77.5970, corridor: 'Airport Line' },
        { id: 'STP-08', name: 'Yelahanka', lat: 13.1007, lng: 77.5963, corridor: 'North Corridor Line' },
        { id: 'STP-09', name: 'Electronic City', lat: 12.8452, lng: 77.6602, corridor: 'Hosur Road Line' },
        { id: 'STP-10', name: 'Banashankari', lat: 12.9255, lng: 77.5738, corridor: 'South Corridor Line' },
        { id: 'STP-11', name: 'Jayanagar', lat: 12.9299, lng: 77.5824, corridor: 'South Corridor Line' },
        { id: 'STP-12', name: 'BTM Layout', lat: 12.9166, lng: 77.6101, corridor: 'ORR South Line' },
        { id: 'STP-13', name: 'Koramangala', lat: 12.9352, lng: 77.6245, corridor: 'Central-East Corridor' },
        { id: 'STP-14', name: 'Indiranagar', lat: 12.9784, lng: 77.6408, corridor: 'East Corridor Line' },
        { id: 'STP-15', name: 'MG Road', lat: 12.9756, lng: 77.6066, corridor: 'Central Corridor' },
        { id: 'STP-16', name: 'Shivajinagar', lat: 12.9857, lng: 77.6057, corridor: 'Central Corridor' },
        { id: 'STP-17', name: 'Mysore Road', lat: 12.9554, lng: 77.5348, corridor: 'West Corridor Line' },
        { id: 'STP-18', name: 'Kengeri', lat: 12.9081, lng: 77.4854, corridor: 'West Corridor Line' },
        { id: 'STP-19', name: 'HSR Layout', lat: 12.9116, lng: 77.6389, corridor: 'ORR South Line' }
    ];

    // Search known stops first, then fall back to real place search via
    // OpenStreetMap Nominatim (free, no API key required).
    async function searchStops(query = '') {
        const q = (query || '').toLowerCase().trim();
        if (!q) return { success: true, count: 0, data: [] };

        // 1. Match predefined stops
        const stopMatches = PREDEFINED_BUS_STOPS
            .filter(s => s.name.toLowerCase().includes(q) || s.corridor.toLowerCase().includes(q));

        // 2. Real place search (Nominatim), restricted to India
        let placeMatches = [];
        if (q.length >= 3) {
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=6`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const data = await res.json();
                placeMatches = (data || []).map((p, i) => ({
                    id: `OSM-${p.place_id || i}`,
                    name: p.display_name,
                    lat: parseFloat(p.lat),
                    lng: parseFloat(p.lon),
                    corridor: 'Search result',
                }));
            } catch { /* ignore network errors, fall back to stops only */ }
        }

        const combined = [...stopMatches, ...placeMatches];
        return { success: true, count: combined.length, data: combined };
    }

    // Real GPS current location + reverse geocode to a human address.
    async function detectCurrentLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ success: false, message: 'Geolocation not supported', data: null });
                return;
            }
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                    try {
                        const res = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                            { headers: { 'Accept-Language': 'en' } }
                        );
                        const data = await res.json();
                        if (data?.display_name) address = data.display_name;
                    } catch { /* keep coordinate string */ }
                    resolve({ success: true, data: { address, lat, lng } });
                },
                () => resolve({ success: false, message: 'Could not get your location. Allow location access and try again.', data: null }),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    // Geocode a free-typed address to coordinates. Checks predefined stops
    // first, then Nominatim. Returns { lat, lng } or null.
    async function geocodeAddress(address) {
        if (!address) return null;
        const match = PREDEFINED_BUS_STOPS.find(s => s.name === address);
        if (match) return { lat: match.lat, lng: match.lng };
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=in&limit=1`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } catch { /* ignore */ }
        return null;
    }

    return {
        PREDEFINED_BUS_STOPS,
        searchStops,
        detectCurrentLocation,
        geocodeAddress,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = locationService;
}
