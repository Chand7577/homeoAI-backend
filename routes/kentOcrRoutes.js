'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const { extractTextFromImage } = require('../services/kentOcrService');
const { parseOcrToStructuredJson, translateRubricsToHindi } = require('../services/kentAiParser');
const { generateKentExcel } = require('../services/kentExcelGenerator');
const { authenticate, requireClinicalUser } = require('../middleware/auth');

// Set up local storage for temporary file uploads
const tempUploadDir = path.join(__dirname, '../uploads/temp_kent');
fs.ensureDirSync(tempUploadDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = uuidv4() + path.extname(file.originalname);
    cb(null, 'upload_' + uniqueSuffix);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext) || allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG image files are supported. Scanned PDFs must be converted to images first.'));
    }
  }
});

/**
 * @route POST /api/kent-ocr/upload
 * @desc Uploads a page, runs OCR, parses to JSON, generates Excel, and returns the download URL
 */
router.post('/upload', authenticate, requireClinicalUser, upload.single('page'), async (req, res, next) => {
  const sessionId = uuidv4();
  const sessionDir = path.join(tempUploadDir, sessionId);
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log(`Processing upload: ${req.file.originalname}`);
    fs.ensureDirSync(sessionDir);

    // Pass the raw image directly to Gemini Vision!
    let structuredData = await parseOcrToStructuredJson(req.file.path);
    
    if (!structuredData || structuredData.length === 0) {
      throw new Error('OCR failed or found too little text.');
    }
    
    // 2. Translate rubrics to Hindi
    console.log(`[Kent OCR] Translating ${structuredData.length} rubrics to Hindi...`);
    structuredData = await translateRubricsToHindi(structuredData);
    
    // 3. Generate Excel
    console.log(`[Kent OCR] Generating Excel file...`);
    const excelFilePath = await generateKentExcel(structuredData, sessionDir);
    
    // Create a relative URL for download
    const relativeUrl = `/uploads/temp_kent/${sessionId}/${path.basename(excelFilePath)}`;

    res.status(200).json({
      success: true,
      message: 'File processed successfully',
      data: {
        excelUrl: relativeUrl,
        parsedRows: structuredData.length,
        previewData: structuredData.slice(0, 5) // Return first 5 rows for preview
      }
    });

  } catch (error) {
    console.error('[Kent OCR Error]', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'An error occurred during processing.' 
    });
  } finally {
    // Cleanup the original uploaded file (keep session dir for Excel download temporarily)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Schedule deletion of the session directory (Excel file) after 1 hour
    setTimeout(() => {
      fs.remove(sessionDir).catch(err => console.error('Failed to cleanup session dir:', err));
    }, 60 * 60 * 1000);
  }
});

module.exports = router;
