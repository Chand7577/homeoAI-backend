const User = require('../models/User');

// Helper: map a User document to the doctor-shaped object the frontend expects
const userToDoctor = (u) => {
  const name = u.name || '';
  const initials = name
    .split(' ')
    .map(n => n[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colors = [
    'bg-emerald-600', 'bg-blue-600', 'bg-indigo-600',
    'bg-purple-600', 'bg-pink-600', 'bg-red-600',
    'bg-orange-600', 'bg-amber-600', 'bg-lime-600', 'bg-cyan-600'
  ];
  const color = colors[name.length % colors.length];

  return {
    _id: u._id,
    id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    // "role" in the Doctor schema was a job title; map User.role → type, User.specialization → role label
    role: u.specialization || u.role,
    type: u.role,               // 'Core Team' | 'External Doctor'
    specialization: u.specialization || '',
    qualifications: u.qualifications || '',
    experience: u.experience || '',
    status: u.status === 'Approved' ? 'Active' : u.status,
    initials,
    color,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
};

// GET /api/doctors - Get all doctors (reads from User collection by role)
const getDoctors = async (req, res) => {
  const { type, status, search } = req.query;

  // "type" from the frontend is 'Core Team' or 'External Doctor' — map to User.role
  const filter = {
    isActive: true,
    role: type
      ? type
      : { $in: ['Core Team', 'External Doctor'] },
  };

  // Only show approved users (active members)
  if (status && status !== 'all') {
    // frontend sends 'Active', 'On Break', 'Inactive' — map to User.status
    const statusMap = { Active: 'Approved', Inactive: 'Rejected', 'On Break': 'Suspended' };
    filter.status = statusMap[status] || status;
  } else {
    // Default: only Approved members
    filter.status = 'Approved';
  }

  // Text search
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
      { specialization: new RegExp(search, 'i') },
    ];
  }

  const users = await User.find(filter)
    .select('-password -__v')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: users.map(userToDoctor) });
};

// GET /api/doctors/:id - Get single doctor
const getDoctor = async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -__v');

  if (!user || !user.isActive) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  res.json({ success: true, data: userToDoctor(user) });
};

// POST /api/doctors - Create new doctor
// NOTE: Creating a doctor now means creating a User with the given role.
const createDoctor = async (req, res) => {
  const {
    name,
    email,
    phone,
    role,       // job-title / display role (e.g. "Senior Homeopath")
    type,       // 'Core Team' | 'External Doctor'
    specialization,
    qualifications,
    experience,
    status,
    registrationNumber,
    address,
  } = req.body;

  if (!name || !email || !phone || !type) {
    res.status(400);
    throw new Error('Name, email, phone, and type are required');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    res.status(400);
    throw new Error('A user with this email already exists');
  }

  // Generate a random temporary password — admin should advise user to reset
  const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    password: tempPassword,
    role: type,  // User.role = 'Core Team' | 'External Doctor'
    specialization: role || specialization || '',  // store display role in specialization
    qualifications: qualifications || '',
    experience: experience || '',
    status: 'Approved',  // admin is directly adding them
    isActive: true,
  });

  res.status(201).json({ success: true, data: userToDoctor(user) });
};

// PUT /api/doctors/:id - Update doctor
const updateDoctor = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user || !user.isActive) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  const {
    name,
    email,
    phone,
    role,
    type,
    specialization,
    qualifications,
    experience,
    status,
  } = req.body;

  if (email && email !== user.email) {
    const emailExists = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.params.id },
    });
    if (emailExists) {
      res.status(400);
      throw new Error('Email is already in use');
    }
  }

  if (name)           user.name = name;
  if (email)          user.email = email.toLowerCase();
  if (phone)          user.phone = phone;
  if (type)           user.role = type;
  if (specialization) user.specialization = specialization;
  if (role)           user.specialization = role;  // display role → specialization
  if (qualifications) user.qualifications = qualifications;
  if (experience)     user.experience = experience;
  if (status) {
    const statusMap = { Active: 'Approved', Inactive: 'Rejected', 'On Break': 'Suspended' };
    user.status = statusMap[status] || status;
  }

  await user.save();

  res.json({ success: true, data: userToDoctor(user) });
};

// DELETE /api/doctors/:id - Soft delete doctor (deactivate user)
const deleteDoctor = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  user.isActive = false;
  await user.save();

  res.json({ success: true, message: 'Doctor removed successfully' });
};

// GET /api/doctors/stats - Get doctor statistics
const getDoctorStats = async (req, res) => {
  const coreTeamCount = await User.countDocuments({
    role: 'Core Team',
    status: 'Approved',
    isActive: true,
  });

  const externalDoctorsCount = await User.countDocuments({
    role: 'External Doctor',
    status: 'Approved',
    isActive: true,
  });

  const totalDoctors = coreTeamCount + externalDoctorsCount;

  const onBreakCount = await User.countDocuments({
    role: { $in: ['Core Team', 'External Doctor'] },
    status: 'Suspended',
    isActive: true,
  });

  res.json({
    success: true,
    data: {
      totalDoctors,
      coreTeam: coreTeamCount,
      externalDoctors: externalDoctorsCount,
      onBreak: onBreakCount,
    },
  });
};

module.exports = {
  getDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorStats,
};
