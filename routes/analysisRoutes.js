const express = require('express');
const router = express.Router();
const { runAnalysisHandler, getAnalyses, getAnalysis } = require('../controllers/analysisController');

router.post('/run', runAnalysisHandler);
router.get('/',     getAnalyses);
router.get('/:id',  getAnalysis);

module.exports = router;
