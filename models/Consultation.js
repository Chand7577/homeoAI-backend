const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema({
  // Patient Information
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // Link to User if patient is logged in
  patientName: { type: String, required: true, trim: true },
  patientAge: { type: String, required: true },
  patientGender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
  patientWeight: { type: Number, default: null },

  // Symptom Details
  symptoms: [{ type: String }], // Parsed symptoms array
  mainConcern: { type: String, required: true },
  severity: { type: String, enum: ['Mild', 'Moderate', 'Severe'], required: true },
  duration: { type: String, required: true },
  symptomsDescription: { type: String, required: true },
  
  // File Attachment
  attachmentUrl: { type: String, default: '' },
  attachmentName: { type: String, default: '' },
  attachmentType: { type: String, default: '' },
  
  // Assigned Doctor
  assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedDoctorName: { type: String, required: true },
  
  // Status
  status: {
    type: String,
    enum: ['Pending', 'In Analysis', 'Analyzed', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  
  // Language preference
  language: { type: String, enum: ['en', 'hi'], default: 'en' },
  
  // Timestamps
  submittedAt: { type: Date, default: Date.now },
  analyzedAt: { type: Date },
  completedAt: { type: Date },
  
  // Analysis reference (if this consultation was analyzed)
  analysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' },
  
  // Notes from doctor
  doctorNotes: { type: String, default: '' }
}, { timestamps: true });

// Indexes
ConsultationSchema.index({ assignedDoctorId: 1, status: 1 });
ConsultationSchema.index({ patientId: 1, submittedAt: -1 }); // For patient's own consultations
ConsultationSchema.index({ status: 1, submittedAt: -1 });
ConsultationSchema.index({ patientName: 'text', symptomsDescription: 'text' });

module.exports = mongoose.model('Consultation', ConsultationSchema);
