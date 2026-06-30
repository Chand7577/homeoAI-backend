const express = require('express');
const router  = express.Router();
const {
  createPrescription,
  getPrescriptions,
  getPrescription,
  updatePrescription,
  deletePrescription,
} = require('../controllers/prescriptionController');

router.post('/',      createPrescription);   // Create
router.get('/',       getPrescriptions);     // List (with ?patientId & pagination)
router.get('/:id',    getPrescription);      // Single
router.put('/:id',    updatePrescription);   // Update
router.delete('/:id', deletePrescription);   // Delete

module.exports = router;
