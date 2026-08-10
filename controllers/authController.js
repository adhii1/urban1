
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const authService = require('../services/authService');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwtGenerator');

const isDev = process.env.NODE_ENV !== 'production';

const setAuthCookies = (res, user) => {
  const payload = { id: user.id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  res.cookie('accessToken', accessToken, { httpOnly: true, secure: !isDev, sameSite: isDev ? 'lax' : 'strict' });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: !isDev, sameSite: isDev ? 'lax' : 'strict' });
  return accessToken;
};

const login = asyncWrapper(async (req, res) => {
  const data = await authService.login(req.body.phone, req.body.password);

  const accessToken = setAuthCookies(res, data.user);

  res.status(200).json(formatResponse('Login successful.', { ...data, accessToken }));
});

const adminLogin = asyncWrapper(async (req, res) => {
  const data = await authService.adminLogin(req.body.phone, req.body.password);

  const accessToken = setAuthCookies(res, data.user);

  res.status(200).json(formatResponse('Admin login successful.', { ...data, accessToken }));
});

const sendOtp = asyncWrapper(async (req, res) => {
  const data = await authService.sendOtp(req.body.phone, req.body.purpose);
  res.status(200).json(formatResponse('OTP sent successfully.', data));
});

const verifyOtp = asyncWrapper(async (req, res) => {
  const data = await authService.verifyOtp(req.body.phone, req.body.otp, req.body.purpose, req.body.name);
  if (data.user) {
    const accessToken = setAuthCookies(res, data.user);
    data.accessToken = accessToken;
  }
  res.status(200).json(formatResponse('OTP verification succeeded.', data));
});

const forgotPassword = asyncWrapper(async (req, res) => {
  const data = await authService.forgotPassword(req.body.phone);
  res.status(200).json(formatResponse('Password reset OTP sent.', data));
});

const resetPassword = asyncWrapper(async (req, res) => {
  const data = await authService.resetPassword(req.body.phone, req.body.otp, req.body.newPassword);
  res.status(200).json(formatResponse('Password reset succeeded.', data));
});

const refresh = asyncWrapper(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Refresh token required.' });
  }
  const data = await authService.refresh(token);
  if (data.accessToken && data.refreshToken) {
    res.cookie('accessToken', data.accessToken, { httpOnly: true, secure: !isDev, sameSite: isDev ? 'lax' : 'strict' });
    res.cookie('refreshToken', data.refreshToken, { httpOnly: true, secure: !isDev, sameSite: isDev ? 'lax' : 'strict' });
  }
  res.status(200).json(formatResponse('Token refreshed successfully.', { success: true }));
});

const logout = asyncWrapper(async (req, res) => {
  const accessToken = req.token;
  const refreshToken = req.cookies.refreshToken;

  const data = await authService.logout(accessToken, refreshToken);
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  res.status(200).json(formatResponse('Logged out successfully.', data));
});

const getMe = asyncWrapper(async (req, res) => {
  const data = await authService.getMe(req.user.id, req.user.role);
  res.status(200).json(formatResponse('User profile details retrieved.', data));
});

const updateProfile = asyncWrapper(async (req, res) => {
  const data = await authService.updateProfile(req.user.id, req.user.role, req.body);
  res.status(200).json(formatResponse('Profile updated successfully.', data));
});

const changePassword = asyncWrapper(async (req, res) => {
  const data = await authService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
  res.status(200).json(formatResponse('Password updated successfully.', data));
});

const setPassword = asyncWrapper(async (req, res) => {
  const data = await authService.setPassword(req.user.id, req.body.newPassword);
  res.status(200).json(formatResponse('Password set successfully.', data));
});

const driverRegister = asyncWrapper(async (req, res) => {
  const data = await authService.driverRegister(req.body);

  // Auto-login after registration
  const accessToken = setAuthCookies(res, data.user);

  res.status(201).json(formatResponse(data.message, { ...data, accessToken }));
});

module.exports = {
  login,
  adminLogin,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  refresh,
  logout,
  getMe,
  updateProfile,
  changePassword,
  setPassword,
  driverRegister,
};
