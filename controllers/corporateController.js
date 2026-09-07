/**
 * corporateController — self-service endpoints for a logged-in Corporate
 * account. Admin still provisions the company account itself (see
 * adminController's Corporate CRUD); everything here is scoped to
 * req.user.id's own Corporate document and its own employee roster.
 */

const User = require('../models/User');
const Customer = require('../models/Customer');
const Corporate = require('../models/Corporate');
const Subscription = require('../models/Subscription');
const { hashPassword } = require('../utils/passwordHelper');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');

async function findOwnCorporate(userId) {
  const corporate = await Corporate.findOne({ userId });
  if (!corporate) throw new NotFoundError('Corporate account');
  return corporate;
}

/**
 * GET /api/v1/corporate/dashboard
 * Roster size, active-subscription coverage, and remaining onboarding room.
 */
const getDashboard = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);

  const employees = await Customer.find({ corporateId: corporate._id, isDeleted: false }).select('_id');
  const employeeIds = employees.map((e) => e._id);

  const activeSubscriptions = employeeIds.length
    ? await Subscription.countDocuments({
        customerId: { $in: employeeIds },
        status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] },
        isDeleted: false,
      })
    : 0;

  return res.json(formatResponse('Corporate dashboard retrieved.', {
    companyName: corporate.companyName,
    employeeCount: employeeIds.length,
    employeeLimit: corporate.employeeLimit,
    seatsRemaining: Math.max(0, corporate.employeeLimit - employeeIds.length),
    activeSubscriptions,
    status: corporate.status,
  }));
});

/**
 * GET /api/v1/corporate/profile
 */
const getProfile = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  return res.json(formatResponse('Corporate profile retrieved.', corporate));
});

/**
 * PUT /api/v1/corporate/profile
 * Body: { companyName?, contactPerson?, billingEmail?, address? } — GST and
 * employeeLimit are admin-only (not settable from the corporate portal).
 */
const updateProfile = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const { companyName, contactPerson, billingEmail, address } = req.body;

  if (companyName !== undefined) corporate.companyName = companyName;
  if (contactPerson !== undefined) corporate.contactPerson = contactPerson;
  if (billingEmail !== undefined) corporate.billingEmail = billingEmail;
  if (address !== undefined) corporate.address = address;
  await corporate.save();

  return res.json(formatResponse('Corporate profile updated.', corporate));
});

/**
 * GET /api/v1/corporate/employees
 * Every employee (Customer) onboarded under this corporate account, with
 * their current subscription status for the roster view.
 */
const getEmployees = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const employees = await Customer.find({ corporateId: corporate._id, isDeleted: false })
    .populate('userId', 'phone status')
    .populate('subscriptionId', 'subscriptionType status pickupTime')
    .sort({ createdAt: -1 });

  return res.json(formatResponse('Employees retrieved.', employees));
});

/**
 * POST /api/v1/corporate/employees
 * Onboard one employee as a regular Customer, linked to this corporate
 * account. Body: { phone, password, name }.
 */
const addEmployee = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const { phone, password, name } = req.body;

  if (!phone || !password || !name) {
    throw new ValidationError('Phone, password, and name are required.');
  }

  const currentCount = await Customer.countDocuments({ corporateId: corporate._id, isDeleted: false });
  if (currentCount >= corporate.employeeLimit) {
    throw new ValidationError(`Employee limit reached (${corporate.employeeLimit}). Contact TORQQ support to raise it.`, { code: 'EMPLOYEE_LIMIT_REACHED' });
  }

  const existingUser = await User.findOne({ phone });
  if (existingUser) throw new ValidationError('Phone number already registered.');

  const hashedPassword = await hashPassword(password);
  const user = await User.create({ phone, password: hashedPassword, role: 'Customer', status: 'ACTIVE' });

  const employee = await Customer.create({
    userId: user._id,
    name,
    corporateId: corporate._id,
  });

  return res.status(201).json(formatResponse('Employee onboarded successfully.', employee));
});

/**
 * DELETE /api/v1/corporate/employees/:id
 * Detach one employee from this corporate roster. This unlinks the account
 * (frees the seat); it does not delete the underlying Customer/User — the
 * person keeps their account and simply stops being billed to the company.
 */
const removeEmployee = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const employee = await Customer.findOne({ _id: req.params.id, corporateId: corporate._id, isDeleted: false });
  if (!employee) throw new NotFoundError('Employee');

  employee.corporateId = undefined;
  await employee.save();

  return res.json(formatResponse('Employee removed from corporate roster.'));
});

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  getEmployees,
  addEmployee,
  removeEmployee,
};
