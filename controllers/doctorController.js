const Doctor = require('../models/Doctor');

// GET /api/doctors - Get all doctors
const getDoctors = async (req, res) => {
  const { type, status, search } = req.query;
  
  const filter = { isActive: true };
  
  // Filter by type (Core Team or External Doctor)
  if (type) {
    filter.type = type;
  }
  
  // Filter by status
  if (status && status !== 'all') {
    filter.status = status;
  }
  
  // Text search
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
      { specialization: new RegExp(search, 'i') },
      { role: new RegExp(search, 'i') }
    ];
  }
  
  const doctors = await Doctor.find(filter)
    .select('-__v')
    .sort({ createdAt: -1 });
  
  res.json({ success: true, data: doctors });
};

// GET /api/doctors/:id - Get single doctor
const getDoctor = async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  
  if (!doctor || !doctor.isActive) {
    res.status(404);
    throw new Error('Doctor not found');
  }
  
  res.json({ success: true, data: doctor });
};

// POST /api/doctors - Create new doctor
const createDoctor = async (req, res) => {
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
    registrationNumber,
    address
  } = req.body;
  
  // Validation
  if (!name || !email || !phone || !type) {
    res.status(400);
    throw new Error('Name, email, phone, and type are required');
  }
  
  // Check if email already exists
  const existingDoctor = await Doctor.findOne({ email: email.toLowerCase() });
  if (existingDoctor) {
    res.status(400);
    throw new Error('A doctor with this email already exists');
  }
  
  const doctor = await Doctor.create({
    name,
    email: email.toLowerCase(),
    phone,
    role,
    type,
    specialization,
    qualifications,
    experience,
    status: status || 'Active',
    registrationNumber,
    address,
    createdBy: req.user?._id
  });
  
  res.status(201).json({ success: true, data: doctor });
};

// PUT /api/doctors/:id - Update doctor
const updateDoctor = async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  
  if (!doctor || !doctor.isActive) {
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
    registrationNumber,
    address,
    color
  } = req.body;
  
  // Check if email is being changed and if it's already taken
  if (email && email !== doctor.email) {
    const emailExists = await Doctor.findOne({ 
      email: email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    if (emailExists) {
      res.status(400);
      throw new Error('Email is already in use');
    }
  }
  
  // Update fields
  if (name) doctor.name = name;
  if (email) doctor.email = email.toLowerCase();
  if (phone) doctor.phone = phone;
  if (role) doctor.role = role;
  if (type) doctor.type = type;
  if (specialization) doctor.specialization = specialization;
  if (qualifications) doctor.qualifications = qualifications;
  if (experience !== undefined) doctor.experience = experience;
  if (status) doctor.status = status;
  if (registrationNumber) doctor.registrationNumber = registrationNumber;
  if (address) doctor.address = address;
  if (color) doctor.color = color;
  
  await doctor.save();
  
  res.json({ success: true, data: doctor });
};

// DELETE /api/doctors/:id - Soft delete doctor
const deleteDoctor = async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  
  if (!doctor) {
    res.status(404);
    throw new Error('Doctor not found');
  }
  
  // Soft delete
  doctor.isActive = false;
  await doctor.save();
  
  res.json({ success: true, message: 'Doctor deleted successfully' });
};

// GET /api/doctors/stats - Get doctor statistics
const getDoctorStats = async (req, res) => {
  const coreTeamCount = await Doctor.countDocuments({ 
    type: 'Core Team', 
    status: 'Active',
    isActive: true 
  });
  
  const externalDoctorsCount = await Doctor.countDocuments({ 
    type: 'External Doctor',
    status: 'Active',
    isActive: true 
  });
  
  const totalDoctors = coreTeamCount + externalDoctorsCount;
  
  const onBreakCount = await Doctor.countDocuments({
    status: 'On Break',
    isActive: true
  });
  
  res.json({
    success: true,
    data: {
      totalDoctors,
      coreTeam: coreTeamCount,
      externalDoctors: externalDoctorsCount,
      onBreak: onBreakCount
    }
  });
};

module.exports = {
  getDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorStats
};
