const User = require('../models/User');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { getJwtSecret, isInsecureTestMode } = require('../middleware/auth');

const authCookieOptions = () => {
  const localTest = isInsecureTestMode() && process.env.NODE_ENV !== 'production';
  return {
    httpOnly: true,
    secure: !localTest,
    sameSite: localTest ? 'lax' : 'none',
  };
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, getJwtSecret(), {
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
    if (password.length < 12) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 12 characters long'
      });
    }

    // Public registration must never mint privileged accounts. Administrators
    // create Core Team accounts; external doctors stay pending until approved.
    if (!['Patient', 'External Doctor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Only Patient or External Doctor registration is allowed'
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
      status: 'Pending'
    });

    await user.save();

    // Don't include password in response
    const { password: _, ...userResponse } = user.toObject();

    res.status(201).json({
      success: true,
      message: 'Registration successful! Your account is pending admin approval.',
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

    // Explicit test shortcut. It is disabled unless ENABLE_INSECURE_TEST_AUTH
    // is deliberately set in the environment.
    if (isInsecureTestMode() && email === 'admin@gmail.com' && password === 'admin') {
      let adminUser = await User.findOne({ email });
      if (!adminUser) {
        adminUser = new User({
          name: 'Local Test Administrator',
          email,
          phone: '+91 99999 99999',
          password,
          role: 'Admin',
          status: 'Approved',
          isActive: true,
        });
      } else {
        adminUser.password = password;
        adminUser.role = 'Admin';
        adminUser.status = 'Approved';
        adminUser.isActive = true;
      }
      // The production schema intentionally rejects short passwords. Bypass
      // only that validator in explicit local-test mode; the pre-save hook
      // still hashes the test password.
      await adminUser.save({ validateBeforeSave: false });

      const token = generateToken(adminUser._id);
      res.cookie('homeo_token', token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
      const { password: _, ...userResponse } = adminUser.toObject();
      return res.json({ success: true, message: 'Local test admin login successful', user: userResponse });
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

    res.cookie('homeo_token', token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Don't include password in response
    const { password: _, ...userResponse } = user.toObject();

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse
      // No token in response body anymore
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

// Get chat contacts (any authenticated user)
const getChatContacts = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const currentUser = await User.findById(currentUserId).select('role');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let contacts = [];

    if (currentUser.role === 'Patient') {
      // Patients see all doctors (Admin, Core Team, External Doctor) — approved and active
      contacts = await User.find({
        role: { $in: ['Admin', 'Core Team', 'External Doctor'] },
        status: 'Approved',
        isActive: true
      }).select('-password').sort({ name: 1 });
    } else {
      // Doctors and Admin see patients:
      // 1. All Patient users in the system (any status — if they can log in, they're approved)
      const patientUsers = await User.find({
        role: 'Patient',
        isActive: true
      }).select('-password').sort({ name: 1 });

      // 2. Also find patients who have chatted (by searching Message collection)
      //    in case a patient sent a message but isn't in the User list
      const allRooms = await Message.distinct('senderId', {
        $or: [
          { receiverId: currentUserId.toString() },
          { senderId: currentUserId.toString() }
        ]
      });

      // Collect IDs of patients already in our list
      const patientIds = new Set(patientUsers.map(u => u._id.toString()));

      // Find any senders who are not already in our contacts
      const missingIds = allRooms.filter(id => id !== currentUserId.toString() && !patientIds.has(id));
      let extraContacts = [];
      if (missingIds.length > 0) {
        // Filter out invalid ObjectIds to prevent CastError
        const validObjectIds = missingIds.filter(id => {
          try {
            return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
          } catch {
            return false;
          }
        });
        
        if (validObjectIds.length > 0) {
          extraContacts = await User.find({
            _id: { $in: validObjectIds },
            role: 'Patient'
          }).select('-password');
        }
      }

      // Merge and deduplicate
      const mergedMap = new Map();
      [...patientUsers, ...extraContacts].forEach(u => mergedMap.set(u._id.toString(), u));
      contacts = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // Attach last message info for each contact
    const contactsWithLastMsg = await Promise.all(contacts.map(async (contact) => {
      const roomId1 = [currentUserId.toString(), contact._id.toString()].sort().join('_');
      const lastMsg = await Message.findOne({ roomId: roomId1 }).sort({ createdAt: -1 }).select('text time createdAt attachmentName attachmentType');
      
      // Convert Mongoose document to plain object safely
      const contactObj = contact.toObject ? contact.toObject() : contact;
      
      return {
        ...contactObj,
        lastMessage: lastMsg ? (lastMsg.text || (lastMsg.attachmentName ? '📎 Attachment' : '')) : null,
        lastMessageTime: lastMsg ? lastMsg.createdAt : null
      };
    }));

    // Sort by last message time (most recent first), then alphabetically
    contactsWithLastMsg.sort((a, b) => {
      if (a.lastMessageTime && b.lastMessageTime) {
        return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
      }
      if (a.lastMessageTime) return -1;
      if (b.lastMessageTime) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      users: contactsWithLastMsg
    });
  } catch (error) {
    console.error('Get chat contacts error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      currentUserId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat contacts'
    });
  }
};

// Logout user (clear cookie)
const logout = async (req, res) => {
  try {
    // Clear the httpOnly cookie
    res.clearCookie('homeo_token', authCookieOptions());

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// Admin: Delete user account
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting the primary admin account
    if (user.email === 'admin@gmail.com') {
      return res.status(403).json({
        success: false,
        message: 'Primary admin account cannot be deleted'
      });
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: `${user.name} (${user.email}) has been deleted successfully`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

module.exports = {
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
};
