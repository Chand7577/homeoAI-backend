const express = require('express');
const router = express.Router();
const { getRubrics, getChapters, getMedicines, createRubric, updateRubric, deleteRubric } = require('../controllers/rubricController');

router.get('/',          getRubrics);
router.get('/chapters',  getChapters);
router.get('/medicines', getMedicines);
router.post('/',         createRubric);
router.put('/:id',       updateRubric);
router.delete('/:id',    deleteRubric);

module.exports = router;
