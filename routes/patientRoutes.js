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

router.use(authenticate, requireClinicalUser);

router.get('/stats',  getPatientStats);  // Must be before /:id route
router.get('/',       getPatients);
router.get('/:id',    getPatient);
router.post('/',      createPatient);
router.put('/:id',    updatePatient);
router.delete('/:id', deletePatient);

module.exports = router;
