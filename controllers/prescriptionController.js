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
    patientId, patientName, patientAge, patientGender, patientWeight, patientContact,
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
  const doctorId = req.user?.userId || req.user?._id;

  // Validate: need a patient name and at least one medicine
  const hasName    = patientName && patientName.trim();
  const hasMeds    = (medicines && medicines.length > 0) || (remedy && remedy.trim());
  if (!hasName || !hasMeds) {
    res.status(400);
    throw new Error('patientName and at least one medicine are required');
  }

  // 🔍 AUTO-LOOKUP: Try to find registered patient by phone number
  let resolvedPatientId = patientId || null;
  if (!resolvedPatientId && patientContact) {
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanContact = patientContact.replace(/[\s\-()]/g, '');
    
    // Search User model for registered patient with this phone
    const registeredPatient = await User.findOne({ 
      phone: { $regex: cleanContact, $options: 'i' },
      role: 'Patient',
      status: 'Approved'
    }).select('_id');
    
    if (registeredPatient) {
      resolvedPatientId = registeredPatient._id;
      console.log(`✅ Auto-linked prescription to registered patient: ${resolvedPatientId}`);
    }
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

  // Duration string - prefer the full duration string from frontend
  const durationStr = duration && duration.trim()
    ? duration  // Use the full "7 days, 2 weeks, 1 month" string
    : (durationValue && durationUnit ? `${durationValue} ${durationUnit}` : '—');

  const prescription = await Prescription.create({
    patientId:      resolvedPatientId,
    patientName:    patientName.trim(),
    patientAge,
    patientGender,
    patientWeight:  patientWeight || '',
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
  if (resolvedPatientId) {
    await Patient.findByIdAndUpdate(resolvedPatientId, {
      $push: { prescriptions: prescription._id },
    }).catch(() => {
      // Patient record might not exist in Patient model, that's okay
      console.log('Patient record not found in Patient model, skipping link');
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
// Query params: patientId, page, limit, search
// Returns only prescriptions created by the logged-in doctor/admin
const escapeRegExp = (str) => {
  return str ? String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
};

// Patients can see prescriptions written FOR them
// Smart search: filters by patient name, medicine/remedy name, symptoms
// ─────────────────────────────────────────────────────────────────────────────
const getPrescriptions = async (req, res) => {
  const { patientId, page = 1, limit = 20, search } = req.query;
  const currentUserId = (req.user?.userId || req.user?._id)?.toString();
  
  // Get current user's role
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  // Build filter
  const filter = {};
  
  // Filter by patientId if provided
  if (patientId) {
    filter.patientId = patientId;
  }
  
  // Role-based filtering:
  // - Admin, Core Team, External Doctor: See ONLY prescriptions they created (doctorId = their ID)
  // - Patient: See ONLY prescriptions written FOR them (by patientId OR matching phone/name)
  if (currentUserRole === 'Patient') {
    const patientUser = await User.findById(currentUserId).select('phone name email');
    const patientConditions = [{ patientId: currentUserId }];
    if (patientUser?.phone) {
      const cleanPhone = escapeRegExp(patientUser.phone.replace(/[\s\-()]/g, ''));
      if (cleanPhone) patientConditions.push({ patientContact: new RegExp(cleanPhone, 'i') });
    }
    if (patientUser?.name) {
      const escapedName = escapeRegExp(patientUser.name.trim());
      patientConditions.push({ patientName: new RegExp('^' + escapedName + '$', 'i') });
    }
    filter.$or = patientConditions;
  } else {
    // Admin and Doctors see ONLY prescriptions they created
    filter.doctorId = currentUserId;
  }
  
  // Smart search: search in patient name, remedy, medicines, symptoms
  if (search && search.trim()) {
    const escapedSearch = escapeRegExp(search.trim());
    const searchRegex = new RegExp(escapedSearch, 'i');
    const searchFilter = [
      { patientName: searchRegex },
      { remedy: searchRegex },
      { 'medicines.name': searchRegex },
      { symptoms: searchRegex },
      { notes: searchRegex },
      { instructions: searchRegex }
    ];

    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
      delete filter.$or;
    } else {
      filter.$or = searchFilter;
    }
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
// Returns prescription only if user has permission:
// - Doctors/Admin: Can view ONLY their own prescriptions
// - Patients: Can view prescriptions written FOR them
// ─────────────────────────────────────────────────────────────────────────────
const getPrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }
  
  // Check access permission
  const currentUserId = req.user?.userId;
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  // Role-based access:
  // - Admin/Doctor: Can view ONLY prescriptions they created
  // - Patient: Can view ONLY prescriptions written for them
  if (currentUserRole === 'Patient') {
    if (prescription.patientId?.toString() !== currentUserId) {
      res.status(403);
      throw new Error('Access denied: You can only view your own prescriptions');
    }
  } else {
    // Admin, Core Team, External Doctor
    if (prescription.doctorId?.toString() !== currentUserId) {
      res.status(403);
      throw new Error('Access denied: You can only view prescriptions you created');
    }
  }
  
  res.json({ success: true, data: prescription });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/prescriptions/:id  (update)
// Only the doctor who created it can update (Admin has no special privilege)
// ─────────────────────────────────────────────────────────────────────────────
const updatePrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }

  // Check ownership - ONLY the doctor who created it can update
  const currentUserId = req.user?.userId;
  
  if (prescription.doctorId?.toString() !== currentUserId) {
    res.status(403);
    throw new Error('Access denied: You can only update prescriptions you created');
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
// Only the doctor who created it can delete (Admin has no special privilege)
// Patients cannot delete prescriptions
// ─────────────────────────────────────────────────────────────────────────────
const deletePrescription = async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    res.status(404);
    throw new Error('Prescription not found');
  }

  // Check ownership/permission
  const currentUserId = req.user?.userId;
  const currentUser = await User.findById(currentUserId).select('role');
  const currentUserRole = currentUser?.role;
  
  if (currentUserRole === 'Patient') {
    const isTheirPrescription = prescription.patientId?.toString() === currentUserId;
    if (!isTheirPrescription) {
      res.status(403);
      throw new Error('Access denied: You can only delete your own prescriptions');
    }
  } else {
    // Doctors and Admin can only delete prescriptions they created
    if (prescription.doctorId?.toString() !== currentUserId) {
      res.status(403);
      throw new Error('Access denied: You can only delete prescriptions you created');
    }
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
