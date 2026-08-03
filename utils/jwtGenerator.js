const jwt = require('jsonwebtoken');
const config = require('../config/config');

const generateAccessToken = (payload) => jwt.sign(payload, config.jwt.secret, { expiresIn: `${config.jwt.accessExpirationMinutes}m` });
const generateRefreshToken = (payload) => jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: `${config.jwt.refreshExpirationDays}d` });
const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);
const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken };
