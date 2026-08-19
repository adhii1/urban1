const formatError = require('../utils/errorFormatter');

const validateRequest = (schema, property = 'body', errorCode) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      const errorDetails = error.details.map((d) => ({
        ...(errorCode ? { code: errorCode } : {}),
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json(formatError('Input validation failed.', errorDetails));
    }
    req[property] = value;
    next();
  };
};

module.exports = validateRequest;
