const express = require('express');
const router = express.Router();
const { getRubrics, getChapters, getMedicines, createRubric, updateRubric, deleteRubric } = require('../controllers/rubricController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

router.get('/',          getRubrics);
router.get('/chapters',  getChapters);
router.get('/medicines', getMedicines);
router.post('/',         requireAdmin, createRubric);
router.put('/:id',       requireAdmin, updateRubric);
router.delete('/:id',    requireAdmin, deleteRubric);

module.exports = router;
