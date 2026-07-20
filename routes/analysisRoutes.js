const express = require('express');
const router = express.Router();
const { runAnalysisHandler, getAnalyses, getAnalysis, deleteAnalysis } = require('../controllers/analysisController');
const { authenticate, requireClinicalUser } = require('../middleware/auth');

router.use(authenticate, requireClinicalUser);
router.post('/run',  runAnalysisHandler);
router.get('/',      getAnalyses);
router.get('/:id',   getAnalysis);
router.delete('/:id', deleteAnalysis);

module.exports = router;
