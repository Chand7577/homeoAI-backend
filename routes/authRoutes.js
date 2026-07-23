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

const rateLimit = require('express-rate-limit');

// Stricter rate limiter specifically for login/register to prevent brute force / password spraying
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 100, // 30 login/register attempts per 15 min per IP
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
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