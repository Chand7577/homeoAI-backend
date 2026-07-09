const express = require('express');
const router = express.Router();
const { runAnalysisHandler, getAnalyses, getAnalysis, deleteAnalysis } = require('../controllers/analysisController');
const { authenticate } = require('../middleware/auth');

router.post('/run',  authenticate, runAnalysisHandler);
router.get('/',      authenticate, getAnalyses);
router.get('/:id',   authenticate, getAnalysis);
router.delete('/:id', authenticate, deleteAnalysis);

module.exports = router;
