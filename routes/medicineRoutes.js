const express = require('express');
const asyncHandler = require('express-async-handler');
const { 
  getMedicines, 
  getMedicine, 
  createMedicine, 
  updateMedicine, 
  deleteMedicine,
  getMedicineStatistics,
  syncMedicinesFromRubrics
} = require('../controllers/medicineController');

const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// GET /api/medicines - Get all medicines with filtering and pagination
router.get('/', asyncHandler(getMedicines));

// GET /api/medicines/statistics - Get medicine statistics
router.get('/statistics', asyncHandler(getMedicineStatistics));

// POST /api/medicines/sync-rubrics - Sync medicines from rubrics
router.post('/sync-rubrics', requireAdmin, asyncHandler(syncMedicinesFromRubrics));

// GET /api/medicines/:id - Get single medicine
router.get('/:id', asyncHandler(getMedicine));

// POST /api/medicines - Create new medicine
router.post('/', requireAdmin, asyncHandler(createMedicine));

// PUT /api/medicines/:id - Update medicine
router.put('/:id', requireAdmin, asyncHandler(updateMedicine));

// DELETE /api/medicines/:id - Delete medicine (soft delete)
router.delete('/:id', requireAdmin, asyncHandler(deleteMedicine));

module.exports = router;
