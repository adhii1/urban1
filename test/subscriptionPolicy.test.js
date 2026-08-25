const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const {
  MAX_MANAGED_STOP_DISTANCE_KM,
  POLICY_CODES,
  isEligibleOnServiceDate,
  validateRecurringSubscription,
} = require('../services/subscriptionPolicyService');

const EARTH_RADIUS_KM = 6371;
const VALID_HYBRID_DAYS = [1, 3, 5];

function degreesForKmAtEquator(distanceKm) {
  return (distanceKm / EARTH_RADIUS_KM) * (180 / Math.PI);
}

function managedRoute({ status = 'ACTIVE', isDeleted = false } = {}) {
  return {
    status,
    isDeleted,
    stops: [
      {
        stopId: 'pickup',
        stopName: 'Pickup',
        sequenceOrder: 10,
        location: { type: 'Point', coordinates: [0, 0] },
      },
      {
        stopId: 'drop',
        stopName: 'Drop',
        sequenceOrder: 20,
        location: { type: 'Point', coordinates: [1, 0] },
      },
    ],
  };
}

function homeToOfficePlan(tier = 'Hybrid') {
  return {
    tier,
    serviceType: 'Home-to-Office',
    isActive: true,
    bookingRules: { isSharedRide: true, useManagedStops: true },
  };
}

function stopToStopPlan() {
  return {
    tier: 'Standard',
    serviceType: 'Stop-to-Stop',
    isActive: true,
    bookingRules: { isSharedRide: true, useManagedStops: true },
  };
}

function customerAtDistances(pickupDistanceKm, dropDistanceKm) {
  return {
    pickupLocation: {
      coordinates: [degreesForKmAtEquator(pickupDistanceKm), 0],
    },
    dropLocation: {
      coordinates: [1 + degreesForKmAtEquator(dropDistanceKm), 0],
    },
  };
}

function recurringInput({
  tier = 'Hybrid',
  route = managedRoute(),
  customer = customerAtDistances(0, 0),
  selectedWeekdays = VALID_HYBRID_DAYS,
  pickupStopId = 'pickup',
  dropStopId = 'drop',
} = {}) {
  return {
    customer,
    plan: tier === 'Standard' ? stopToStopPlan() : homeToOfficePlan(tier),
    route,
    selectedWeekdays,
    pickupStopId,
    dropStopId,
  };
}

function validateBeforePayment(input, paymentOrder) {
  const policy = validateRecurringSubscription(input);
  paymentOrder();
  return policy;
}

function errorCode(callback) {
  try {
    callback();
    return undefined;
  } catch (error) {
    return error.details?.code;
  }
}

// Feature: torqq-four-model-handover, Property 1: Managed-stop distance threshold and payment safety
// **Validates: Requirements 1.1, 1.2, 1.3, 9.1**
test('Property 1: accepts all managed-stop distances through 5 km', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: MAX_MANAGED_STOP_DISTANCE_KM, noNaN: true }),
      fc.double({ min: 0, max: MAX_MANAGED_STOP_DISTANCE_KM, noNaN: true }),
      (pickupDistanceKm, dropDistanceKm) => {
        let paymentOrders = 0;
        const result = validateBeforePayment(
          recurringInput({ customer: customerAtDistances(pickupDistanceKm, dropDistanceKm) }),
          () => { paymentOrders += 1; }
        );
        assert.ok(result.distances.pickupDistanceKm <= MAX_MANAGED_STOP_DISTANCE_KM);
        assert.ok(result.distances.dropDistanceKm <= MAX_MANAGED_STOP_DISTANCE_KM);
        assert.equal(paymentOrders, 1);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: torqq-four-model-handover, Property 1: Managed-stop distance threshold and payment safety
// **Validates: Requirements 1.1, 1.2, 1.3, 9.1**
test('Property 1: rejects any over-threshold endpoint before payment', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 5.001, max: 30, noNaN: true }),
      fc.boolean(),
      (tooFarDistanceKm, pickupIsTooFar) => {
        let paymentOrders = 0;
        const input = recurringInput({
          customer: customerAtDistances(
            pickupIsTooFar ? tooFarDistanceKm : 0,
            pickupIsTooFar ? 0 : tooFarDistanceKm
          ),
        });
        const code = errorCode(() => validateBeforePayment(input, () => { paymentOrders += 1; }));
        assert.equal(
          code,
          pickupIsTooFar ? POLICY_CODES.PICKUP_STOP_TOO_FAR : POLICY_CODES.DROP_STOP_TOO_FAR
        );
        assert.equal(paymentOrders, 0);
      }
    ),
    { numRuns: 100 }
  );
});

test('managed-stop distance boundaries accept 4.9 km and 5.0 km, and reject greater than 5.0 km', () => {
  // haversineKm of a geometrically-exact "5.0 km" offset returns
  // 5.0000000000000115, so compare against the service's own float tolerance
  // rather than an exact <= 5.0.
  const toleranceKm = 1e-9;
  for (const distanceKm of [4.9, 5.0]) {
    const result = validateRecurringSubscription(recurringInput({
      customer: customerAtDistances(distanceKm, distanceKm),
    }));
    assert.ok(result.distances.pickupDistanceKm - MAX_MANAGED_STOP_DISTANCE_KM <= toleranceKm);
    assert.ok(result.distances.dropDistanceKm - MAX_MANAGED_STOP_DISTANCE_KM <= toleranceKm);
  }

  const code = errorCode(() => validateRecurringSubscription(recurringInput({
    customer: customerAtDistances(5.001, 0),
  })));
  assert.equal(code, POLICY_CODES.PICKUP_STOP_TOO_FAR);
});

// Feature: torqq-four-model-handover, Property 2: Managed-stop selection validity
// **Validates: Requirements 1.4, 1.5, 5.1, 5.2, 5.3**
test('Property 2: accepts managed-stop selections if and only if the route and forward pair are valid', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('ACTIVE', 'INACTIVE'),
      fc.boolean(),
      fc.constantFrom('pickup', 'drop', 'unknown'),
      fc.constantFrom('pickup', 'drop', 'unknown'),
      (status, isDeleted, pickupStopId, dropStopId) => {
        const accepted = status === 'ACTIVE'
          && !isDeleted
          && pickupStopId === 'pickup'
          && dropStopId === 'drop';
        const input = recurringInput({
          tier: 'Standard',
          route: managedRoute({ status, isDeleted }),
          pickupStopId,
          dropStopId,
          selectedWeekdays: undefined,
        });
        if (accepted) {
          const result = validateRecurringSubscription(input);
          assert.equal(result.pickupStopId, 'pickup');
          assert.equal(result.dropStopId, 'drop');
          return;
        }
        assert.notEqual(errorCode(() => validateRecurringSubscription(input)), undefined);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: torqq-four-model-handover, Property 3: Hybrid weekday selection validity
// **Validates: Requirements 2.1, 2.2, 9.2**
test('Property 3: accepts exactly three distinct Monday-through-Friday Hybrid days only', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 6 }),
      (selectedWeekdays) => {
        const accepted = selectedWeekdays.length === 3
          && new Set(selectedWeekdays).size === 3
          && selectedWeekdays.every((day) => day >= 1 && day <= 5);
        let paymentOrders = 0;
        const input = recurringInput({ selectedWeekdays });
        if (accepted) {
          const result = validateBeforePayment(input, () => { paymentOrders += 1; });
          assert.deepEqual(result.normalizedWeekdays, [...selectedWeekdays].sort((a, b) => a - b));
          assert.equal(paymentOrders, 1);
          return;
        }
        assert.equal(
          errorCode(() => validateBeforePayment(input, () => { paymentOrders += 1; })),
          POLICY_CODES.INVALID_HYBRID_WEEKDAYS
        );
        assert.equal(paymentOrders, 0);
      }
    ),
    { numRuns: 100 }
  );
});

test('Hybrid weekday examples reject cardinality, duplicates, Saturday, and Sunday', () => {
  const invalidSelections = [
    [1, 2],
    [1, 2, 3, 4],
    [1, 1, 2],
    [1, 2, 6],
    [1, 2, 7],
  ];
  for (const selectedWeekdays of invalidSelections) {
    assert.equal(
      errorCode(() => validateRecurringSubscription(recurringInput({ selectedWeekdays }))),
      POLICY_CODES.INVALID_HYBRID_WEEKDAYS,
      `expected ${selectedWeekdays.join(',')} to be rejected`
    );
  }
  assert.deepEqual(
    validateRecurringSubscription(recurringInput({ selectedWeekdays: [5, 1, 3] })).normalizedWeekdays,
    [1, 3, 5]
  );
});

function serviceDateForDay(day) {
  return new Date(2025, 5, 15 + day); // Sunday 15 June 2025 through Saturday 21 June 2025
}

function recurringSubscription({ status, isDeleted, selectedWeekdays }) {
  return {
    status,
    isDeleted,
    selectedWeekdays,
    startDate: serviceDateForDay(0),
    endDate: serviceDateForDay(6),
  };
}

// Feature: torqq-four-model-handover, Property 4: Recurring service-date eligibility
// **Validates: Requirements 2.3, 2.4, 2.5, 9.3**
test('Property 4: eligibility is exactly the active Hybrid selection or active Weekday weekday', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('Hybrid', 'Weekday'),
      fc.constantFrom('ACTIVE', 'PENDING_PAYMENT', 'CANCELLED'),
      fc.boolean(),
      fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 5 }),
      fc.integer({ min: 0, max: 6 }),
      (tier, status, isDeleted, selectedWeekdays, day) => {
        const active = status === 'ACTIVE' && !isDeleted;
        const validHybridDays = selectedWeekdays.length === 3
          && new Set(selectedWeekdays).size === 3
          && selectedWeekdays.every((selectedDay) => selectedDay >= 1 && selectedDay <= 5);
        const expected = active && (tier === 'Weekday'
          ? day >= 1 && day <= 5
          : validHybridDays && selectedWeekdays.includes(day));
        assert.equal(
          isEligibleOnServiceDate({
            subscription: recurringSubscription({ status, isDeleted, selectedWeekdays }),
            plan: { tier },
            serviceDate: serviceDateForDay(day),
          }),
          expected
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Weekday eligibility is generated Monday through Friday and never Saturday or Sunday', () => {
  const subscription = recurringSubscription({
    status: 'ACTIVE',
    isDeleted: false,
    selectedWeekdays: [],
  });
  for (const [day, name, expected] of [
    [1, 'Monday', true],
    [2, 'Tuesday', true],
    [3, 'Wednesday', true],
    [4, 'Thursday', true],
    [5, 'Friday', true],
    [6, 'Saturday', false],
    [0, 'Sunday', false],
  ]) {
    assert.equal(
      isEligibleOnServiceDate({ subscription, plan: { tier: 'Weekday' }, serviceDate: serviceDateForDay(day) }),
      expected,
      name
    );
  }
});
