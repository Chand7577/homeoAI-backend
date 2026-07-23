const express = require('express');
const router = express.Router();
const {
  getRepertories, getRepertory, createRepertory,
  uploadExcel, deleteRepertory, upload,
  uploadPDF, uploadPDFFile, updateChapterPages,
  getRepertoryChapters, streamPDF
} = require('../controllers/repertoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

router.get('/',                  getRepertories);
router.get('/:id/chapters',      getRepertoryChapters);
router.get('/:id/view-pdf',      streamPDF);
router.get('/:id',               getRepertory);
router.post('/',                 requireAdmin, createRepertory);

// Upload endpoint with extended timeout for large files
router.post('/:id/upload', (req, res, next) => {
  req.setTimeout(600000); // 10 minutes timeout for large Excel files
  res.setTimeout(600000);
  next();
}, requireAdmin, upload.single('file'), uploadExcel);

router.post('/:id/upload-pdf',   requireAdmin, uploadPDF.single('pdf'), uploadPDFFile);
router.put('/:id/chapter-pages', requireAdmin, updateChapterPages);
router.delete('/:id',            requireAdmin, deleteRepertory);

module.exports = router;
