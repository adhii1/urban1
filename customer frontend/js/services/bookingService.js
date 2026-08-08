/**
 * TORQQ Shared Mobility - Booking Service API Interface
 */

const bookingService = (() => {
    function getDelay() {
        return (typeof TORQQ_CONSTANTS !== 'undefined' && TORQQ_CONSTANTS.DEFAULT_SIMULATED_DELAY_MS) || 350;
    }

    async function getBookings(filters = {}) {
        return new Promise((resolve) => {
            setTimeout(() => {
                let data = [...(TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.bookings : [])];
                if (filters.status) {
                    data = data.filter(b => b.paymentStatus === filters.status || b.stage === filters.status);
                }
                if (filters.search) {
                    const q = filters.search.toLowerCase();
                    data = data.filter(b => b.id.toLowerCase().includes(q) || b.pickup.toLowerCase().includes(q) || b.destination.toLowerCase().includes(q));
                }
                resolve({ success: true, count: data.length, data });
            }, getDelay());
        });
    }

    async function getBookingById(bookingId) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const booking = (TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.bookings : []).find(b => b.id === bookingId);
                if (booking) {
                    resolve({ success: true, data: booking });
                } else {
                    reject({ success: false, message: `Booking ID ${bookingId} not found` });
                }
            }, getDelay());
        });
    }

    async function createBooking(bookingPayload) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const newId = `TRQ-BK-${Math.floor(1000 + Math.random() * 9000)}`;
                const newBooking = {
                    id: newId,
                    bookingModel: bookingPayload.model || 'flexy',
                    modelLabel: bookingPayload.modelLabel || 'Stop to Stop (Flexy)',
                    pickup: bookingPayload.pickup || 'HSR Layout Sector 4',
                    destination: bookingPayload.destination || 'Electronic City Phase 1',
                    date: bookingPayload.date || new Date().toISOString().split('T')[0],
                    time: bookingPayload.time || '14:30',
                    passengersCount: bookingPayload.passengersCount || 1,
                    estimatedFare: bookingPayload.estimatedFare || 160.00,
                    paymentStatus: 'success',
                    paymentMethod: bookingPayload.paymentMethod || 'TORQQ Pass',
                    currentStageIndex: 0,
                    stage: 'RECEIVED',
                    stageLabel: 'Booking Received',
                    driver: TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.drivers[0] : null,
                    vehicle: TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.drivers[0].vehicle : null,
                    distanceKm: 12.4,
                    etaMinutes: 20,
                    createdAt: new Date().toISOString()
                };

                if (TORQQ_MOCK_DATA) {
                    TORQQ_MOCK_DATA.bookings.unshift(newBooking);
                }

                resolve({ success: true, message: 'Booking created successfully', data: newBooking });
            }, getDelay() + 200);
        });
    }

    async function updateBookingStage(bookingId, stageKey) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const booking = (TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.bookings : []).find(b => b.id === bookingId);
                if (booking) {
                    const stageObj = TORQQ_CONSTANTS ? TORQQ_CONSTANTS.BOOKING_STAGES.find(s => s.key === stageKey) : null;
                    if (stageObj) {
                        booking.stage = stageObj.key;
                        booking.stageLabel = stageObj.label;
                        booking.currentStageIndex = stageObj.step - 1;
                    }
                    resolve({ success: true, message: `Booking stage updated to ${stageKey}`, data: booking });
                } else {
                    reject({ success: false, message: 'Booking not found' });
                }
            }, getDelay());
        });
    }

    async function cancelBooking(bookingId, reason = '') {
        return new Promise((resolve) => {
            setTimeout(() => {
                const booking = (TORQQ_MOCK_DATA ? TORQQ_MOCK_DATA.bookings : []).find(b => b.id === bookingId);
                if (booking) {
                    booking.paymentStatus = 'refunded';
                    booking.stage = 'CANCELLED';
                    booking.stageLabel = 'Booking Cancelled';
                }
                resolve({ success: true, message: `Booking ${bookingId} cancelled successfully.` });
            }, getDelay());
        });
    }

    return {
        getBookings,
        getBookingById,
        createBooking,
        updateBookingStage,
        cancelBooking
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = bookingService;
}
