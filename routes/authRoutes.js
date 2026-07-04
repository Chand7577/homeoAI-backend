const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getProfile,
  getPendingRegistrations,
  approveUser,
  rejectUser,
  getAllUsers,
  getChatContacts,
  deleteUser
} = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);
router.get('/chat-contacts', authenticate, getChatContacts);

// Admin only routes
router.get('/pending', authenticate, requireAdmin, getPendingRegistrations);
router.put('/approve/:userId', authenticate, requireAdmin, approveUser);
router.put('/reject/:userId', authenticate, requireAdmin, rejectUser);
router.get('/users', authenticate, requireAdmin, getAllUsers);
router.delete('/users/:userId', authenticate, requireAdmin, deleteUser);

module.exports = router;