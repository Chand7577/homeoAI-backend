const express = require('express');
const router = express.Router();
const { runAnalysisHandler, getAnalyses, getAnalysis, deleteAnalysis } = require('../controllers/analysisController');
const { authenticate } = require('../middleware/auth');

// All analysis routes require authentication
// Controllers will handle role-based access (patients see their own, doctors see all)
router.use(authenticate);

router.post('/run',  runAnalysisHandler);  // Anyone can run analysis
router.get('/',      getAnalyses);          // Controller filters by user role
router.get('/:id',   getAnalysis);          // Controller checks ownership
router.delete('/:id', deleteAnalysis);      // Controller checks ownership

module.exports = router;
