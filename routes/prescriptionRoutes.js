const express = require('express');
const router = express.Router();
const { createPrescription, getPrescriptions, getPrescription } = require('../controllers/prescriptionController');

router.post('/',     createPrescription);
router.get('/',      getPrescriptions);
router.get('/:id',   getPrescription);

module.exports = router;
