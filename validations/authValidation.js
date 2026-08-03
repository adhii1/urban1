const Joi = require('joi');

const phoneRegex = /^[6-9]\d{9}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const login = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required.',
  }),
});

const adminLogin = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required.',
  }),
});

const sendOtp = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  purpose: Joi.string().valid('LOGIN', 'PASSWORD_RESET').optional(),
});

const verifyOtp = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  otp: Joi.string().pattern(/^\d{4,6}$/).required().messages({
    'any.required': 'OTP is required.',
    'string.pattern.base': 'OTP must be a 4 to 6 digit number.',
  }),
  purpose: Joi.string().valid('LOGIN', 'PASSWORD_RESET').optional(),
});

const forgotPassword = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
});

const resetPassword = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  otp: Joi.string().required().messages({
    'any.required': 'OTP is required.',
  }),
  newPassword: Joi.string().pattern(passwordRegex).required().messages({
    'string.pattern.base': 'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    'any.required': 'New password is required.',
  }),
});

const changePassword = Joi.object({
  oldPassword: Joi.string().required().messages({
    'any.required': 'Old password is required.',
  }),
  newPassword: Joi.string().pattern(passwordRegex).required().messages({
    'string.pattern.base': 'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    'any.required': 'New password is required.',
  }),
});

const setPassword = Joi.object({
  newPassword: Joi.string().pattern(passwordRegex).required().messages({
    'string.pattern.base': 'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    'any.required': 'New password is required.',
  }),
});

const driverRegister = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit mobile number.',
    'any.required': 'Phone number is required.',
  }),
  password: Joi.string().pattern(passwordRegex).required().messages({
    'string.pattern.base': 'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    'any.required': 'Password is required.',
  }),
  name: Joi.string().trim().min(2).max(100).required().messages({
    'any.required': 'Name is required.',
  }),
  vehicleNumber: Joi.string().trim().uppercase().required().messages({
    'any.required': 'Vehicle number is required.',
  }),
  vehicleModel: Joi.string().trim().required().messages({
    'any.required': 'Vehicle model is required.',
  }),
  vehicleCapacity: Joi.number().min(1).max(6).default(4),
  licenseNumber: Joi.string().trim().required().messages({
    'any.required': 'License number is required.',
  }),
});

const location = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  address: Joi.string().optional(),
});

const updateProfile = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  homeLocation: location.optional(),
  pickupLocation: location.optional(),
  dropLocation: location.optional(),
}).min(1);

module.exports = {
  login,
  adminLogin,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  setPassword,
  updateProfile,
};
