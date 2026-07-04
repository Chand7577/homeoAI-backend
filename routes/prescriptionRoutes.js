const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createPrescription,
  getPrescriptions,
  getPrescription,
  updatePrescription,
  deletePrescription,
} = require('../controllers/prescriptionController');

// All prescription routes require authentication
router.post('/',      authenticate, createPrescription);   // Create
router.get('/',       authenticate, getPrescriptions);     // List (with ?patientId & pagination)
router.get('/:id',    authenticate, getPrescription);      // Single
router.put('/:id',    authenticate, updatePrescription);   // Update
router.delete('/:id', authenticate, deletePrescription);   // Delete

module.exports = router;
