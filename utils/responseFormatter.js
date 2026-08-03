const formatResponse = (message, data = {}, meta = {}) => ({ success: true, message, data, meta });
module.exports = formatResponse;
