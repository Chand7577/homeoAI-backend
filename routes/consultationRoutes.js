const express = require('express');
const router = express.Router();
const {
  getApprovedDoctors,
  createConsultation,
  getConsultations,
  getConsultation,
  updateConsultation,
  deleteConsultation
} = require('../controllers/consultationController');
const { authenticate, requireClinicalUser } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const consultationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many consultation submissions. Please try again later.' },
});

// Public routes
router.get('/doctors', getApprovedDoctors); // Get list of approved doctors for patient form

// Protected routes
router.post('/', authenticate, consultationLimiter, createConsultation); // Create new consultation (requires authentication to link patientId)
router.get('/', authenticate, getConsultations); // Get consultations (patients see their own, doctors see assigned)
router.get('/:id', authenticate, getConsultation); // Get single consultation
router.put('/:id', authenticate, requireClinicalUser, updateConsultation); // Update consultation status/notes (doctors only)
router.delete('/:id', authenticate, requireClinicalUser, deleteConsultation); // Delete consultation (doctors only)

module.exports = router;
