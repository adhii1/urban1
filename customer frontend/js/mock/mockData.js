/**
 * TORQQ Shared Mobility - Centralized Mock Data Store
 */

const TORQQ_MOCK_DATA = (() => {
    const drivers = [
        {
            id: 'DRV-1001',
            name: 'Rajesh Kumar',
            phone: '+91 98765 43210',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
            rating: 4.85,
            tripsCount: 1420,
            status: 'online',
            breakStatus: false,
            vehicle: {
                id: 'VEH-501',
                model: 'Tata Tigor EV Express',
                number: 'KA-05-EV-1284',
                color: 'Emerald White',
                batteryLevel: 88,
                healthStatus: 'Excellent',
                fuelType: 'EV'
            },
            currentLocation: { lat: 12.9352, lng: 77.6245, address: 'HSR Layout Sector 4, Bangalore' }
        },
        {
            id: 'DRV-1002',
            name: 'Suresh Menon',
            phone: '+91 98123 45678',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250',
            rating: 4.92,
            tripsCount: 890,
            status: 'in_trip',
            breakStatus: false,
            vehicle: {
                id: 'VEH-502',
                model: 'Hyundai Kona EV',
                number: 'KA-01-EQ-9021',
                color: 'Midnight Blue',
                batteryLevel: 64,
                healthStatus: 'Good',
                fuelType: 'EV'
            },
            currentLocation: { lat: 12.9716, lng: 77.5946, address: 'MG Road Metro Station, Bangalore' }
        },
        {
            id: 'DRV-1003',
            name: 'Anand Sharma',
            phone: '+91 97654 32109',
            avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250',
            rating: 4.78,
            tripsCount: 2150,
            status: 'on_break',
            breakStatus: true,
            vehicle: {
                id: 'VEH-503',
                model: 'Mahindra XUV400 EV',
                number: 'KA-03-MX-4410',
                color: 'Stealth Black',
                batteryLevel: 42,
                healthStatus: 'Requires Service Soon',
                fuelType: 'EV'
            },
            currentLocation: { lat: 12.9279, lng: 77.6271, address: 'Koramangala 5th Block, Bangalore' }
        }
    ];

    const passengers = [
        { id: 'PSG-201', name: 'Adhikshitha V.', phone: '+91 98800 11223', pickupStop: 'Silk Board Junction', dropStop: 'Electronic City Phase 1', seatCount: 1, status: 'Boarded' },
        { id: 'PSG-202', name: 'Rahul Verma', phone: '+91 99011 22334', pickupStop: 'Agara Flyover Bus Stop', dropStop: 'Bellandur EcoSpace', seatCount: 1, status: 'Waiting' },
        { id: 'PSG-203', name: 'Priya Sundaram', phone: '+91 97411 55667', pickupStop: 'HSR Layout 14th Main', dropStop: 'Marathahalli Innovative Multiplex', seatCount: 2, status: 'Boarded' }
    ];

    const bookings = [
        {
            id: 'TRQ-BK-8841',
            bookingModel: 'flexy',
            modelLabel: 'Stop to Stop (Flexy)',
            pickup: 'HSR Layout Sector 4, Bangalore',
            destination: 'Electronic City Phase 1, IT Park',
            date: '2026-07-21',
            time: '14:30',
            passengersCount: 1,
            estimatedFare: 160.00,
            paymentStatus: 'success',
            paymentMethod: 'TORQQ Pass (1 Pass Used)',
            currentStageIndex: 4, // 0-based: Driver Assigned
            stage: 'DRIVER_ASSIGNED',
            stageLabel: 'Driver Assigned',
            driver: drivers[0],
            vehicle: drivers[0].vehicle,
            distanceKm: 12.4,
            etaMinutes: 18,
            pickupOrder: 1,
            dropOrder: 2,
            routeSummary: 'Outer Ring Rd → Hosur Rd Corridor',
            coPassengers: passengers,
            createdAt: '2026-07-21T11:45:00Z'
        },
        {
            id: 'TRQ-BK-7729',
            bookingModel: 'hybrid',
            modelLabel: 'Stop to Stop (Hybrid)',
            pickup: 'Koramangala 8th Block',
            destination: 'Prestige Tech Park, Outer Ring Rd',
            date: '2026-07-22',
            time: '08:45',
            passengersCount: 1,
            estimatedFare: 450.00,
            paymentStatus: 'success',
            paymentMethod: 'TORQQ Pass Balance (3 Passes Activated)',
            currentStageIndex: 0,
            stage: 'RECEIVED',
            stageLabel: 'Booking Received',
            driver: drivers[1],
            vehicle: drivers[1].vehicle,
            distanceKm: 9.8,
            etaMinutes: 25,
            pickupOrder: 2,
            dropOrder: 1,
            routeSummary: 'Sarjapur Rd → ORR Bypass',
            coPassengers: [],
            createdAt: '2026-07-20T18:20:00Z'
        },
        {
            id: 'TRQ-BK-6610',
            bookingModel: 'weekdays',
            modelLabel: 'Stop to Stop (Weekdays)',
            pickup: 'Indiranagar 100ft Road Stop',
            destination: 'Manyata Tech Park, Nagavara',
            date: '2026-07-21',
            time: '09:00',
            passengersCount: 1,
            estimatedFare: 750.00,
            paymentStatus: 'success',
            paymentMethod: 'TORQQ Pass Balance (5 Passes Activated/Wk)',
            currentStageIndex: 9, // Trip Completed
            stage: 'COMPLETED',
            stageLabel: 'Trip Completed',
            driver: drivers[2],
            vehicle: drivers[2].vehicle,
            distanceKm: 14.2,
            etaMinutes: 0,
            pickupOrder: 1,
            dropOrder: 1,
            routeSummary: '100ft Rd → Old Airport Rd → Outer Ring Rd',
            coPassengers: [],
            createdAt: '2026-07-21T08:30:00Z'
        }
    ];

    const notifications = [
        { id: 'NTF-1', type: 'booking_confirmed', title: 'Booking Confirmed', message: 'Your Flexy ride TRQ-BK-8841 is confirmed for 14:30.', timestamp: '10 mins ago', read: false },
        { id: 'NTF-2', type: 'driver_arriving', title: 'Driver On The Way', message: 'Rajesh Kumar (KA-05-EV-1284) is 5 mins away from pickup.', timestamp: '2 mins ago', read: false },
        { id: 'NTF-3', type: 'payment_success', title: 'Pass Payment Success', message: '1 TORQQ Pass successfully deducted for trip TRQ-BK-8841.', timestamp: '15 mins ago', read: true },
        { id: 'NTF-4', type: 'offer', title: 'Hybrid Pass Offer', message: 'Upgrade to 5-day Weekdays Pass & get 20% cashback in TORQQ Wallet.', timestamp: '2 hours ago', read: true },
        { id: 'NTF-5', type: 'system_announcement', title: 'Corridor Expansion', message: 'New bus stop nodes added along Outer Ring Road Silkboard-Whitefield line.', timestamp: '1 day ago', read: true }
    ];

    const analyticsStats = {
        driversOnline: 48,
        activeTrips: 34,
        waitingRequests: 12,
        activeSos: 0,
        todayRevenue: 28450.00,
        weeklyMargin: 142800.00,
        seatUtilizationPct: 84.5,
        cancellationRatePct: 2.1,
        peakHoursData: [
            { hour: '07:00', trips: 14 },
            { hour: '08:00', trips: 38 },
            { hour: '09:00', trips: 62 },
            { hour: '10:00', trips: 45 },
            { hour: '17:00', trips: 58 },
            { hour: '18:00', trips: 74 },
            { hour: '19:00', trips: 49 }
        ],
        revenueTrend: [
            { day: 'Mon', revenue: 24500 },
            { day: 'Tue', revenue: 28450 },
            { day: 'Wed', revenue: 31200 },
            { day: 'Thu', revenue: 29800 },
            { day: 'Fri', revenue: 35100 }
        ]
    };

    return {
        drivers,
        passengers,
        bookings,
        notifications,
        analyticsStats
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TORQQ_MOCK_DATA;
}
