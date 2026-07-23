const Analysis = require('../models/Analysis');
const Repertory = require('../models/Repertory');
const Patient = require('../models/Patient');
const { runAnalysis } = require('../services/aiService');

// POST /api/analysis/run
const runAnalysisHandler = async (req, res) => {
  const { repertoryId, symptoms, patientId, patientName, patientAge, patientGender, patientWeight, patientContact } = req.body;
  const doctorId = req.user._id; // From auth middleware

  // Validate
  if (!repertoryId) { res.status(400); throw new Error('repertoryId is required'); }
  // The UI provides five slots; enforce the same bound at the API boundary so
  // a malformed client cannot create an oversized DB/AI workload.
  const rawSymptoms = Array.isArray(symptoms) ? symptoms : [symptoms];
  const cleanSymptoms = rawSymptoms
    .map(s => String(s).trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 9);
  if (cleanSymptoms.length === 0) { res.status(400); throw new Error('At least one symptom is required'); }

  // Get repertory name
  const repertory = await Repertory.findById(repertoryId).select('name').lean();
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }

  // The patient read does not depend on matching, so overlap it with the
  // substantially slower candidate search / model request.
  const analysisPromise = runAnalysis({
    symptoms: cleanSymptoms,
    repertoryId,
    repertoryName: repertory.name,
  });
  const patientPromise = patientId
    ? Patient.findById(patientId).select('name').lean()
    : Promise.resolve(null);
  const [{ matchedRubrics, medicineDistribution, aiUsed, stats }, patient] = await Promise.all([
    analysisPromise,
    patientPromise,
  ]);

  // Resolve patient
  let resolvedPatientId = null;
  let resolvedPatientName = patientName || 'Patient';
  if (patient) {
    resolvedPatientId = patient._id;
    resolvedPatientName = patient.name;
  }

  console.info('⏱️ [ANALYSIS] phase timings (ms):', stats.timingsMs);

  // Normalise matchedRubrics: ensure medicines is a plain object (Mixed type allows dotted keys like 'Sulph.')
  const normalisedRubrics = matchedRubrics.map(r => ({
    ...r,
    medicines: r.medicines instanceof Map
      ? Object.fromEntries(r.medicines)
      : (r.medicines || {}),
  }));

  // Save analysis to DB
  const analysis = await Analysis.create({
    doctorId,
    patientId: resolvedPatientId,
    patientName: resolvedPatientName,
    patientAge: patientAge || '',
    patientGender: patientGender || '',
    patientWeight: patientWeight || '',
    patientContact: patientContact || '',
    repertoryId,
    repertoryName: repertory.name,
    symptoms: cleanSymptoms,
    matchedRubrics: normalisedRubrics,
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
      stats,
    }
  });
};

// GET /api/analysis - Optimized with lean and selective population
const getAnalyses = async (req, res) => {
  const { patientId, patientName, limit = 50, page = 1, all } = req.query;
  const user = req.user;
  
  const filter = {};
  // Each doctor sees ONLY their own analysis history
  if (!all || user.role !== 'Admin') {
    filter.doctorId = user._id;
  }
  if (patientId) filter.patientId = patientId;
  if (patientName) filter.patientName = new RegExp(patientName, 'i'); // Case-insensitive search
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [analyses, total] = await Promise.all([
    Analysis.find(filter)
      .select('-matchedRubrics') // Exclude large arrays for list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('patientId', 'name age gender')
      .populate('repertoryId', 'name')
      .lean(), // Faster queries
    Analysis.countDocuments(filter),
  ]);
  
  res.json({ 
    success: true, 
    data: analyses, 
    total,
    page: parseInt(page),
    limit: parseInt(limit)
  });
};

// GET /api/analysis/:id - Optimized
const getAnalysis = async (req, res) => {
  const user = req.user;
  const query = { _id: req.params.id };
  if (user.role !== 'Admin') {
    query.doctorId = user._id;
  }
  
  const analysis = await Analysis.findOne(query)
    .populate('patientId', 'name age gender contact')
    .populate('repertoryId', 'name')
    .lean(); // Faster query
    
  if (!analysis) { res.status(404); throw new Error('Analysis not found'); }
  res.json({ success: true, data: analysis });
};

// DELETE /api/analysis/:id
const deleteAnalysis = async (req, res) => {
  const doctorId = req.user._id;
  
  const analysis = await Analysis.findOne({ _id: req.params.id, doctorId });
  if (!analysis) { res.status(404); throw new Error('Analysis not found'); }
  
  // Remove from patient's analyses array if linked
  if (analysis.patientId) {
    await Patient.findByIdAndUpdate(analysis.patientId, {
      $pull: { analyses: analysis._id }
    });
  }
  
  await Analysis.findByIdAndDelete(req.params.id);
  
  res.json({ success: true, message: 'Analysis deleted successfully' });
};

module.exports = { runAnalysisHandler, getAnalyses, getAnalysis, deleteAnalysis };
