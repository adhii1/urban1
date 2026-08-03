const Driver = require('../models/Driver');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');

// Ensure upload directory exists
(async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    logger.error('Failed to create uploads directory', { error: err.message });
  }
})();

/**
 * Upload driver document (license, RC, insurance)
 * POST /api/v1/driver/documents/upload
 */
const uploadDocument = asyncWrapper(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Please upload a document');
  }

  const { type } = req.body; // license, vehicleRC, or insurance
  const validTypes = ['license', 'vehicleRC', 'insurance'];
  
  if (!type || !validTypes.includes(type)) {
    // Delete the uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    throw new ValidationError('Document type must be one of: license, vehicleRC, insurance');
  }

  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    await fs.unlink(req.file.path).catch(() => {});
    throw new NotFoundError('Driver profile');
  }

  const fileUrl = `/uploads/documents/${req.file.filename}`;
  const now = new Date();

  // Update driver document
  const updateData = {
    $set: {
      [`documents.${type}.url`]: fileUrl,
      [`documents.${type}.uploadedAt`]: now,
      [`documents.${type}.verified`]: false, // Reset verification when new doc uploaded
    }
  };

  // If insurance, also store expiry date
  if (type === 'insurance' && req.body.expiryDate) {
    updateData.$set['documents.insurance.expiryDate'] = new Date(req.body.expiryDate);
  }

  await Driver.findByIdAndUpdate(driver._id, updateData);

  logger.info(`Driver ${driver._id} uploaded ${type} document: ${fileUrl}`);

  return res.status(200).json(
    formatResponse('Document uploaded successfully', {
      type,
      url: fileUrl,
      uploadedAt: now,
      message: 'Document uploaded and pending verification',
    })
  );
});

/**
 * Get driver's documents
 * GET /api/v1/driver/documents
 */
const getDocuments = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id }).select('documents');
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  return res.status(200).json(
    formatResponse('Documents retrieved', {
      documents: driver.documents,
    })
  );
});

/**
 * Admin: Verify driver document
 * PATCH /api/v1/admin/drivers/:driverId/documents/:type/verify
 */
const verifyDocument = asyncWrapper(async (req, res) => {
  const { driverId, type } = req.params;
  const { verified } = req.body;

  const validTypes = ['license', 'vehicleRC', 'insurance'];
  if (!validTypes.includes(type)) {
    throw new ValidationError('Document type must be one of: license, vehicleRC, insurance');
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  if (!driver.documents?.[type]?.url) {
    throw new ValidationError(`No ${type} document uploaded`);
  }

  const updateData = {
    $set: {
      [`documents.${type}.verified`]: verified === true,
      [`documents.${type}.verifiedAt`]: new Date(),
    }
  };

  // If all required documents are verified and driver is PENDING_APPROVAL, activate them
  if (verified === true) {
    const hasLicense = driver.documents.license?.url && (type === 'license' || driver.documents.license?.verified);
    const hasRC = driver.documents.vehicleRC?.url && (type === 'vehicleRC' || driver.documents.vehicleRC?.verified);
    
    if (hasLicense && hasRC && driver.status === 'PENDING_APPROVAL') {
      updateData.$set.status = 'ACTIVE';
      logger.info(`Driver ${driverId} auto-activated after document verification`);
    }
  }

  await Driver.findByIdAndUpdate(driverId, updateData);

  return res.status(200).json(
    formatResponse(`Document ${type} ${verified ? 'verified' : 'unverified'}`, {
      type,
      verified,
    })
  );
});

module.exports = {
  uploadDocument,
  getDocuments,
  verifyDocument,
};
