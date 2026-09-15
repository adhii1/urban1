const Customer = require('../models/Customer');
const Corporate = require('../models/Corporate');
const CorporateJoinRequest = require('../models/CorporateJoinRequest');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');

const findOwnCustomer = async (userId) => {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');
  return customer;
};

const findOwnCorporate = async (userId) => {
  const corporate = await Corporate.findOne({ userId });
  if (!corporate) throw new NotFoundError('Corporate account');
  return corporate;
};

const listAvailableCorporates = asyncWrapper(async (req, res) => {
  const customer = await findOwnCustomer(req.user.id);
  const corporates = await Corporate.find({ status: 'ACTIVE' })
    .select('companyName contactPerson employeeLimit')
    .sort({ companyName: 1 })
    .lean();
  const requests = await CorporateJoinRequest.find({ customerId: customer._id })
    .select('corporateId status message rejectionReason createdAt reviewedAt')
    .lean();
  const requestByCorporate = new Map(requests.map((request) => [String(request.corporateId), request]));

  return res.json(formatResponse('Corporate accounts retrieved.', corporates.map((corporate) => ({
    ...corporate,
    request: requestByCorporate.get(String(corporate._id)) || null,
  }))));
});

const listCustomerRequests = asyncWrapper(async (req, res) => {
  const customer = await findOwnCustomer(req.user.id);
  const requests = await CorporateJoinRequest.find({ customerId: customer._id })
    .populate('corporateId', 'companyName')
    .sort({ createdAt: -1 });
  return res.json(formatResponse('Corporate requests retrieved.', requests));
});

const applyToCorporate = asyncWrapper(async (req, res) => {
  const customer = await findOwnCustomer(req.user.id);
  const corporate = await Corporate.findOne({ _id: req.params.corporateId, status: 'ACTIVE' });
  if (!corporate) throw new NotFoundError('Active corporate account');
  if (customer.corporateId && String(customer.corporateId) === String(corporate._id)) {
    throw new ValidationError('You are already a member of this corporate account.');
  }
  if (customer.corporateId && String(customer.corporateId) !== String(corporate._id)) {
    throw new ValidationError('You already belong to another corporate account.');
  }

  const existing = await CorporateJoinRequest.findOne({ customerId: customer._id, corporateId: corporate._id });
  if (existing?.status === 'PENDING') throw new ValidationError('Your request is already pending.');
  if (existing) {
    existing.status = 'PENDING';
    existing.message = req.body?.message?.trim() || undefined;
    existing.rejectionReason = undefined;
    existing.reviewedAt = undefined;
    await existing.save();
    return res.status(200).json(formatResponse('Corporate request resubmitted.', existing));
  }

  const request = await CorporateJoinRequest.create({
    customerId: customer._id,
    corporateId: corporate._id,
    message: req.body?.message?.trim() || undefined,
  });
  return res.status(201).json(formatResponse('Corporate request submitted.', request));
});

const listCorporateRequests = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const requests = await CorporateJoinRequest.find({ corporateId: corporate._id, status: 'PENDING' })
    .populate({ path: 'customerId', select: 'name userId corporateId', populate: { path: 'userId', select: 'phone' } })
    .sort({ createdAt: 1 });
  return res.json(formatResponse('Pending corporate requests retrieved.', requests));
});

const reviewCorporateRequest = asyncWrapper(async (req, res) => {
  const corporate = await findOwnCorporate(req.user.id);
  const request = await CorporateJoinRequest.findOne({
    _id: req.params.requestId,
    corporateId: corporate._id,
    status: 'PENDING',
  });
  if (!request) throw new NotFoundError('Pending corporate request');

  const action = req.params.action.toLowerCase();
  if (!['approve', 'reject'].includes(action)) throw new ValidationError('Action must be approve or reject.');
  if (action === 'approve') {
    const customer = await Customer.findOne({ _id: request.customerId, isDeleted: false });
    if (!customer) throw new NotFoundError('Customer');
    if (customer.corporateId && String(customer.corporateId) !== String(corporate._id)) {
      throw new ValidationError('Customer already belongs to another corporate account.');
    }
    const employeeCount = await Customer.countDocuments({ corporateId: corporate._id, isDeleted: false });
    if (!customer.corporateId && employeeCount >= corporate.employeeLimit) {
      throw new ValidationError(`Employee limit reached (${corporate.employeeLimit}).`);
    }
    customer.corporateId = corporate._id;
    await customer.save();
    request.status = 'APPROVED';
  } else {
    request.status = 'REJECTED';
    request.rejectionReason = req.body?.reason?.trim() || undefined;
  }
  request.reviewedAt = new Date();
  await request.save();
  return res.json(formatResponse(`Corporate request ${action}d.`, request));
});

module.exports = {
  listAvailableCorporates,
  listCustomerRequests,
  applyToCorporate,
  listCorporateRequests,
  reviewCorporateRequest,
};