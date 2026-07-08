const express = require('express');
const router = express.Router();
const { runAnalysisHandler, getAnalyses, getAnalysis, deleteAnalysis } = require('../controllers/analysisController');
const { protect } = require('../middleware/auth');

router.post('/run',  protect, runAnalysisHandler);
router.get('/',      protect, getAnalyses);
router.get('/:id',   protect, getAnalysis);
router.delete('/:id', protect, deleteAnalysis);

module.exports = router;
