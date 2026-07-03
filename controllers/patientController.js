const Patient = require('../models/Patient');

// GET /api/patients - Optimized with text search
const getPatients = async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const filter = {};
  
  if (search) {
    // Use text index for better performance
    filter.$text = { $search: search };
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .select('-analyses -prescriptions') // Exclude large arrays for list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(), // Use lean() for faster queries (returns plain JS objects)
    Patient.countDocuments(filter),
  ]);
  
  res.json({ success: true, data: patients, total, page: parseInt(page), limit: parseInt(limit) });
};

// GET /api/patients/:id - Optimized with selective population
const getPatient = async (req, res) => {
  const patient = await Patient.findById(req.params.id)
    .populate({ 
      path: 'analyses', 
      select: 'repertoryName symptoms medicineDistribution createdAt', 
      options: { sort: { createdAt: -1 }, limit: 10 },
      populate: { path: 'repertoryId', select: 'name' } // Nested populate optimization
    })
    .populate({ 
      path: 'prescriptions', 
      select: 'remedy potency prescribedAt medicines duration', 
      options: { sort: { createdAt: -1 }, limit: 10 } 
    })
    .lean(); // Faster query
    
  if (!patient) { res.status(404); throw new Error('Patient not found'); }
  res.json({ success: true, data: patient });
};

// POST /api/patients
const createPatient = async (req, res) => {
  const { name, age, gender, contact, address, symptoms } = req.body;
  if (!name) { res.status(400); throw new Error('Patient name is required'); }
  const patient = await Patient.create({ name, age, gender, contact, address, symptoms });
  res.status(201).json({ success: true, data: patient });
};

// PUT /api/patients/:id
const updatePatient = async (req, res) => {
  const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!patient) { res.status(404); throw new Error('Patient not found'); }
  res.json({ success: true, data: patient });
};

// DELETE /api/patients/:id
const deletePatient = async (req, res) => {
  await Patient.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Patient deleted' });
};

// GET /api/patients/stats - Get patient statistics
const getPatientStats = async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    totalPatients,
    patientsThisMonth,
    patientsLastMonth,
    recentPatients
  ] = await Promise.all([
    Patient.countDocuments(),
    Patient.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Patient.countDocuments({ 
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } 
    }),
    Patient.find()
      .select('name age gender contact symptoms createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  // Calculate growth percentage
  const growthPercentage = patientsLastMonth > 0 
    ? Math.round(((patientsThisMonth - patientsLastMonth) / patientsLastMonth) * 100)
    : 100;

  // Format recent patients for frontend
  const formattedRecentPatients = recentPatients.map(patient => ({
    id: patient._id,
    name: patient.name,
    age: patient.age || 'N/A',
    gender: patient.gender || 'Male',
    genderHindi: patient.gender === 'Male' ? 'पुरुष' : patient.gender === 'Female' ? 'महिला' : 'अन्य',
    contact: patient.contact || '',
    symptoms: patient.symptoms || 'No symptoms recorded',
    symptomsHindi: patient.symptoms || 'कोई लक्षण दर्ज नहीं',
    lastVisit: new Date(patient.createdAt).toISOString().split('T')[0]
  }));

  res.json({
    success: true,
    data: {
      totalPatients,
      patientsThisMonth,
      growthPercentage,
      recentPatients: formattedRecentPatients
    }
  });
};

module.exports = { 
  getPatients, 
  getPatient, 
  createPatient, 
  updatePatient, 
  deletePatient,
  getPatientStats
};
