const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
  contact: { type: String, default: '' },
  address: { type: String, default: '' },
  symptoms: { type: String, default: '' },      // General symptom notes
  analyses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' }],
  prescriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' }],
}, { timestamps: true });

module.exports = mongoose.model('Patient', PatientSchema);
