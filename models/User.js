const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { 
    type: String, 
    enum: ['Admin', 'Core Team', 'External Doctor', 'Patient'], 
    required: true 
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Suspended'],
    default: 'Pending'
  },
  specialization: { type: String, default: '' }, // For doctors
  experience: { type: String, default: '' }, // Years of experience
  qualifications: { type: String, default: '' }, // Medical qualifications
  
  // Profile information
  profilePicture: { type: String, default: '' },
  bio: { type: String, default: '' },
  
  // Timestamps for approval process
  requestedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String, default: '' },
  
  // Login tracking
  lastLogin: { type: Date },
  loginCount: { type: Number, default: 0 },
  
  // Account settings
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
}, { timestamps: true });

// Hash password before saving (Mongoose 9: async hooks use returned Promise, no next())
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get user's initials for avatar
UserSchema.methods.getInitials = function() {
  return this.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Get user's display role
UserSchema.methods.getDisplayRole = function() {
  const roleMap = {
    'Admin': 'Administrator & Chief Consultant', 
    'Core Team': 'Core Clinical Team',
    'External Doctor': 'External Consultant',
    'Patient': 'Patient'
  };
  return roleMap[this.role] || this.role;
};

// Generate avatar color based on name
UserSchema.methods.getAvatarColor = function() {
  const colors = [
    'bg-emerald-600', 'bg-blue-600', 'bg-indigo-600', 
    'bg-amber-500', 'bg-rose-500', 'bg-slate-600',
    'bg-purple-600', 'bg-teal-600', 'bg-orange-600'
  ];
  const index = this.name.length % colors.length;
  return colors[index];
};

module.exports = mongoose.model('User', UserSchema);