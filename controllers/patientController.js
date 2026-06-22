const Patient = require('../models/Patient');

// GET /api/patients
const getPatients = async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { contact: new RegExp(search, 'i') },
      { symptoms: new RegExp(search, 'i') },
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Patient.countDocuments(filter),
  ]);
  res.json({ success: true, data: patients, total });
};

// GET /api/patients/:id
const getPatient = async (req, res) => {
  const patient = await Patient.findById(req.params.id)
    .populate({ path: 'analyses', select: 'repertoryName symptoms medicineDistribution createdAt', options: { sort: { createdAt: -1 }, limit: 10 } })
    .populate({ path: 'prescriptions', select: 'remedy potency prescribedAt', options: { sort: { createdAt: -1 }, limit: 10 } });
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

module.exports = { getPatients, getPatient, createPatient, updatePatient, deletePatient };
