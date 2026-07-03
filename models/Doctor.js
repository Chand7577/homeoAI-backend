const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Doctor name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  role: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['Core Team', 'External Doctor'],
    required: [true, 'Doctor type is required']
  },
  specialization: {
    type: String,
    trim: true
  },
  qualifications: {
    type: String,
    trim: true
  },
  experience: {
    type: Number, // years of experience
    min: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'On Break'],
    default: 'Active'
  },
  initials: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: 'bg-blue-600' // Tailwind color class
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for faster queries
doctorSchema.index({ type: 1, status: 1 });
doctorSchema.index({ email: 1 });
doctorSchema.index({ name: 'text', specialization: 'text' }); // Text search

// Generate initials before saving
doctorSchema.pre('save', function(next) {
  if (!this.initials && this.name) {
    this.initials = this.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  next();
});

// Assign random color if not provided
doctorSchema.pre('save', function(next) {
  if (!this.color) {
    const colors = [
      'bg-emerald-600', 'bg-blue-600', 'bg-indigo-600', 
      'bg-purple-600', 'bg-pink-600', 'bg-red-600',
      'bg-orange-600', 'bg-amber-600', 'bg-lime-600', 'bg-cyan-600'
    ];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }
  next();
});

module.exports = mongoose.model('Doctor', doctorSchema);
