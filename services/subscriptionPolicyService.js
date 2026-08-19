const { ValidationError } = require('../utils/AppError');
const { haversineKm } = require('../utils/geoHelper');

const MAX_MANAGED_STOP_DISTANCE_KM = 5;
// Haversine calculations at the inclusive boundary can vary by floating-point noise.
const MANAGED_STOP_DISTANCE_TOLERANCE_KM = 1e-9;
const WEEKDAY_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);
const POLICY_CODES = Object.freeze({
  INVALID_PLAN_CONFIGURATION: 'INVALID_PLAN_CONFIGURATION',
  FLEXY_RECURRING_PURCHASE: 'FLEXY_RECURRING_PURCHASE',
  ROUTE_NOT_ACTIVE: 'ROUTE_NOT_ACTIVE',
  INVALID_ROUTE_STOPS: 'INVALID_ROUTE_STOPS',
  STOP_SELECTION_REQUIRED: 'STOP_SELECTION_REQUIRED',
  PICKUP_STOP_NOT_ON_ROUTE: 'PICKUP_STOP_NOT_ON_ROUTE',
  DROP_STOP_NOT_ON_ROUTE: 'DROP_STOP_NOT_ON_ROUTE',
  STOPS_MUST_DIFFER: 'STOPS_MUST_DIFFER',
  STOP_ORDER_INVALID: 'STOP_ORDER_INVALID',
  CUSTOMER_PICKUP_LOCATION_REQUIRED: 'CUSTOMER_PICKUP_LOCATION_REQUIRED',
  CUSTOMER_DROP_LOCATION_REQUIRED: 'CUSTOMER_DROP_LOCATION_REQUIRED',
  PICKUP_STOP_TOO_FAR: 'PICKUP_STOP_TOO_FAR',
  DROP_STOP_TOO_FAR: 'DROP_STOP_TOO_FAR',
  INVALID_HYBRID_WEEKDAYS: 'INVALID_HYBRID_WEEKDAYS',
});

function policyError(code, message) {
  return new ValidationError(message, { code });
}

function isCoordinatePair(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90;
}

function getCoordinates(location) {
  return location?.coordinates;
}

function isActiveRoute(route) {
  if (!route || route.status !== 'ACTIVE' || route.isDeleted === true) return false;
  const stops = route.stops || [];
  if (stops.length < 2) return false;

  const sequenceOrders = new Set();
  return stops.every((stop) => {
    if (!stop?.stopId || !Number.isFinite(stop.sequenceOrder) || !isCoordinatePair(getCoordinates(stop.location))) {
      return false;
    }
    if (sequenceOrders.has(stop.sequenceOrder)) return false;
    sequenceOrders.add(stop.sequenceOrder);
    return true;
  });
}

function validatePlanCompatibility(plan) {
  if (!plan || plan.isActive === false || plan.isDeleted === true) {
    throw policyError(POLICY_CODES.INVALID_PLAN_CONFIGURATION, 'The selected plan is not available.');
  }
  if (plan.tier === 'Flexy') {
    throw policyError(POLICY_CODES.FLEXY_RECURRING_PURCHASE, 'Flexy rides must be booked from the on-demand booking screen.');
  }
  if (!plan.bookingRules?.isSharedRide || !plan.bookingRules?.useManagedStops) {
    throw policyError(POLICY_CODES.INVALID_PLAN_CONFIGURATION, 'This plan is not configured as a recurring managed service.');
  }
  if ((plan.tier === 'Hybrid' || plan.tier === 'Weekday') && plan.serviceType !== 'Home-to-Office') {
    throw policyError(POLICY_CODES.INVALID_PLAN_CONFIGURATION, `${plan.tier} must use the Home-to-Office service type.`);
  }
  if (plan.tier === 'Standard' && plan.serviceType !== 'Stop-to-Stop') {
    throw policyError(POLICY_CODES.INVALID_PLAN_CONFIGURATION, 'Stop-to-Stop plans must use the Stop-to-Stop service type.');
  }
  if (!['Hybrid', 'Weekday', 'Standard'].includes(plan.tier)) {
    throw policyError(POLICY_CODES.INVALID_PLAN_CONFIGURATION, 'This plan is not configured as a recurring service.');
  }
}

function resolveStop(stops, stopId, legacyIndex, endpoint) {
  if (typeof stopId === 'string' && stopId.trim()) {
    const selectedStop = stops.find((stop) => stop.stopId === stopId);
    if (selectedStop) return selectedStop;
    throw policyError(
      endpoint === 'pickup' ? POLICY_CODES.PICKUP_STOP_NOT_ON_ROUTE : POLICY_CODES.DROP_STOP_NOT_ON_ROUTE,
      `The selected ${endpoint} stop is not on the active route.`
    );
  }

  if (Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < stops.length) {
    return stops[legacyIndex];
  }

  throw policyError(POLICY_CODES.STOP_SELECTION_REQUIRED, 'Please select pickup and drop managed stops.');
}

function normalizeHybridWeekdays(selectedWeekdays) {
  if (!Array.isArray(selectedWeekdays)
    || selectedWeekdays.length !== 3
    || new Set(selectedWeekdays).size !== 3
    || !selectedWeekdays.every((day) => WEEKDAY_NUMBERS.includes(day))) {
    throw policyError(
      POLICY_CODES.INVALID_HYBRID_WEEKDAYS,
      'Hybrid plans require exactly three distinct weekdays from Monday through Friday.'
    );
  }
  return [...selectedWeekdays].sort((a, b) => a - b);
}

function validateManagedDistances(customer, pickupStop, dropStop) {
  const pickupCoordinates = getCoordinates(customer?.pickupLocation) || getCoordinates(customer?.homeLocation);
  const dropCoordinates = getCoordinates(customer?.dropLocation);
  if (!isCoordinatePair(pickupCoordinates)) {
    throw policyError(POLICY_CODES.CUSTOMER_PICKUP_LOCATION_REQUIRED, 'Set your pickup location before selecting a managed commute route.');
  }
  if (!isCoordinatePair(dropCoordinates)) {
    throw policyError(POLICY_CODES.CUSTOMER_DROP_LOCATION_REQUIRED, 'Set your drop location before selecting a managed commute route.');
  }

  const pickupDistanceKm = haversineKm(pickupCoordinates, pickupStop.location.coordinates);
  if (pickupDistanceKm - MAX_MANAGED_STOP_DISTANCE_KM > MANAGED_STOP_DISTANCE_TOLERANCE_KM) {
    throw policyError(POLICY_CODES.PICKUP_STOP_TOO_FAR, 'The selected pickup stop must be within 5 km of your pickup location.');
  }

  const dropDistanceKm = haversineKm(dropCoordinates, dropStop.location.coordinates);
  if (dropDistanceKm - MAX_MANAGED_STOP_DISTANCE_KM > MANAGED_STOP_DISTANCE_TOLERANCE_KM) {
    throw policyError(POLICY_CODES.DROP_STOP_TOO_FAR, 'The selected drop stop must be within 5 km of your drop location.');
  }

  return { pickupDistanceKm, dropDistanceKm };
}

/**
 * Pure recurring-purchase policy. It never reads or writes persistence and
 * returns the canonical durable stop values the caller must persist.
 */
function validateRecurringSubscription({
  customer,
  plan,
  route,
  selectedWeekdays,
  pickupStopId,
  dropStopId,
  pickupStopIndex,
  dropStopIndex,
}) {
  validatePlanCompatibility(plan);
  if (!route || route.status !== 'ACTIVE' || route.isDeleted === true) {
    throw policyError(POLICY_CODES.ROUTE_NOT_ACTIVE, 'Select an active route.');
  }
  if (!isActiveRoute(route)) {
    throw policyError(POLICY_CODES.INVALID_ROUTE_STOPS, 'The selected route does not have valid managed stops.');
  }

  const stops = route.stops;
  const pickupStop = resolveStop(stops, pickupStopId, pickupStopIndex, 'pickup');
  const dropStop = resolveStop(stops, dropStopId, dropStopIndex, 'drop');
  if (pickupStop.stopId === dropStop.stopId) {
    throw policyError(POLICY_CODES.STOPS_MUST_DIFFER, 'Pickup and drop stops must be different.');
  }
  if (pickupStop.sequenceOrder >= dropStop.sequenceOrder) {
    throw policyError(POLICY_CODES.STOP_ORDER_INVALID, 'Drop stop must be after pickup stop on the selected route.');
  }

  const normalizedWeekdays = plan.tier === 'Hybrid'
    ? normalizeHybridWeekdays(selectedWeekdays)
    : (plan.tier === 'Weekday' ? [...WEEKDAY_NUMBERS] : []);
  const distances = plan.serviceType === 'Home-to-Office'
    ? validateManagedDistances(customer, pickupStop, dropStop)
    : undefined;

  return {
    normalizedWeekdays,
    pickupStop,
    dropStop,
    pickupStopId: pickupStop.stopId,
    dropStopId: dropStop.stopId,
    pickupStopSequence: pickupStop.sequenceOrder,
    dropStopSequence: dropStop.sequenceOrder,
    distances,
  };
}

function localServiceDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function isEligibleOnServiceDate({ subscription, plan, serviceDate }) {
  if (!subscription || subscription.status !== 'ACTIVE' || subscription.isDeleted === true || !plan) return false;
  const date = localServiceDate(serviceDate);
  const startDate = localServiceDate(subscription.startDate);
  const endDate = localServiceDate(subscription.endDate);
  if (!date || !startDate || !endDate || date < startDate || date > endDate) return false;

  const day = date.getDay();
  if (plan.tier === 'Weekday') return WEEKDAY_NUMBERS.includes(day);
  if (plan.tier === 'Hybrid') {
    const selectedWeekdays = subscription.selectedWeekdays || [];
    return selectedWeekdays.length === 3
      && new Set(selectedWeekdays).size === 3
      && selectedWeekdays.every((selectedDay) => WEEKDAY_NUMBERS.includes(selectedDay))
      && selectedWeekdays.includes(day);
  }
  return plan.tier === 'Standard' && plan.bookingRules?.isSharedRide === true;
}

module.exports = {
  MAX_MANAGED_STOP_DISTANCE_KM,
  POLICY_CODES,
  WEEKDAY_NUMBERS,
  isActiveRoute,
  isEligibleOnServiceDate,
  normalizeHybridWeekdays,
  validateRecurringSubscription,
};
