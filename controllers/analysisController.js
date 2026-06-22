const Analysis = require('../models/Analysis');
const Repertory = require('../models/Repertory');
const Patient = require('../models/Patient');
const { runAnalysis } = require('../services/aiService');

// POST /api/analysis/run
const runAnalysisHandler = async (req, res) => {
  const { repertoryId, symptoms, patientId, patientName } = req.body;

  // Validate
  if (!repertoryId) { res.status(400); throw new Error('repertoryId is required'); }
  const cleanSymptoms = (symptoms || []).map(s => String(s).trim()).filter(Boolean);
  if (cleanSymptoms.length === 0) { res.status(400); throw new Error('At least one symptom is required'); }

  // Get repertory name
  const repertory = await Repertory.findById(repertoryId);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }

  // Run AI analysis
  const { matchedRubrics, medicineDistribution, aiUsed } = await runAnalysis({
    symptoms: cleanSymptoms,
    repertoryId,
    repertoryName: repertory.name,
  });

  // Resolve patient
  let resolvedPatientId = null;
  let resolvedPatientName = patientName || 'Anonymous';
  if (patientId) {
    const patient = await Patient.findById(patientId);
    if (patient) {
      resolvedPatientId = patient._id;
      resolvedPatientName = patient.name;
    }
  }

  // Save analysis to DB
  const analysis = await Analysis.create({
    patientId: resolvedPatientId,
    patientName: resolvedPatientName,
    repertoryId,
    repertoryName: repertory.name,
    symptoms: cleanSymptoms,
    matchedRubrics,
    medicineDistribution,
    aiUsed,
    status: 'complete',
  });

  // Link to patient if present
  if (resolvedPatientId) {
    await Patient.findByIdAndUpdate(resolvedPatientId, {
      $push: { analyses: analysis._id }
    });
  }

  res.status(201).json({
    success: true,
    data: {
      analysisId: analysis._id,
      repertoryName: repertory.name,
      symptoms: cleanSymptoms,
      matchedRubrics,
      medicineDistribution,
      aiUsed,
    }
  });
};

// GET /api/analysis
const getAnalyses = async (req, res) => {
  const { patientId, limit = 20, page = 1 } = req.query;
  const filter = {};
  if (patientId) filter.patientId = patientId;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [analyses, total] = await Promise.all([
    Analysis.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate('patientId', 'name age gender')
      .populate('repertoryId', 'name'),
    Analysis.countDocuments(filter),
  ]);
  res.json({ success: true, data: analyses, total });
};

// GET /api/analysis/:id
const getAnalysis = async (req, res) => {
  const analysis = await Analysis.findById(req.params.id)
    .populate('patientId', 'name age gender contact')
    .populate('repertoryId', 'name');
  if (!analysis) { res.status(404); throw new Error('Analysis not found'); }
  res.json({ success: true, data: analysis });
};

module.exports = { runAnalysisHandler, getAnalyses, getAnalysis };
