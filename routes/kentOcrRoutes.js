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
const { convertPdfPagesToImages, getPdfPageCountViaPdftoppm } = require('../services/kentPdfService');

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

// Multer for single-page image uploads (JPG/PNG)
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext) || allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG image files are supported.'));
    }
  }
});

// Multer for full PDF uploads (up to 200MB)
const uploadPdf = multer({
  storage: storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted on this endpoint.'));
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

    // Use Tesseract OCR + Groq AI (both unlimited/free) instead of Gemini Vision
    const { parseImageWithTesseract } = require('../services/kentTesseractParser');
    let structuredData = await parseImageWithTesseract(req.file.path);
    
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

/**
 * @route POST /api/kent-ocr/upload-pdf
 * @desc Upload a multi-page scanned PDF, convert each page to image,
 *       run the full Tesseract + Groq pipeline, and return one combined Excel.
 */
// Extend timeout to 60 min for PDF processing (1200 pages can take 20-40 min)
const pdfTimeoutMiddleware = (req, res, next) => {
  req.setTimeout(60 * 60 * 1000);
  res.setTimeout(60 * 60 * 1000);
  next();
};

router.post('/upload-pdf', authenticate, requireClinicalUser, pdfTimeoutMiddleware, uploadPdf.single('pdf'), async (req, res) => {
  const sessionId = uuidv4();
  const sessionDir = path.join(tempUploadDir, sessionId);
  const pageImagesDir = path.join(sessionDir, 'pages');

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
    }

    console.log(`[Kent PDF] Processing: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
    await fs.ensureDir(sessionDir);
    await fs.ensureDir(pageImagesDir);

    // Step 1: Get total page count
    const totalPages = await getPdfPageCountViaPdftoppm(req.file.path, sessionDir);
    console.log(`[Kent PDF] Total pages detected: ${totalPages}`);

    if (totalPages === 0) {
      throw new Error('PDF appears to have 0 pages or could not be read.');
    }

    const startPage = Math.max(1, parseInt(req.body.startPage || req.query.startPage, 10) || 1);
    const endPage = Math.min(totalPages, parseInt(req.body.endPage || req.query.endPage, 10) || totalPages);

    console.log(`[Kent PDF] Processing page range: ${startPage} to ${endPage}...`);

    // Step 2: Convert specified page range to PNG images
    const pageImages = await convertPdfPagesToImages(
      req.file.path,
      pageImagesDir,
      startPage,
      endPage,
      200 // 200 DPI — optimal for Vision & OCR quality
    );

    if (pageImages.length === 0) {
      throw new Error(`PDF conversion produced no images for page range ${startPage}–${endPage}.`);
    }

    console.log(`[Kent PDF] Converted ${pageImages.length} pages (${startPage}–${endPage}). Starting extraction pipeline...`);

    // Step 3: Run AI Vision (or Tesseract) pipeline on each page in range
    const useAiVision = req.body.useAiVision !== 'false' && req.query.useAiVision !== 'false';
    const { parseImageToStructuredJson } = require('../services/kentAiParser');
    const { parseImageWithTesseract } = require('../services/kentTesseractParser');

    const allRows = [];
    const seenKeys = new Set();
    let successPages = 0;
    let failedPages = 0;

    for (let i = 0; i < pageImages.length; i++) {
      const imagePath = pageImages[i];
      const pageNum = startPage + i;

      try {
        console.log(`[Kent PDF] Extracting page ${pageNum} (${i + 1}/${pageImages.length}) [mode=${useAiVision ? 'AI Vision' : 'Tesseract'}]...`);
        const rows = useAiVision 
          ? await parseImageToStructuredJson(imagePath)
          : await parseImageWithTesseract(imagePath);

        for (const row of rows) {
          const key = `${row.rubric_en}|||${row.medicine}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            allRows.push(row);
          }
        }
        successPages++;
      } catch (pageErr) {
        console.warn(`[Kent PDF] Page ${pageNum} failed: ${pageErr.message}`);
        failedPages++;
        // Continue processing remaining pages
      } finally {
        // Delete page image immediately after processing to free disk space
        try { await fs.remove(imagePath); } catch (_) {}
      }
    }

    if (allRows.length === 0) {
      throw new Error(`No data extracted from ${pageImages.length} pages. All pages may have failed OCR.`);
    }

    // Step 4: Translate rubrics to Hindi
    console.log(`[Kent PDF] Translating ${allRows.length} unique rubric-medicine rows to Hindi...`);
    let translatedRows = allRows;
    try {
      translatedRows = await translateRubricsToHindi(allRows);
    } catch (transErr) {
      console.warn('[Kent PDF] Hindi translation failed, using English-only output:', transErr.message);
    }

    // Step 5: Generate combined Excel
    console.log(`[Kent PDF] Generating Excel for ${translatedRows.length} rows...`);
    const excelFilePath = await generateKentExcel(translatedRows, sessionDir);
    const relativeUrl = `/uploads/temp_kent/${sessionId}/${path.basename(excelFilePath)}`;

    res.status(200).json({
      success: true,
      message: `PDF processed successfully`,
      data: {
        excelUrl: relativeUrl,
        totalPages,
        successPages,
        failedPages,
        parsedRows: translatedRows.length,
        previewData: translatedRows.slice(0, 5)
      }
    });

  } catch (error) {
    console.error('[Kent PDF Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred during PDF processing.'
    });
  } finally {
    // Cleanup uploaded PDF immediately
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    // Cleanup page images dir (individual page images already deleted above)
    fs.remove(pageImagesDir).catch(() => {});
    // Schedule session dir cleanup after 1 hour (Excel still needs to be downloadable)
    setTimeout(() => {
      fs.remove(sessionDir).catch(err => console.error('Failed to cleanup PDF session dir:', err));
    }, 60 * 60 * 1000);
  }
});

module.exports = router;
