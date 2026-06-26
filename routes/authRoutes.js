const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  getPendingRegistrations,
  approveUser,
  rejectUser,
  getAllUsers
} = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);

// Admin only routes
router.get('/pending', authenticate, requireAdmin, getPendingRegistrations);
router.put('/approve/:userId', authenticate, requireAdmin, approveUser);
router.put('/reject/:userId', authenticate, requireAdmin, rejectUser);
router.get('/users', authenticate, requireAdmin, getAllUsers);

module.exports = router;