
const User = require('../models/User');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Admin = require('../models/Admin');
const Corporate = require('../models/Corporate');
const OTP = require('../models/OTP');
const TokenBlacklist = require('../models/TokenBlacklist');

const { hashPassword, comparePassword } = require('../utils/passwordHelper');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwtGenerator');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

class AuthService {
  _throwError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }

  // ==========================================
  // UNIFIED LOGIN
  // ==========================================
  async login(phone, password) {
    logger.info(`Processing login request for phone: ${phone}`);

    const user = await User.findOne({ phone });
    if (!user) {
      this._throwError('Invalid phone number or password.', 401);
    }

    if (user.status !== 'ACTIVE') {
      this._throwError('Account is not active.', 403);
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      this._throwError('Invalid phone number or password.', 401);
    }

    // Only reached if the User row somehow has no matching profile
    // sub-document (Customer/Driver/Corporate) — a data-integrity edge case,
    // never the everyday path. Named per-role rather than a single generic
    // 'Valued User' so it's at least legible if it's ever seen, and later
    // GET /auth/me calls (which every dashboard layout uses to refresh the
    // name) will resolve the same profile the moment it exists.
    let profileName = 'Account';

    if (user.role === 'Customer') {
      const customer = await Customer.findOne({ userId: user._id });
      profileName = customer ? customer.name : 'Customer';
    } else if (user.role === 'Driver') {
      const driver = await Driver.findOne({ userId: user._id });
      profileName = driver ? driver.name : 'Driver';
    } else if (user.role === 'Corporate') {
      const corporate = await Corporate.findOne({ userId: user._id });
      if (!corporate) {
        this._throwError('Corporate account not found.', 404);
      }
      // A self-registered company can't sign in until an admin approves it —
      // the User row itself is ACTIVE (created that way at registration), so
      // this Corporate-specific status is the actual gate.
      if (corporate.status === 'PENDING') {
        this._throwError('Your corporate account is awaiting admin approval. Please check back soon.', 403);
      }
      if (corporate.status === 'REJECTED') {
        this._throwError('Your corporate account application was not approved. Contact TORQQ support for details.', 403);
      }
      if (corporate.status !== 'ACTIVE') {
        this._throwError('Your corporate account is not active. Contact TORQQ support.', 403);
      }
      profileName = corporate.companyName;
    }

    return {
      user: {
        id: user._id,
        name: profileName,
        phone: user.phone,
        role: user.role,
        hasCustomPassword: user.hasCustomPassword || false,
      },
    };
  }

  // ==========================================
  // ADMIN LOGIN
  // ==========================================
  async adminLogin(phone, password) {
    logger.info(`Processing admin login for phone: ${phone}`);

    const user = await User.findOne({ phone, role: 'Admin' });
    if (!user) {
      this._throwError('Invalid administrator credentials.', 401);
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      this._throwError('Invalid administrator credentials.', 401);
    }

    const admin = await Admin.findOne({ userId: user._id });
    const profileName = admin ? admin.name : 'Admin';

    return {
      user: {
        id: user._id,
        name: profileName,
        phone: user.phone,
        role: user.role,
        hasCustomPassword: user.hasCustomPassword || false,
      },
    };
  }

  // ==========================================
  // OTP ENGINE
  // ==========================================
  async sendOtp(phone, purpose = 'LOGIN') {
    logger.info(`Sending OTP to phone: ${phone} for purpose: ${purpose}`);

    const otpCode = String(require('crypto').randomInt(100000, 999999));

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.findOneAndUpdate(
      { phone, purpose },
      { otp: otpCode, expiresAt },
      { upsert: true, new: true }
    );

    logger.info(`[SMS Simulation] OTP sent to ${phone} for ${purpose}`);
    // In dev mode, log the OTP so you can use it without real SMS
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n📱 [DEV OTP] Phone: ${phone} | Code: ${otpCode} | Purpose: ${purpose}\n`);
    }

    return { 
      success: true, 
      message: 'OTP verification code sent successfully.',
      // Include OTP in response during development for easy testing
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode }),
    };
  }

  async verifyOtp(phone, otp, purpose = 'LOGIN', name = '') {
    logger.info(`Verifying OTP for phone ${phone} with purpose ${purpose}`);

    const record = await OTP.findOne({ phone, otp, purpose, expiresAt: { $gt: new Date() } });
    if (!record) {
      this._throwError('Invalid or expired OTP code.', 400);
    }

    await OTP.deleteOne({ _id: record._id });

    if (purpose === 'PASSWORD_RESET') {
      return { success: true, message: 'OTP verified successfully.' };
    }

    let user = await User.findOne({ phone });
    let profileName = 'Customer';

    if (!user) {
      const placeholderPassword = await hashPassword(require('crypto').randomBytes(16).toString('hex'));
      user = await User.create({ phone, password: placeholderPassword, role: 'Customer' });
      const customerName = name || `User ${phone.slice(-4)}`;
      await Customer.create({ userId: user._id, name: customerName });
      profileName = customerName;
    } else if (user.role !== 'Customer') {
      // Non-customer roles (Admin, Driver) should use password login, not OTP.
      this._throwError('Please use password login for this account.', 400);
    } else {
      const customer = await Customer.findOne({ userId: user._id });
      if (customer) profileName = customer.name;
    }

    return {
      success: true,
      message: 'OTP verified. Session established.',
      user: {
        id: user._id,
        name: profileName,
        phone: user.phone,
        role: user.role,
        hasCustomPassword: user.hasCustomPassword || false,
      },
    };
  }

  // ==========================================
  // PASSWORD RECOVERY
  // ==========================================
  async forgotPassword(phone) {
    logger.info(`Processing forgot password request for phone: ${phone}`);

    const user = await User.findOne({ phone });
    if (!user) {
      this._throwError('Phone number not found.', 404);
    }

    return this.sendOtp(phone, 'PASSWORD_RESET');
  }

  async resetPassword(phone, otp, newPassword) {
    logger.info(`Processing password reset execution for phone: ${phone}`);

    await this.verifyOtp(phone, otp, 'PASSWORD_RESET');

    const user = await User.findOne({ phone });
    if (!user) {
      this._throwError('User account not found.', 404);
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    logger.info(`Password updated successfully for user phone: ${phone}`);
    return { success: true, message: 'Password has been reset successfully.' };
  }

  // ==========================================
  // REFRESH & SESSION LOGOUT
  // ==========================================
  async refresh(token) {
    try {
      const decoded = verifyRefreshToken(token);

      const isBlacklisted = await TokenBlacklist.findOne({ token });
      if (isBlacklisted) {
        this._throwError('Refresh token has been blacklisted.', 401);
      }

      const user = await User.findById(decoded.id);
      if (!user || user.status !== 'ACTIVE') {
        this._throwError('User not found or inactive.', 401);
      }

      const payload = { id: user._id, role: user.role };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Resolve the real display name from the role-specific profile, same
      // as getMe() does. User has no `name` field of its own, so reading
      // user.name here was always undefined.
      let name = '';
      if (user.role === 'Customer') {
        const customer = await Customer.findOne({ userId: user._id });
        name = customer ? customer.name : '';
      } else if (user.role === 'Driver') {
        const driver = await Driver.findOne({ userId: user._id });
        name = driver ? driver.name : '';
      } else if (user.role === 'Admin') {
        const admin = await Admin.findOne({ userId: user._id });
        name = admin ? admin.name : '';
      } else if (user.role === 'Corporate') {
        const corporate = await Corporate.findOne({ userId: user._id });
        name = corporate ? corporate.companyName : '';
      }

      return {
        success: true,
        accessToken,
        refreshToken,
        user: { id: user._id, name, phone: user.phone, role: user.role, status: user.status },
      };
    } catch (error) {
      this._throwError('Invalid or expired refresh token.', 401);
    }
  }

  async logout(accessToken, refreshToken) {
    logger.info('Invalidating session tokens...');

    // Use fixed TTLs instead of trusting unverified token claims. jwts
    // would need the server secret to verify, which defeats the purpose of
    // logout (the secret might have rotated). A 24h / 7d blacklist TTL
    // matches the respective token lifetimes and prevents storage
    // amplification from forged tokens with extreme exp values.
    if (accessToken) {
      await TokenBlacklist.create({
        token: accessToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).catch((err) => logger.error('Failed to blacklist access token', { error: err.message }));
    }

    if (refreshToken) {
      await TokenBlacklist.create({
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).catch((err) => logger.error('Failed to blacklist refresh token', { error: err.message }));
    }

    return { success: true, message: 'Logged out successfully.' };
  }

  // ==========================================
  // PROFILE MANAGEMENT
  // ==========================================
  async getMe(userId, role) {
    const user = await User.findById(userId).select('-password');
    if (!user) this._throwError('User account not found.', 404);

    let details = {};

    if (role === 'Customer') {
      const customer = await Customer.findOne({ userId });
      details = {
        name: customer ? customer.name : '',
      };
    } else if (role === 'Driver') {
      const driver = await Driver.findOne({ userId });
      // Self-view masks the bank account number (last 4 only). The full number
      // is sensitive and is only returned on admin surfaces (admin driver CRUD
      // / export). This is defense-in-depth: the driver never needs to read
      // their whole account number back from the API.
      const maskAccount = (n) => {
        if (!n) return n || null;
        const s = String(n);
        return s.length <= 4 ? s : `••••${s.slice(-4)}`;
      };
      const bd = driver && driver.bankDetails ? driver.bankDetails : null;
      const maskedBank = bd ? {
        accountHolderName: bd.accountHolderName,
        accountNumber: maskAccount(bd.accountNumber),
        ifsc: bd.ifsc,
        bankName: bd.bankName,
        // proofUrl deliberately omitted from self-view.
      } : null;
      details = {
        name: driver ? driver.name : '',
        driverCode: driver ? driver.driverCode : null,
        vehicleNumber: driver ? driver.vehicleNumber : null,
        vehicleModel: driver ? driver.vehicleModel : null,
        vehicleCapacity: driver ? driver.vehicleCapacity : null,
        licenseNumber: driver ? driver.licenseNumber : null,
        upiId: driver ? driver.upiId : null,
        owner: driver ? driver.owner : null,
        bankDetails: maskedBank,
        zoneId: driver ? driver.zoneId : null,
        areaId: driver ? driver.areaId : null,
        routeId: driver ? driver.routeId : null,
      };
    } else if (role === 'Admin') {
      const admin = await Admin.findOne({ userId });
      details = {
        name: admin ? admin.name : '',
        permissions: admin ? admin.permissions : [],
      };
    } else if (role === 'Corporate') {
      const corporate = await Corporate.findOne({ userId });
      details = {
        name: corporate ? corporate.companyName : '',
        companyName: corporate ? corporate.companyName : '',
        contactPerson: corporate ? corporate.contactPerson : null,
        billingEmail: corporate ? corporate.billingEmail : null,
        employeeLimit: corporate ? corporate.employeeLimit : null,
      };
    }

    return {
      id: user._id,
      phone: user.phone,
      role: user.role,
      status: user.status,
      ...details,
    };
  }

  async updateProfile(userId, role, updateData) {
    const user = await User.findById(userId);
    if (!user) this._throwError('User account not found.', 404);

    if (role === 'Customer') {
      const customer = await Customer.findOne({ userId });
      if (customer) {
        if (updateData.name) customer.name = updateData.name;
        if (updateData.homeLocation) customer.homeLocation = updateData.homeLocation;
        if (updateData.pickupLocation) customer.pickupLocation = updateData.pickupLocation;
        if (updateData.dropLocation) customer.dropLocation = updateData.dropLocation;
        await customer.save();
      }
    } else if (role === 'Driver') {
      const driver = await Driver.findOne({ userId });
      if (driver) {
        if (updateData.name) driver.name = updateData.name;
        await driver.save();
      }
    } else if (role === 'Admin') {
      const admin = await Admin.findOne({ userId });
      if (admin) {
        if (updateData.name) admin.name = updateData.name;
        await admin.save();
      }
    } else if (role === 'Corporate') {
      const corporate = await Corporate.findOne({ userId });
      if (corporate) {
        if (updateData.companyName) corporate.companyName = updateData.companyName;
        if (updateData.contactPerson) corporate.contactPerson = updateData.contactPerson;
        if (updateData.billingEmail) corporate.billingEmail = updateData.billingEmail;
        await corporate.save();
      }
    }

    return this.getMe(userId, role);
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId);
    if (!user) this._throwError('User account not found.', 404);

    const isMatch = await comparePassword(oldPassword, user.password);
    if (!isMatch) this._throwError('Incorrect old password.', 400);

    user.password = await hashPassword(newPassword);
    await user.save();
    return { success: true, message: 'Password changed successfully.' };
  }

  async setPassword(userId, newPassword) {
    const user = await User.findById(userId);
    if (!user) this._throwError('User not found.', 404);

    user.password = await hashPassword(newPassword);
    user.hasCustomPassword = true;
    await user.save();

    return { success: true, message: 'Password set successfully.' };
  }

  // ==========================================
  // DRIVER SELF-REGISTRATION
  // ==========================================
  async driverRegister(data) {
    logger.info(`Processing driver registration for phone: ${data.phone}`);

    // Check if user already exists
    const existingUser = await User.findOne({ phone: data.phone });
    if (existingUser) {
      this._throwError('Phone number already registered.', 400);
    }

    // Create User account
    const hashedPassword = await hashPassword(data.password);
    const user = await User.create({
      phone: data.phone,
      password: hashedPassword,
      role: 'Driver',
      status: 'ACTIVE',
      hasCustomPassword: true,
    });

    // Create Driver profile
    const driver = await Driver.create({
      userId: user._id,
      name: data.name,
      vehicleNumber: data.vehicleNumber.toUpperCase(),
      vehicleModel: data.vehicleModel,
      vehicleCapacity: data.vehicleCapacity || 4,
      licenseNumber: data.licenseNumber,
      status: 'PENDING_APPROVAL',
      isOnline: false,
      isAvailable: false,
    });

    logger.info(`Driver registered successfully: ${user._id}`);

    return {
      user: {
        id: user._id,
        name: driver.name,
        phone: user.phone,
        role: user.role,
        hasCustomPassword: true,
      },
      driver: {
        id: driver._id,
        name: driver.name,
        vehicleNumber: driver.vehicleNumber,
        vehicleModel: driver.vehicleModel,
        status: driver.status,
      },
      message: 'Driver registration successful. Please wait for admin approval.',
    };
  }

  // ==========================================
  // CORPORATE SELF-REGISTRATION
  // ==========================================
  /**
   * A company signs up for its own account from the customer portal's
   * "Corporate" tab. This only creates the account — it starts PENDING and
   * cannot log in (see the Corporate status check in login()) until an admin
   * reviews and approves it from the admin console, same shape as driver
   * self-registration above.
   */
  async corporateRegister(data) {
    logger.info(`Processing corporate registration for phone: ${data.phone}`);

    const existingUser = await User.findOne({ phone: data.phone });
    if (existingUser) {
      this._throwError('Phone number already registered.', 400);
    }

    const hashedPassword = await hashPassword(data.password);
    const user = await User.create({
      phone: data.phone,
      password: hashedPassword,
      role: 'Corporate',
      status: 'ACTIVE',
      hasCustomPassword: true,
    });

    const corporate = await Corporate.create({
      userId: user._id,
      companyName: data.companyName,
      contactPerson: data.contactPerson || undefined,
      billingEmail: data.billingEmail || undefined,
      gstNumber: data.gstNumber || undefined,
      address: data.address || undefined,
      status: 'PENDING',
    });

    logger.info(`Corporate account registered, pending approval: ${user._id}`);

    return {
      user: {
        id: user._id,
        name: corporate.companyName,
        phone: user.phone,
        role: user.role,
        hasCustomPassword: true,
      },
      corporate: {
        id: corporate._id,
        companyName: corporate.companyName,
        status: corporate.status,
      },
      message: 'Corporate account submitted. Please wait for admin approval before signing in.',
    };
  }
}

module.exports = new AuthService();
