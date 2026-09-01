/* FE<->BE contract check — runs without a server or DB.
 * 1) Enumerate mounted Express routes and confirm the paths the client calls exist.
 * 2) Push the exact Subscribe-page payload through the backend's real validators.
 * 3) Confirm the trip serializer emits the aliases the FE screens read.
 */
// Resolved from this file's location. It was previously a hardcoded absolute path
// from one developer's machine, so `npm run check:contract` — and therefore the
// `pretest` hook and `npm test` — failed on every other clone.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const app = require(ROOT + '/app');
const Joi = require(ROOT + '/node_modules/joi');
const { purchaseSubscription } = require(ROOT + '/validations/subscriptionValidation');
const svc = require(ROOT + '/services/subscriptionService');
const { toTripView } = require(ROOT + '/utils/tripView');
const mongoose = require(ROOT + '/node_modules/mongoose');

// ---- 1. Route enumeration ---------------------------------------------------
function decodeMount(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  const s = layer.regexp.source;
  const m = s.match(/^\^\\\/(.+?)\\\/\?\(\?=/);
  return m ? '/' + m[1].replace(/\\\//g, '/') : '';
}
const routes = [];
(function walk(stack, prefix) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(k => layer.route.methods[k]).map(k => k.toUpperCase());
      routes.push(methods.join(',') + ' ' + prefix + layer.route.path);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      walk(layer.handle.stack, prefix + decodeMount(layer));
    }
  }
})(app._router.stack, '');

const has = (method, path) => routes.some(r => r === `${method} ${path}` || r.startsWith(`${method},`) && r.endsWith(' ' + path) || r.split(' ')[1] === path && r.split(' ')[0].includes(method));

// The exact calls the customer client makes (path is after the /api/v1 base).
const clientCalls = [
  // Customer boarding-code sources. A customer's journeys span both trip models,
  // and each carries its own OTP, so both are read by the my-trips/dashboard screens.
  ['GET', '/api/v1/rides/my'],
  ['GET', '/api/v1/rides/active'],
  // Driver trip lifecycle. PUT /driver/trips/status is what the driver app has
  // always called; it went unmounted for a long time, which 404'd every
  // arrive/start/complete tap and made OTP boarding unreachable.
  ['PUT', '/api/v1/driver/trips/status'],
  ['GET', '/api/v1/driver/trips'],
  ['PATCH', '/api/v1/driver/trips/:id/manifest/:customerId/:action'],
  ['POST', '/api/v1/book'],
  ['GET', '/api/v1/booking'],
  ['POST', '/api/v1/booking/cancel'],
  ['GET', '/api/v1/wallet'],
  ['POST', '/api/v1/wallet/add'],
  ['GET', '/api/v1/customer/plans'],
  ['GET', '/api/v1/customer/subscription'],
  ['GET', '/api/v1/customer/subscriptions'],
  ['POST', '/api/v1/customer/subscriptions/purchase'],
  ['POST', '/api/v1/customer/subscriptions/verify-payment'],
  ['POST', '/api/v1/customer/subscriptions/cancel'],
  ['GET', '/api/v1/customer/trips'],
  ['POST', '/api/v1/customer/pause-request'],
];
console.log('\n=== 1. Client API paths mounted on the backend ===');
let missing = 0;
for (const [m, p] of clientCalls) {
  const ok = has(m, p);
  if (!ok) missing++;
  console.log(`  ${ok ? 'OK ' : 'MISSING'}  ${m} ${p}`);
}

// ---- 2. Subscribe-page payload vs backend validators ------------------------
console.log('\n=== 2. Subscribe-page payload accepted by the backend ===');
// Exactly what client subscribe/page.tsx buildBody() sends:
const feBody = {
  subscriptionType: 'HYBRID',
  pickupLocation: { address: 'Home', coordinates: [77.6501, 12.9141] },
  dropLocation: { address: 'Office', coordinates: [77.6683, 12.8489] },
  scheduleDays: [1, 3, 5],
  pickupTime: '08:00',
  startDate: new Date().toISOString(),
  paymentMethod: 'wallet',
};
// (a) Razorpay route Joi validation
const j = purchaseSubscription.validate({ ...feBody });
console.log(`  Razorpay purchase Joi:      ${j.error ? 'REJECT — ' + j.error.message : 'ACCEPT'}`);
// (b) /book service pure validators (schedule-day normalization for each model)
console.log(`  normalizeScheduleDays WEEKDAYS -> ${JSON.stringify(svc.normalizeScheduleDays('WEEKDAYS'))}`);
console.log(`  normalizeScheduleDays HYBRID[5,1,3] -> ${JSON.stringify(svc.normalizeScheduleDays('HYBRID', [5, 1, 3]))}`);
console.log(`  upcoming service dates (next 3) -> ${JSON.stringify(svc.upcomingServiceDates([1,3,5], new Date('2026-08-24T00:00:00'), 3))}`);

// ---- 3. Trip serializer emits the fields the FE reads -----------------------
console.log('\n=== 3. Trip serializer -> fields the FE screens read ===');
const custId = new mongoose.Types.ObjectId();
const sampleTrip = {
  _id: new mongoose.Types.ObjectId(),
  serviceDate: new Date('2026-08-24T00:00:00'),
  status: 'IN_PROGRESS',
  passengers: [{ customerId: custId, subscriptionId: new mongoose.Types.ObjectId(), status: 'RIDE_STARTED', otp: { code: '1234', verified: true }, pickupLocation: { coordinates: [77.6, 12.9] } }],
};
const view = toTripView(sampleTrip, { customerId: custId });
console.log(`  has tripDate alias (customer my-trips): ${view.tripDate ? 'YES' : 'NO'}`);
console.log(`  has manifest alias (driver current-trip): ${Array.isArray(view.manifest) ? 'YES' : 'NO'}`);
console.log(`  manifest[0].status mapped to legacy:     ${view.manifest[0].status} (canonical RIDE_STARTED -> BOARDED)`);
console.log(`  myEntry resolved for customer:           ${view.myEntry ? 'YES' : 'NO'}`);

// ---- 4. Boarding-OTP disclosure -------------------------------------------
// A trip is shared, so passengers[].otp.code is per-rider secret material: the
// driver needs every code, a customer must receive only their own.
console.log('\n=== 4. Boarding OTP disclosure by viewer ===');
const otherId = new mongoose.Types.ObjectId();
const sharedTrip = {
  _id: new mongoose.Types.ObjectId(),
  serviceDate: new Date('2026-08-24T00:00:00'),
  status: 'SCHEDULED',
  passengers: [
    { customerId: custId, status: 'ASSIGNED', otp: { code: '111111', verified: false } },
    { customerId: otherId, status: 'ASSIGNED', otp: { code: '222222', verified: false } },
  ],
};

const driverView = toTripView(sharedTrip, { viewer: 'driver' });
const customerView = toTripView(sharedTrip, { customerId: custId, viewer: 'customer' });
const ownCode = customerView.myEntry?.otp?.code;
const otherCode = customerView.passengers.find(
  (p) => String(p.customerId) === String(otherId)
)?.otp?.code;

const driverSeesAll = driverView.passengers.every((p) => Boolean(p.otp?.code));
let otpFailures = 0;
if (!driverSeesAll) otpFailures += 1;
if (ownCode !== '111111') otpFailures += 1;
if (otherCode !== undefined) otpFailures += 1;

console.log(`  driver sees every boarding code:         ${driverSeesAll ? 'YES' : 'NO (FAIL)'}`);
console.log(`  customer sees their own code:            ${ownCode === '111111' ? 'YES' : 'NO (FAIL)'}`);
console.log(`  co-passenger code withheld:              ${otherCode === undefined ? 'YES' : 'NO (FAIL — leaked ' + otherCode + ')'}`);

// ---- 5. Route-based manifest survives serialization ------------------------
// Route-based trips keep riders in `manifest` and have an empty `passengers` by
// design. The serializer used to overwrite `manifest` with a projection of
// `passengers`, which erased those riders from every screen.
const routeTrip = {
  _id: new mongoose.Types.ObjectId(),
  serviceDate: new Date('2026-08-24T00:00:00'),
  status: 'SCHEDULED',
  passengers: [],
  manifest: [{ customer: { _id: custId, name: 'Real Rider' }, status: 'PENDING', pickupStop: { stopName: 'Stop A' } }],
};
const routeView = toTripView(routeTrip, { viewer: 'driver' });
const keptRider = routeView.manifest.length === 1 && routeView.manifest[0].passengerName === 'Real Rider';
if (!keptRider) otpFailures += 1;
console.log(`  route-based manifest riders preserved:   ${keptRider ? 'YES' : 'NO (FAIL)'}`);

const failed = missing > 0 || Boolean(j.error) || otpFailures > 0;
console.log(`\n=== SUMMARY: ${missing === 0 ? 'all client paths mounted' : missing + ' MISSING paths'}; Joi ${j.error ? 'reject' : 'accept'}; serializer ${otpFailures === 0 ? 'OK' : otpFailures + ' FAILURES'} ===\n`);
process.exit(failed ? 1 : 0);
