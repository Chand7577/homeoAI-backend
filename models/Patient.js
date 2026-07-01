const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },  // Index for search
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
  contact: { type: String, default: '', index: true },  // Index for search
  address: { type: String, default: '' },
  symptoms: { type: String, default: '' },      // General symptom notes
  analyses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' }],
  prescriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' }],
}, { timestamps: true });

// Compound index for common queries
PatientSchema.index({ createdAt: -1 });
PatientSchema.index({ name: 'text', contact: 'text', symptoms: 'text' }); // Text search index

module.exports = mongoose.model('Patient', PatientSchema);
