const Prescription = require('../models/Prescription');
const Patient      = require('../models/Patient');
const Analysis     = require('../models/Analysis');
const User         = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/prescriptions
// ─────────────────────────────────────────────────────────────────────────────
const createPrescription = async (req, res) => {
  const {
    // Patient
    patientId, patientName, patientAge, patientGender, patientContact,
    // Analysis link
    analysisId, repertoryName, symptoms,
    // NEW structured medicines array
    medicines,
    // Duration
    durationValue, durationUnit,
    // Legacy / fallback flat fields
    remedy, potency, dosage, duration,
    // Common
    instructions, followUpDate, notes,
    doctorName, doctorClinic, doctorContact,
  } = req.body;

  // Get logged-in doctor's ID from authentication middleware
  const doctorId = req.user?.userId || null;

  // Validate: need a patient name and at least one medicine
  const hasName    = patientName && patientName.trim();
  const hasMeds    = (medicines && medicines.length > 0) || (remedy && remedy.trim());
  if (!hasName || !hasMeds) {
    res.status(400);
    throw new Error('patientName and at least one medicine are required');
  }

  // Build a flat "remedy" string from medicines[] for backward compat display
  const remedySummary = medicines && medicines.length
    ? medicines.map(m => {
        const pot = m.type === 'mother_tincture' ? 'Q' : (m.potency || '');
        return `${m.name}${pot ? ' ' + pot : ''}`;
      }).join(', ')
    : (remedy || '');

  // Build a flat "dosage" string for backward compat display
  const dosageSummary = medicines && medicines.length
    ? medicines.map(m => `${m.quantity} ${m.form} ${m.frequency} ${m.meal}`).join('; ')
    : (dosage || '');

  // Duration string
  const durationStr = durationValue && durationUnit
    ? `${durationValue} ${durationUnit}`
    : (duration || '');

  const prescription = await Prescription.create({
    patientId:      patientId || null,
    patientName:    patientName.trim(),
    patientAge,
    patientGender,
    patientContact: patientContact || '',

    analysisId:    analysisId || null,
    repertoryName: repertoryName || '',
    symptoms:      symptoms || [],

    medicines: medicines || [],

    remedy:        remedySummary,
    potency:       potency || '',
    dosage:        dosageSummary,
    duration:      durationStr,
    durationValue: durationValue || null,
    durationUnit:  durationUnit  || 'days',

    instructions: instructions || '',
    doctorId:     doctorId,
    doctorName:   doctorName   || 'Dr. Jp Nautiyal',
    doctorClinic: doctorClinic || 'Nautiyal Homeopathic Clinic',
    doctorContact: doctorContact || '',

    followUpDate: followUpDate ? new Date(followUpDate) : null,
    notes:        notes || '',
  });

  // Link to patient record
  if (patientId) {
    await Patient.findByIdAndUpdate(patientId, {
      $push: { prescriptions: prescription._id },
    });
  }

  // Link to analysis record
  if (analysisId) {
    await Analysis.findByIdAndUpdate(analysisId, {
      prescriptionId: prescription._id,
      status: 'prescribed',
    });
  }

  res.status(201).json({ success: true, data: prescription });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prescriptions
// Query params: patientId, page, limit
// Returns only prescriptions created by the logged-in doctor (except for Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getPrescriptions = async (req, res) => {
  const { patientId, page = 1, limit = 20 } = req.query;
  const currentUserId = req.user?.userId;
  
  // Get current user's role
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  // Build filter
  const filter = {};
  
  // Filter by patientId if provided
  if (patientId) {
    filter.patientId = patientId;
  }
  
  // Filter by doctorId - only show prescriptions created by this doctor
  // Exception: Admin can see all prescriptions
  if (currentUserRole !== 'Admin') {
    filter.doctorId = currentUserId;
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [prescriptions, total] = await Promise.all([
    Prescription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Prescription.countDocuments(filter),
  ]);

  res.json({ success: true, data: prescriptions, total });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prescriptions/:id
// Returns prescription only if it belongs to the logged-in doctor (except Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getPrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }
  
  // Check ownership - only doctor who created it or Admin can view
  const currentUserId = req.user?.userId;
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  if (currentUserRole !== 'Admin' && prescription.doctorId?.toString() !== currentUserId) {
    res.status(403);
    throw new Error('Access denied: You can only view your own prescriptions');
  }
  
  res.json({ success: true, data: prescription });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/prescriptions/:id  (update)
// Only doctor who created it or Admin can update
// ─────────────────────────────────────────────────────────────────────────────
const updatePrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }

  // Check ownership
  const currentUserId = req.user?.userId;
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  if (currentUserRole !== 'Admin' && prescription.doctorId?.toString() !== currentUserId) {
    res.status(403);
    throw new Error('Access denied: You can only update your own prescriptions');
  }

  const { medicines, durationValue, durationUnit, remedy, dosage, duration, ...rest } = req.body;

  // Recompute flat strings if medicines array is provided
  if (medicines) {
    rest.medicines = medicines;
    rest.remedy = medicines.map(m => {
      const pot = m.type === 'mother_tincture' ? 'Q' : (m.potency || '');
      return `${m.name}${pot ? ' ' + pot : ''}`;
    }).join(', ');
    rest.dosage = medicines.map(m => `${m.quantity} ${m.form} ${m.frequency} ${m.meal}`).join('; ');
  }

  if (durationValue && durationUnit) {
    rest.durationValue = durationValue;
    rest.durationUnit  = durationUnit;
    rest.duration      = `${durationValue} ${durationUnit}`;
  }

  if (rest.followUpDate) rest.followUpDate = new Date(rest.followUpDate);

  Object.assign(prescription, rest);
  await prescription.save();

  res.json({ success: true, data: prescription });
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/prescriptions/:id
// Only doctor who created it or Admin can delete
// ─────────────────────────────────────────────────────────────────────────────
const deletePrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }

  // Check ownership
  const currentUserId = req.user?.userId;
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  if (currentUserRole !== 'Admin' && prescription.doctorId?.toString() !== currentUserId) {
    res.status(403);
    throw new Error('Access denied: You can only delete your own prescriptions');
  }

  // Remove from patient's list
  if (prescription.patientId) {
    await Patient.findByIdAndUpdate(prescription.patientId, {
      $pull: { prescriptions: prescription._id },
    });
  }

  await prescription.deleteOne();
  res.json({ success: true, message: 'Prescription deleted' });
};

module.exports = {
  createPrescription,
  getPrescriptions,
  getPrescription,
  updatePrescription,
  deletePrescription,
};
