'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const { extractMaterialMedicaFromPdf } = require('../services/materiaMedicaPdfExtractor');
const { generateKentExcel } = require('../services/kentExcelGenerator');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Temporary upload directory
const tempUploadDir = path.join(__dirname, '../uploads/temp_mm_extract');
fs.ensureDirSync(tempUploadDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = uuidv4() + path.extname(file.originalname);
    cb(null, 'mm_extract_' + uniqueSuffix);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are supported for extraction.'));
    }
  }
});

/**
 * @route POST /api/materia-medica-extract/upload
 * @desc Upload a Materia Medica/Repertory PDF or scanned image, extract all content, generate Excel
 */
router.post('/upload', authenticate, requireAdmin, upload.single('pdf'), async (req, res, next) => {
  const sessionId = uuidv4();
  const sessionDir = path.join(tempUploadDir, sessionId);
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png'].includes(fileExt);
    const isPdf = fileExt === '.pdf';

    console.log(`[MM Extract] Processing ${isImage ? 'image' : 'PDF'}: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
    fs.ensureDirSync(sessionDir);

    let structuredData, totalPages, totalEntries;

    if (isImage) {
      // For images: Use OCR extraction (same as Kent OCR single page)
      console.log('[MM Extract] Using OCR for image extraction...');
      // Use Gemini Vision directly on the uploaded image
      const { parseOcrToStructuredJson } = require('../services/kentAiParser');
      structuredData = await parseOcrToStructuredJson(req.file.path);
      totalPages = 1;
      totalEntries = structuredData.length;
      
    } else if (isPdf) {
      // For PDFs: Use text extraction
      console.log('[MM Extract] Using PDF text extraction...');
      const { extractMaterialMedicaFromPdf } = require('../services/materiaMedicaPdfExtractor');
      
      const result = await extractMaterialMedicaFromPdf(req.file.path);
      structuredData = result.data;
      totalPages = result.totalPages;
      totalEntries = result.totalEntries;
    } else {
      throw new Error('Unsupported file format');
    }
    
    if (!structuredData || structuredData.length === 0) {
      throw new Error('No data could be extracted from the file. Please ensure it contains readable text.');
    }
    
    // Step 2.5: Translate rubrics & chapters to Hindi
    console.log(`[MM Extract] Translating ${structuredData.length} entries to Hindi...`);
    const { translateRubricsToHindi } = require('../services/kentAiParser');
    structuredData = await translateRubricsToHindi(structuredData);
    
    // Step 3: Generate Excel file
    console.log('[MM Extract] Generating Excel file...');
    const { generateKentExcel } = require('../services/kentExcelGenerator');
    const excelFilePath = await generateKentExcel(structuredData, sessionDir);
    
    // Create download URL
    const relativeUrl = `/uploads/temp_mm_extract/${sessionId}/${path.basename(excelFilePath)}`;

    console.log(`[MM Extract] ✅ Success: ${totalEntries} entries extracted, Excel generated`);

    res.status(200).json({
      success: true,
      message: `Successfully extracted ${totalEntries} entries from ${totalPages} page${totalPages > 1 ? 's' : ''}`,
      data: {
        excelUrl: relativeUrl,
        totalPages: totalPages,
        totalEntries: totalEntries,
        parsedRows: totalEntries,
        previewData: structuredData.slice(0, 10) // First 10 rows for preview
      }
    });

  } catch (error) {
    console.error('[MM Extract Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred during extraction.'
    });
  } finally {
    // Cleanup uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Schedule session directory cleanup after 2 hours
    setTimeout(() => {
      fs.remove(sessionDir).catch(err => console.error('Failed to cleanup session dir:', err));
    }, 2 * 60 * 60 * 1000);
  }
});

module.exports = router;
