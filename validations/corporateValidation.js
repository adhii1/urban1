const Joi = require('joi');

const phoneRegex = /^[6-9]\d{9}$/;

const contactPerson = Joi.object({
  name: Joi.string().trim().max(120).optional().allow(null, ''),
  designation: Joi.string().trim().max(120).optional().allow(null, ''),
}).optional();

const addEmployee = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().trim().min(1).max(100).required(),
});

const updateProfile = Joi.object({
  companyName: Joi.string().trim().min(1).max(150).optional(),
  contactPerson,
  billingEmail: Joi.string().trim().email().max(150).optional().allow(null, ''),
  address: Joi.string().trim().max(300).optional().allow(null, ''),
}).min(1);

module.exports = { addEmployee, updateProfile };
