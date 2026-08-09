const Customer = require('../models/Customer');
const EmergencyContact = require('../models/EmergencyContact');
const Favourite = require('../models/Favourite');
const Notification = require('../models/Notification');
const SupportTicket = require('../models/SupportTicket');
const Coupon = require('../models/Coupon');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');

// ============================================
// EMERGENCY CONTACTS
// ============================================

const getEmergencyContacts = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const contacts = await EmergencyContact.find({ customerId: customer._id }).sort({ createdAt: -1 });
  return res.json(formatResponse('Emergency contacts retrieved.', contacts));
});

const addEmergencyContact = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { name, phone, relationship } = req.body;
  if (!name || !phone) throw new ValidationError('Name and phone are required.');

  // Limit to 5 contacts
  const count = await EmergencyContact.countDocuments({ customerId: customer._id });
  if (count >= 5) throw new ValidationError('Maximum 5 emergency contacts allowed.');

  const contact = await EmergencyContact.create({
    customerId: customer._id,
    name,
    phone,
    relationship: relationship || 'Other',
  });

  return res.status(201).json(formatResponse('Emergency contact added.', contact));
});

const updateEmergencyContact = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { name, phone, relationship } = req.body;
  const contact = await EmergencyContact.findOneAndUpdate(
    { _id: req.params.id, customerId: customer._id },
    { $set: { ...(name && { name }), ...(phone && { phone }), ...(relationship && { relationship }) } },
    { new: true }
  );

  if (!contact) throw new NotFoundError('Emergency contact');
  return res.json(formatResponse('Emergency contact updated.', contact));
});

const deleteEmergencyContact = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const contact = await EmergencyContact.findOneAndUpdate(
    { _id: req.params.id, customerId: customer._id },
    { isDeleted: true },
    { new: true }
  );

  if (!contact) throw new NotFoundError('Emergency contact');
  return res.json(formatResponse('Emergency contact deleted.'));
});

// ============================================
// CUSTOMER SETTINGS
// ============================================

const getSettings = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id }).select('settings');
  if (!customer) throw new NotFoundError('Customer');

  return res.json(formatResponse('Settings retrieved.', customer.settings || {}));
});

const updateSettings = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const allowed = ['notifications', 'rideAlerts', 'promoEmails', 'language', 'darkMode'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[`settings.${key}`] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.json(formatResponse('No changes.', customer.settings));
  }

  const updated = await Customer.findOneAndUpdate(
    { userId: req.user.id },
    { $set: updates },
    { new: true }
  ).select('settings');

  return res.json(formatResponse('Settings updated.', updated.settings));
});

// ============================================
// FAVOURITES (Saved Locations)
// ============================================

const getFavourites = asyncWrapper(async (req, res) => {
  const favs = await Favourite.find({ userId: req.user.id }).sort({ createdAt: -1 });
  return res.json(formatResponse('Favourites retrieved.', favs));
});

const addFavourite = asyncWrapper(async (req, res) => {
  const { label, address, coordinates, icon } = req.body;
  if (!label) throw new ValidationError('Label is required.');

  const count = await Favourite.countDocuments({ userId: req.user.id });
  if (count >= 10) throw new ValidationError('Maximum 10 favourites allowed.');

  const fav = await Favourite.create({
    userId: req.user.id,
    label,
    address: address || '',
    location: coordinates ? { type: 'Point', coordinates } : undefined,
    icon: icon || 'map-pin',
  });

  return res.status(201).json(formatResponse('Favourite added.', fav));
});

const deleteFavourite = asyncWrapper(async (req, res) => {
  const fav = await Favourite.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { isDeleted: true },
    { new: true }
  );

  if (!fav) throw new NotFoundError('Favourite');
  return res.json(formatResponse('Favourite removed.'));
});

// ============================================
// NOTIFICATIONS
// ============================================

const getNotifications = asyncWrapper(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);

  return res.json(formatResponse('Notifications retrieved.', notifications));
});

const markNotificationsRead = asyncWrapper(async (req, res) => {
  const { ids } = req.body; // optional array of specific IDs

  if (ids && Array.isArray(ids) && ids.length > 0) {
    await Notification.updateMany(
      { _id: { $in: ids }, userId: req.user.id },
      { isRead: true }
    );
  } else {
    // Mark all as read
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );
  }

  return res.json(formatResponse('Notifications marked as read.'));
});

const deleteNotification = asyncWrapper(async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { isDeleted: true },
    { new: true }
  );

  if (!notif) throw new NotFoundError('Notification');
  return res.json(formatResponse('Notification deleted.'));
});

// ============================================
// SUPPORT TICKETS
// ============================================

const getTickets = asyncWrapper(async (req, res) => {
  const tickets = await SupportTicket.find({ userId: req.user.id }).sort({ createdAt: -1 });
  return res.json(formatResponse('Support tickets retrieved.', tickets));
});

const createTicket = asyncWrapper(async (req, res) => {
  const { subject, category, description } = req.body;
  if (!subject || !description) throw new ValidationError('Subject and description are required.');

  const ticket = await SupportTicket.create({
    userId: req.user.id,
    subject,
    category: category || 'OTHER',
    description,
  });

  return res.status(201).json(formatResponse('Support ticket created.', ticket));
});

const getTicketById = asyncWrapper(async (req, res) => {
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ticket) throw new NotFoundError('Support ticket');
  return res.json(formatResponse('Ticket retrieved.', ticket));
});

const replyToTicket = asyncWrapper(async (req, res) => {
  const { message } = req.body;
  if (!message) throw new ValidationError('Message is required.');

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ticket) throw new NotFoundError('Support ticket');
  if (ticket.status === 'CLOSED') throw new ValidationError('Cannot reply to a closed ticket.');

  ticket.replies.push({
    senderId: req.user.id,
    senderRole: 'Customer',
    message,
  });

  await ticket.save();
  return res.json(formatResponse('Reply added.', ticket));
});

// ============================================
// COUPONS
// ============================================

const getCoupons = asyncWrapper(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
    ],
  }).select('code description discountType discountValue minOrderAmount maxDiscount validUntil');

  return res.json(formatResponse('Available coupons.', coupons));
});

const applyCoupon = asyncWrapper(async (req, res) => {
  const { code, amount } = req.body;
  if (!code) throw new ValidationError('Coupon code is required.');

  const now = new Date();
  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  });

  if (!coupon) throw new NotFoundError('Valid coupon');

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new ValidationError('Coupon usage limit reached.');
  }

  if (amount && coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    throw new ValidationError(`Minimum order amount ₹${coupon.minOrderAmount} required.`);
  }

  let discount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    discount = ((amount || 0) * coupon.discountValue) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }

  return res.json(formatResponse('Coupon applied.', {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    calculatedDiscount: Math.round(discount),
    finalAmount: Math.max(0, Math.round((amount || 0) - discount)),
  }));
});

// ============================================
// WALLET (Rewards/Referrals/Refunds - read-only for now)
// ============================================

const getRewards = asyncWrapper(async (req, res) => {
  return res.json(formatResponse('Rewards retrieved.', { points: 0, history: [] }));
});

const getReferrals = asyncWrapper(async (req, res) => {
  return res.json(formatResponse('Referrals retrieved.', { code: `TORQQ${req.user.id.toString().slice(-6).toUpperCase()}`, referrals: [], earnings: 0 }));
});

const getRefunds = asyncWrapper(async (req, res) => {
  return res.json(formatResponse('Refunds retrieved.', []));
});

module.exports = {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  getSettings,
  updateSettings,
  getFavourites,
  addFavourite,
  deleteFavourite,
  getNotifications,
  markNotificationsRead,
  deleteNotification,
  getTickets,
  createTicket,
  getTicketById,
  replyToTicket,
  getCoupons,
  applyCoupon,
  getRewards,
  getReferrals,
  getRefunds,
};
