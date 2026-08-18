const express = require('express');
const router = express.Router();
const {
  getRepertories, getRepertory, createRepertory,
  uploadExcel, deleteRepertory, upload,
  uploadPDF, uploadPDFFile, updateChapterPages,
  getRepertoryChapters, streamPDF, setExternalPdfUrl,
  scanMedicinePages
} = require('../controllers/repertoryController');
const { authenticate, requireAdmin, requireClinicalUser } = require('../middleware/auth');

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

router.post('/:id/upload-pdf',   requireClinicalUser, uploadPDF.single('pdf'), uploadPDFFile); // Allow clinical users
router.post('/:id/scan-medicine-pages', authenticate, scanMedicinePages); // AI Scan PDF for page numbers
router.put('/:id/external-pdf-url', requireClinicalUser, setExternalPdfUrl); // Set external PDF URL (Google Drive, Dropbox)
router.put('/:id/chapter-pages', authenticate, updateChapterPages); // Allow all authenticated users to update chapter pages
router.delete('/:id',            requireAdmin, deleteRepertory);

module.exports = router;
