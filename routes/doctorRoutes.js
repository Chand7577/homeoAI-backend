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
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getDoctors);
router.get('/stats', getDoctorStats);
router.get('/:id', getDoctor);

// Protected routes (require authentication)
router.post('/', requireAdmin, createDoctor);
router.put('/:id', requireAdmin, updateDoctor);
router.delete('/:id', requireAdmin, deleteDoctor);

module.exports = router;
