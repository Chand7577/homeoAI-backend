const mongoose = require('mongoose');

// ── Sub-schema for one medicine line ─────────────────────────────────────────
const MedicineLineSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['dilution', 'mother_tincture', 'biochemic'],
    default: 'dilution',
  },
  name:      { type: String, required: true },    // e.g. "Nux Vomica"
  potency:   { type: String, default: '' },        // e.g. "30", "200", "1M", "6X", "Q"
  form:      { type: String, default: 'pills' },   // "pills" | "drops" | "tablets"
  quantity:  { type: Number, default: 3 },         // 1–20
  frequency: { type: String, default: 'BD' },      // OD | BD | TDS | QID | SOS
  meal:      { type: String, default: 'BM' },      // BM | AM | DM
  water:     { type: String, default: '' },        // 1/4 | 1/2 | full  (mother tincture only)
}, { _id: false });

// ── Main Prescription schema ──────────────────────────────────────────────────
const PrescriptionSchema = new mongoose.Schema({
  // Patient
  patientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  patientName:    { type: String, required: true },
  patientAge:     { type: Number },
  patientGender:  { type: String },
  patientContact: { type: String, default: '' },

  // Linked records
  analysisId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis', default: null },
  repertoryName: { type: String, default: '' },
  symptoms:      [String],

  // ── NEW: structured medicine lines ──────────────────────────────────────
  medicines: [MedicineLineSchema],

  // ── Legacy flat fields (kept for backward compatibility) ────────────────
  remedy:       { type: String, default: '' },
  potency:      { type: String, default: '' },
  dosage:       { type: String, default: '' },
  duration:     { type: String, default: '' },
  durationValue: { type: Number, default: null },          // numeric e.g. 7
  durationUnit:  { type: String, default: 'days' },        // days | weeks | months

  instructions: { type: String, default: '' },

  // Doctor (who created this prescription)
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  doctorName:    { type: String, default: 'Dr. Jp Nautiyal' },
  doctorClinic:  { type: String, default: 'Nautiyal Homeopathic Clinic' },
  doctorContact: { type: String, default: '' },

  prescribedAt: { type: Date, default: Date.now },
  followUpDate: { type: Date, default: null },
  notes:        { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
