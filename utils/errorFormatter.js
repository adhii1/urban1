const formatError = (message, errors = []) => ({ success: false, message, errors: Array.isArray(errors) ? errors : [errors] });
module.exports = formatError;
