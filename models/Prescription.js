const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  patientName: { type: String, required: true },
  patientAge: { type: Number },
  patientGender: { type: String },
  patientContact: { type: String, default: '' },
  analysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis', default: null },
  repertoryName: { type: String, default: '' },
  symptoms: [String],
  // Prescribed remedy details
  remedy: { type: String, required: true },
  potency: { type: String, default: '' },        // e.g. "30C", "200C", "1M"
  dosage: { type: String, default: '' },         // e.g. "3 pills thrice daily"
  duration: { type: String, default: '' },       // e.g. "7 days"
  instructions: { type: String, default: '' },   // Special instructions
  // Doctor details
  doctorName: { type: String, default: 'Dr. Jp Nautiyal' },
  doctorClinic: { type: String, default: 'Homeopathic Clinic' },
  doctorContact: { type: String, default: '' },
  prescribedAt: { type: Date, default: Date.now },
  // Follow-up
  followUpDate: { type: Date, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
