const express = require('express');
const router = express.Router();
const {
  getRepertories, getRepertory, createRepertory,
  uploadExcel, deleteRepertory, upload,
  uploadPDF, uploadPDFFile, updateChapterPages,
  getRepertoryChapters
} = require('../controllers/repertoryController');

router.get('/',                  getRepertories);
router.get('/:id/chapters',      getRepertoryChapters);
router.get('/:id',               getRepertory);
router.post('/',                 createRepertory);

// Upload endpoint with extended timeout for large files
router.post('/:id/upload', (req, res, next) => {
  req.setTimeout(600000); // 10 minutes timeout for large Excel files
  res.setTimeout(600000);
  next();
}, upload.single('file'), uploadExcel);

router.post('/:id/upload-pdf',   uploadPDF.single('pdf'), uploadPDFFile);
router.put('/:id/chapter-pages', updateChapterPages);
router.delete('/:id',            deleteRepertory);

module.exports = router;
