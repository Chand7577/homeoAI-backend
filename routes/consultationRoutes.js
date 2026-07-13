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
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/doctors', getApprovedDoctors); // Get list of approved doctors for patient form

// Protected routes
router.post('/', createConsultation); // Create new consultation (can be called by patient or anonymous)
router.get('/', authenticate, getConsultations); // Get all consultations (for doctors)
router.get('/:id', authenticate, getConsultation); // Get single consultation
router.put('/:id', authenticate, updateConsultation); // Update consultation status/notes
router.delete('/:id', authenticate, deleteConsultation); // Delete consultation

module.exports = router;
