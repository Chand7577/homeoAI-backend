const mongoose = require('mongoose');

const MatchedRubricSchema = new mongoose.Schema({
  symptom: String,              // Original patient symptom text
  rubricId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rubric' },
  chapter: { en: String, hi: String },
  rubric: { en: String, hi: String },
  subrubric: { en: String, hi: String },
  modalities: {
    aggravation: [String],
    amelioration: [String],
  },
  medicines: { type: mongoose.Schema.Types.Mixed, default: {} }, // plain object; keys may contain dots (e.g. 'Sulph.')
  confidence: { type: Number, default: 0 },   // 0-100 from AI
  reasoning: { type: String, default: '' },   // AI explanation
}, { _id: false });

const MedicineDistributionSchema = new mongoose.Schema({
  name: String,
  totalScore: Number,
  rubricsCount: Number,
  grades: [Number],
  rank: Number,
}, { _id: false });

const AnalysisSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientName: { type: String, default: 'Anonymous' },
  patientAge: { type: String, default: '' },
  patientGender: { type: String, default: '' },
  patientWeight: { type: String, default: '' },
  patientContact: { type: String, default: '' },
  repertoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repertory', required: true, index: true },
  repertoryName: { type: String, default: '' },
  symptoms: [{ type: String }],               // Up to 5 patient symptoms
  matchedRubrics: [MatchedRubricSchema],
  medicineDistribution: [MedicineDistributionSchema],
  aiUsed: { type: Boolean, default: false },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  status: { type: String, enum: ['pending', 'complete', 'prescribed'], default: 'complete' },
}, { timestamps: true });

// Compound indexes for common queries
AnalysisSchema.index({ doctorId: 1, createdAt: -1 });
AnalysisSchema.index({ patientId: 1, createdAt: -1 });
AnalysisSchema.index({ repertoryId: 1, createdAt: -1 });
AnalysisSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Analysis', AnalysisSchema);
