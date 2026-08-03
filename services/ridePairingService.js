const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');

let driverToCustomers = new Map();
let customerToDriver = new Map();

let refreshHandle = null;
// Reduced from 10 min to 60 s so driver location updates are routed to
// the correct customer within a minute of reassignment or crash recovery.
const REFRESH_INTERVAL_MS = 60 * 1000;

function setPairing(driverId, customerId) {
  if (!driverToCustomers.has(driverId)) driverToCustomers.set(driverId, new Set());
  driverToCustomers.get(driverId).add(customerId);
  customerToDriver.set(customerId, driverId);
}

function clearPairing(driverId, customerId) {
  if (driverId && customerId) {
    const set = driverToCustomers.get(driverId);
    if (set) {
      set.delete(customerId);
      if (set.size === 0) driverToCustomers.delete(driverId);
    }
    // Also clean up if customerToDriver maps to a different driver
    const actualDriverId = customerToDriver.get(customerId);
    if (actualDriverId && actualDriverId !== driverId) {
      const otherSet = driverToCustomers.get(actualDriverId);
      if (otherSet) {
        otherSet.delete(customerId);
        if (otherSet.size === 0) driverToCustomers.delete(actualDriverId);
      }
    }
    customerToDriver.delete(customerId);
    return;
  }
  if (driverId) {
    const set = driverToCustomers.get(driverId);
    if (set) {
      for (const cid of set) customerToDriver.delete(cid);
      driverToCustomers.delete(driverId);
    }
  }
  if (customerId) {
    const driverIdForCustomer = customerToDriver.get(customerId);
    if (driverIdForCustomer) {
      const set = driverToCustomers.get(driverIdForCustomer);
      if (set) {
        set.delete(customerId);
        if (set.size === 0) driverToCustomers.delete(driverIdForCustomer);
      }
      customerToDriver.delete(customerId);
    }
  }
}

function getCustomersForDriver(driverId) {
  const set = driverToCustomers.get(driverId);
  return set ? Array.from(set) : [];
}

function getDriverForCustomer(customerId) {
  return customerToDriver.get(customerId) || null;
}

async function refreshFromDatabase() {
  const rides = await RideRequest.find({
    status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
    isDeleted: false,
  })
    .select('acceptedDriverId customerId')
    .lean();

  driverToCustomers = new Map();
  customerToDriver = new Map();
  for (const r of rides) {
    if (!r.acceptedDriverId || !r.customerId) continue;
    setPairing(r.acceptedDriverId.toString(), r.customerId.toString());
  }
}

// Crash recovery: multiple active rides on the same driver is a data-integrity
// bug. In that case we only keep the first ride found. In normal operation
// each driver has at most one active ride.
async function syncDriverAvailability(logger) {
  try {
    const activeDriverIds = Array.from(driverToCustomers.keys());
    if (!activeDriverIds.length) return;

    // Set isAvailable: false for any driver who currently has an active ride.
    // This recovers from crashes that left a driver available after accepting.
    const result = await Driver.updateMany(
      { _id: { $in: activeDriverIds }, isAvailable: true },
      { $set: { isAvailable: false } }
    );
    if (result.modifiedCount > 0 && logger) {
      logger.warn(`Corrected ${result.modifiedCount} driver(s) stuck available with active ride`);
    }
  } catch (err) {
    if (logger) logger.error('syncDriverAvailability error', { error: err.message });
  }
}

function startPeriodicRefresh(logger) {
  if (refreshHandle) return;
  refreshHandle = setInterval(() => {
    refreshFromDatabase().then(() => {
      syncDriverAvailability(logger);
    }).catch((err) => {
      if (logger) logger.error('Periodic ride pairing refresh failed', { error: err.message });
    });
  }, REFRESH_INTERVAL_MS);
  if (refreshHandle.unref) refreshHandle.unref();
}

function stopPeriodicRefresh() {
  if (refreshHandle) {
    clearInterval(refreshHandle);
    refreshHandle = null;
  }
}

module.exports = {
  setPairing,
  clearPairing,
  getCustomersForDriver,
  getDriverForCustomer,
  refreshFromDatabase,
  syncDriverAvailability,
  startPeriodicRefresh,
  stopPeriodicRefresh,
};
