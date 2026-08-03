
const express = require('express');
const router = express.Router();
const formatResponse = require('../../utils/responseFormatter');

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    version: '2.0.0-beta',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
