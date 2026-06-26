const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'homeo-ai-secret-key', {
    expiresIn: '7d',
  });
};

// Register new user
const register = async (req, res) => {
  try {
    const { name, email, phone, password, role, specialization, experience, qualifications } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name, email, phone, password, role) are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'phone number';
      return res.status(400).json({
        success: false,
        message: `A user with this ${field} already exists`
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      phone,
      password,
      role,
      specialization: specialization || '',
      experience: experience || '',
      qualifications: qualifications || '',
      status: role === 'Admin' ? 'Approved' : 'Pending' // Auto-approve admins
    });

    await user.save();

    // Don't include password in response
    const { password: _, ...userResponse } = user.toObject();

    res.status(201).json({
      success: true,
      message: role === 'Admin' 
        ? 'Admin account created successfully' 
        : 'Registration successful! Your account is pending admin approval.',
      user: userResponse
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check for admin credentials
    if (email === 'admin@gmail.com' && password === 'admin') {
      // Create or find admin user
      let adminUser = await User.findOne({ email: 'admin@gmail.com' });
      
      if (!adminUser) {
        adminUser = new User({
          name: 'System Administrator',
          email: 'admin@gmail.com',
          phone: '+91 99999 99999',
          password: 'admin1',   // must be ≥ 6 chars to pass schema validation
          role: 'Admin',
          status: 'Approved'
        });
        await adminUser.save();
      }

      // Update login tracking
      adminUser.lastLogin = new Date();
      adminUser.loginCount += 1;
      await adminUser.save();

      const token = generateToken(adminUser._id);
      const { password: _, ...userResponse } = adminUser.toObject();

      return res.json({
        success: true,
        message: 'Admin login successful',
        user: userResponse,
        token
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is approved
    if (user.status !== 'Approved') {
      const statusMessages = {
        'Pending': 'Your account is pending admin approval',
        'Rejected': 'Your account has been rejected. Please contact support.',
        'Suspended': 'Your account has been suspended. Please contact support.'
      };
      
      return res.status(403).json({
        success: false,
        message: statusMessages[user.status] || 'Account access denied'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Update login tracking
    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Don't include password in response
    const { password: _, ...userResponse } = user.toObject();

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// Admin: Get all pending registrations
const getPendingRegistrations = async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: 'Pending' })
      .select('-password')
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      users: pendingUsers
    });
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending registrations'
    });
  }
};

// Admin: Approve user registration
const approveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'Approved';
    user.approvedAt = new Date();
    user.approvedBy = req.user.userId;
    await user.save();

    res.json({
      success: true,
      message: `${user.name} has been approved successfully`
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve user'
    });
  }
};

// Admin: Reject user registration
const rejectUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'Rejected';
    user.rejectedAt = new Date();
    user.rejectionReason = reason || 'No reason provided';
    await user.save();

    res.json({
      success: true,
      message: `${user.name} has been rejected`
    });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject user'
    });
  }
};

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  getPendingRegistrations,
  approveUser,
  rejectUser,
  getAllUsers
};