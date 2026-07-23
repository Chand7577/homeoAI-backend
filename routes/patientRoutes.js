const express = require('express');
const router = express.Router();
const { authenticate, requireClinicalUser } = require('../middleware/auth');
const { 
  getPatients, 
  getPatient, 
  createPatient, 
  updatePatient, 
  deletePatient,
  getPatientStats 
} = require('../controllers/patientController');

// All routes require authentication
router.use(authenticate);

// Stats - available to all authenticated users (shows their own stats)
router.get('/stats', getPatientStats);

// List all patients - ONLY for clinical users (doctors/admin)
router.get('/', requireClinicalUser, getPatients);

// Create patient - ONLY for clinical users
router.post('/', requireClinicalUser, createPatient);

// Individual patient operations - controller will check if user owns this patient
router.get('/:id', getPatient);        // Patients can see their own data
router.put('/:id', updatePatient);     // Patients can update their own data
router.delete('/:id', requireClinicalUser, deletePatient); // Only clinical users can delete

module.exports = router;
