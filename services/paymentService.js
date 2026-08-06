/**
 * Payment Service
 * Handles payment processing with Razorpay integration
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/config');

class PaymentService {
  constructor() {
    this.razorpay = null;
    this.initialized = false;

    if (config.razorpay?.keyId && config.razorpay?.keySecret) {
      try {
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({
          key_id: config.razorpay.keyId,
          key_secret: config.razorpay.keySecret,
        });
        this.initialized = true;
        logger.info('Payment service initialized with Razorpay');
      } catch (err) {
        logger.warn('Razorpay SDK not installed. Running in mock mode. Install with: npm install razorpay');
        this.initialized = false;
      }
    } else {
      logger.warn('Payment service not configured. Set RAZORPAY_KEY_ID and RAZORPAY_SECRET in .env');
    }
  }

  /**
   * Create a payment order
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Amount in paise (smallest currency unit)
   * @param {string} params.currency - Currency code (e.g., 'INR')
   * @param {string} params.receipt - Receipt ID
   * @param {Object} params.notes - Additional notes
   * @returns {Promise<Object>} Payment order details
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    if (!this.initialized || !this.razorpay) {
      // Mock response for development/testing
      return {
        success: true,
        orderId: `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount,
        currency,
        receipt,
        status: 'created',
        mock: true,
      };
    }

    try {
      const order = await this.razorpay.orders.create({
        amount,
        currency,
        receipt,
        notes,
      });

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      };
    } catch (error) {
      logger.error('Failed to create Razorpay order', { error: error.message });
      throw new Error('Payment order creation failed: ' + error.message);
    }
  }

  /**
   * Verify payment signature (Razorpay HMAC SHA256 verification)
   * @param {Object} params
   * @param {string} params.orderId - Razorpay Order ID
   * @param {string} params.paymentId - Razorpay Payment ID
   * @param {string} params.signature - Razorpay Signature
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment({ orderId, paymentId, signature }) {
    if (!this.initialized) {
      // Mock verification: always succeeds in dev mode
      return { success: true, verified: true, mock: true };
    }

    try {
      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', config.razorpay.keySecret)
        .update(body)
        .digest('hex');

      const verified = expectedSignature === signature;

      if (!verified) {
        logger.warn('Razorpay payment signature mismatch', { orderId, paymentId });
      }

      return { success: true, verified };
    } catch (error) {
      logger.error('Payment verification failed', { error: error.message });
      return { success: false, verified: false, error: error.message };
    }
  }

  /**
   * Process refund
   * @param {Object} params
   * @param {string} params.paymentId - Payment ID to refund
   * @param {number} params.amount - Refund amount in paise (optional, full refund if omitted)
   * @returns {Promise<Object>} Refund details
   */
  async processRefund({ paymentId, amount }) {
    if (!this.initialized || !this.razorpay) {
      return {
        success: true,
        refundId: `refund_mock_${Date.now()}`,
        paymentId,
        amount,
        status: 'processed',
        mock: true,
      };
    }

    try {
      const refundOptions = {};
      if (amount) refundOptions.amount = amount;

      const refund = await this.razorpay.payments.refund(paymentId, refundOptions);

      return {
        success: true,
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount,
        status: refund.status,
      };
    } catch (error) {
      logger.error('Refund processing failed', { error: error.message, paymentId });
      throw new Error('Refund processing failed: ' + error.message);
    }
  }

  /**
   * Get payment status
   * @param {string} paymentId - Razorpay Payment ID
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(paymentId) {
    if (!this.initialized || !this.razorpay) {
      return {
        success: true,
        paymentId,
        status: 'captured',
        amount: 0,
        currency: 'INR',
        mock: true,
      };
    }

    try {
      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
      };
    } catch (error) {
      logger.error('Failed to get payment status', { error: error.message, paymentId });
      throw new Error('Failed to get payment status: ' + error.message);
    }
  }

  /**
   * Get Razorpay key ID for frontend
   */
  getKeyId() {
    return config.razorpay?.keyId || '';
  }
}

module.exports = new PaymentService();
