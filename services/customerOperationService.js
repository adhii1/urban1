const User = require('../models/User');
const Driver = require('../models/Driver');
const Notification = require('../models/Notification');
const { emitToUser, getIO } = require('../config/socket');

/**
 * Records a redacted customer action for every active admin, then broadcasts
 * it to the live admin console. Domain records remain the source of truth.
 */
async function publishCustomerOperation({ type, customerId, title, summary, metadata = {} }) {
  const occurredAt = new Date().toISOString();
  const event = {
    type,
    customerId: customerId?.toString(),
    title,
    summary,
    metadata: { ...metadata, operationType: type },
    occurredAt,
  };

  try {
    const admins = await User.find({ role: 'Admin', status: 'ACTIVE' }).select('_id').lean();
    if (admins.length) {
      await Notification.insertMany(admins.map((admin) => ({
        userId: admin._id,
        title,
        body: summary,
        type: 'SYSTEM',
        metadata: event.metadata,
      })));
    }
  } catch {
    // A notification persistence failure must not roll back the completed action.
  }

  try {
    getIO().of('/sockets/admin').emit('customer:operation', event);
  } catch {
    // The admin console may be offline during process startup; persisted notices remain available.
  }

  return event;
}

/**
 * Sends only the affected driver's own trip delta. No payment or customer
 * preference data is included in the driver payload.
 */
async function notifyAssignedDriversOfTripChanges(trips, event) {
  const driverIds = [...new Set((trips || []).map((trip) => trip.driverId?.toString()).filter(Boolean))];
  if (!driverIds.length) return;

  const drivers = await Driver.find({ _id: { $in: driverIds } }).select('_id userId').lean();
  for (const trip of trips) {
    const driver = drivers.find((item) => item._id.toString() === trip.driverId?.toString());
    if (!driver?.userId) continue;
    emitToUser('driver', driver.userId.toString(), 'trip:manifest:changed', {
      tripId: trip._id.toString(),
      status: trip.status,
      event,
      passengerCount: trip.manifest?.length || 0,
      updatedAt: new Date().toISOString(),
    });
  }
}

module.exports = { publishCustomerOperation, notifyAssignedDriversOfTripChanges };
