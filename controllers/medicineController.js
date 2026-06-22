const Medicine = require('../models/Medicine');
const Rubric = require('../models/Rubric');

// GET /api/medicines
const getMedicines = async (req, res) => {
  const { search, grade, page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc' } = req.query;
  
  const filter = { isActive: true };
  
  // Search filter
  if (search) {
    filter.$or = [
      { searchText: new RegExp(search.toLowerCase(), 'i') },
      { name: new RegExp(search, 'i') }
    ];
  }
  
  // Grade filter
  if (grade && grade !== 'all') {
    filter.defaultGrade = parseInt(grade);
  }
  
  // Sort options
  const sortOptions = {};
  const sortDirection = sortOrder === 'desc' ? -1 : 1;
  
  switch (sortBy) {
    case 'name':
      sortOptions.name = sortDirection;
      break;
    case 'grade':
      sortOptions.defaultGrade = sortDirection;
      break;
    case 'usage':
      sortOptions.rubricsCount = sortDirection;
      break;
    default:
      sortOptions.name = 1;
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  try {
    const [medicines, total] = await Promise.all([
      Medicine.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortOptions),
      Medicine.countDocuments(filter)
    ]);
    
    res.json({ 
      success: true, 
      data: medicines, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/medicines/:id
const getMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }
    res.json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/medicines
const createMedicine = async (req, res) => {
  try {
    const {
      name,
      alternativeNames,
      defaultGrade,
      description,
      descriptionHindi,
      source,
      commonName,
      keySymptoms,
      modalities,
      commonPotencies,
      createdBy
    } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Medicine name is required' });
    }
    
    // Check if medicine already exists
    const existingMedicine = await Medicine.findOne({ 
      name: new RegExp(`^${name.trim()}$`, 'i') 
    });
    
    if (existingMedicine) {
      return res.status(400).json({ 
        success: false, 
        message: 'Medicine with this name already exists' 
      });
    }
    
    const medicine = await Medicine.create({
      name: name.trim(),
      alternativeNames: alternativeNames || [],
      defaultGrade: defaultGrade || 1,
      description: description || '',
      descriptionHindi: descriptionHindi || '',
      source: source || '',
      commonName: commonName || '',
      keySymptoms: keySymptoms || [],
      modalities: modalities || { aggravation: [], amelioration: [] },
      commonPotencies: commonPotencies || [],
      createdBy: createdBy || 'system'
    });
    
    res.status(201).json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/medicines/:id
const updateMedicine = async (req, res) => {
  try {
    const {
      name,
      alternativeNames,
      defaultGrade,
      description,
      descriptionHindi,
      source,
      commonName,
      keySymptoms,
      modalities,
      commonPotencies,
      isActive
    } = req.body;
    
    if (name && name.trim()) {
      // Check if another medicine with this name exists
      const existingMedicine = await Medicine.findOne({ 
        name: new RegExp(`^${name.trim()}$`, 'i'),
        _id: { $ne: req.params.id }
      });
      
      if (existingMedicine) {
        return res.status(400).json({ 
          success: false, 
          message: 'Another medicine with this name already exists' 
        });
      }
    }
    
    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.trim() }),
        ...(alternativeNames !== undefined && { alternativeNames }),
        ...(defaultGrade !== undefined && { defaultGrade }),
        ...(description !== undefined && { description }),
        ...(descriptionHindi !== undefined && { descriptionHindi }),
        ...(source !== undefined && { source }),
        ...(commonName !== undefined && { commonName }),
        ...(keySymptoms !== undefined && { keySymptoms }),
        ...(modalities !== undefined && { modalities }),
        ...(commonPotencies !== undefined && { commonPotencies }),
        ...(isActive !== undefined && { isActive })
      },
      { new: true, runValidators: true }
    );
    
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }
    
    res.json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/medicines/:id
const deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }
    
    // Soft delete by setting isActive to false
    await Medicine.findByIdAndUpdate(req.params.id, { isActive: false });
    
    res.json({ success: true, message: 'Medicine deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/medicines/statistics
const getMedicineStatistics = async (req, res) => {
  try {
    const [totalMedicines, gradeStats, sourceStats] = await Promise.all([
      Medicine.countDocuments({ isActive: true }),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$defaultGrade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Medicine.aggregate([
        { $match: { isActive: true, source: { $ne: '' } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        total: totalMedicines,
        byGrade: gradeStats,
        bySource: sourceStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/medicines/sync-rubrics
// Sync medicine data from existing rubrics to update usage counts
const syncMedicinesFromRubrics = async (req, res) => {
  try {
    const rubrics = await Rubric.find({}, 'medicines');
    const medicineUsage = {};
    
    // Count medicine usage in rubrics
    rubrics.forEach(r => {
      const meds = r.medicines instanceof Map 
        ? Object.fromEntries(r.medicines) 
        : (r.medicines || {});
      
      Object.keys(meds).forEach(medName => {
        const name = medName.trim();
        if (!name) return;
        medicineUsage[name] = (medicineUsage[name] || 0) + 1;
      });
    });
    
    // Update or create medicine records
    let created = 0;
    let updated = 0;
    
    for (const [medName, count] of Object.entries(medicineUsage)) {
      const existingMedicine = await Medicine.findOne({ name: medName });
      
      if (existingMedicine) {
        await Medicine.findByIdAndUpdate(existingMedicine._id, { rubricsCount: count });
        updated++;
      } else {
        await Medicine.create({
          name: medName,
          description: `Homeopathic remedy found in repertory rubrics.`,
          descriptionHindi: `रेपरटॉरी रुब्रिक्स में पाई गई होम्योपैथिक दवा।`,
          rubricsCount: count,
          createdBy: 'system'
        });
        created++;
      }
    }
    
    res.json({
      success: true,
      message: `Sync completed: ${created} medicines created, ${updated} medicines updated`,
      data: { created, updated }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getMedicineStatistics,
  syncMedicinesFromRubrics
};