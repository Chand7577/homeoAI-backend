const express = require('express');
const router = express.Router();
const {
  getDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorStats
} = require('../controllers/doctorController');
const { authenticate } = require('../middleware/auth');

// Public routes (or add protect middleware if you want authentication)
router.get('/', getDoctors);
router.get('/stats', getDoctorStats);
router.get('/:id', getDoctor);

// Protected routes (require authentication)
router.post('/', authenticate, createDoctor);
router.put('/:id', authenticate, updateDoctor);
router.delete('/:id', authenticate, deleteDoctor);

module.exports = router;
