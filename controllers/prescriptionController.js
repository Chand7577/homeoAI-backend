const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Analysis = require('../models/Analysis');

// POST /api/prescriptions
const createPrescription = async (req, res) => {
  const {
    patientId, patientName, patientAge, patientGender, patientContact,
    analysisId, repertoryName, symptoms,
    remedy, potency, dosage, duration, instructions,
    doctorName, doctorClinic, doctorContact,
    followUpDate, notes
  } = req.body;

  if (!patientName || !remedy) {
    res.status(400); throw new Error('patientName and remedy are required');
  }

  const prescription = await Prescription.create({
    patientId: patientId || null,
    patientName, patientAge, patientGender, patientContact,
    analysisId: analysisId || null,
    repertoryName, symptoms,
    remedy, potency, dosage, duration, instructions,
    doctorName: doctorName || 'Dr. Jp Nautiyal',
    doctorClinic: doctorClinic || 'Nautiyal Homeopathic Clinic',
    doctorContact,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    notes,
  });

  // Link to patient
  if (patientId) {
    await Patient.findByIdAndUpdate(patientId, { $push: { prescriptions: prescription._id } });
  }
  // Link to analysis
  if (analysisId) {
    await Analysis.findByIdAndUpdate(analysisId, { prescriptionId: prescription._id, status: 'prescribed' });
  }

  res.status(201).json({ success: true, data: prescription });
};

// GET /api/prescriptions
const getPrescriptions = async (req, res) => {
  const { patientId, page = 1, limit = 20 } = req.query;
  const filter = patientId ? { patientId } : {};
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [prescriptions, total] = await Promise.all([
    Prescription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Prescription.countDocuments(filter),
  ]);
  res.json({ success: true, data: prescriptions, total });
};

// GET /api/prescriptions/:id
const getPrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) { res.status(404); throw new Error('Prescription not found'); }
  res.json({ success: true, data: prescription });
};

module.exports = { createPrescription, getPrescriptions, getPrescription };
