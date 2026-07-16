'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const { extractMaterialMedicaFromPdf } = require('../services/materiaMedicaPdfExtractor');
const { generateKentExcel } = require('../services/kentExcelGenerator');

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
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported for full extraction.'));
    }
  }
});

/**
 * @route POST /api/materia-medica-extract/upload
 * @desc Upload a Materia Medica/Repertory PDF, extract all content, generate Excel
 */
router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  const sessionId = uuidv4();
  const sessionDir = path.join(tempUploadDir, sessionId);
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
    }

    console.log(`[MM Extract] Processing: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
    fs.ensureDirSync(sessionDir);

    // Step 1: Extract full PDF content with AI parsing
    console.log('[MM Extract] Step 1: Extracting and parsing PDF...');
    const { data: structuredData, totalPages, totalEntries } = await extractMaterialMedicaFromPdf(req.file.path);
    
    if (!structuredData || structuredData.length === 0) {
      throw new Error('No data could be extracted from the PDF. Please ensure the PDF contains readable text.');
    }
    
    // Step 2: Generate Excel file
    console.log('[MM Extract] Step 2: Generating Excel file...');
    const excelFilePath = await generateKentExcel(structuredData, sessionDir);
    
    // Create download URL
    const relativeUrl = `/uploads/temp_mm_extract/${sessionId}/${path.basename(excelFilePath)}`;

    console.log(`[MM Extract] ✅ Success: ${totalEntries} entries extracted, Excel generated`);

    res.status(200).json({
      success: true,
      message: `Successfully extracted ${totalEntries} entries from ${totalPages} pages`,
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
      message: error.message || 'An error occurred during PDF extraction.'
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
