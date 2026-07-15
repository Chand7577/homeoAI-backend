'use strict';

const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');

/**
 * Preprocess an uploaded image/PDF page with Sharp to maximise OCR accuracy:
 * - Convert to greyscale
 * - Sharpen edges
 * - Threshold to crisp black-on-white text
 * - Return the output file path
 *
 * @param {string} inputPath   Absolute path to the original upload
 * @param {string} outputDir   Directory where the preprocessed PNG is written
 * @returns {Promise<string>}  Absolute path to the preprocessed PNG
 */
const preprocessImage = async (inputPath, outputDir) => {
  const ext        = path.extname(inputPath).toLowerCase();
  const baseName   = path.basename(inputPath, ext);
  const outputPath = path.join(outputDir, `${baseName}_proc.png`);

  await sharp(inputPath, { pages: 1 }) // only first page if multi-page TIFF/PDF
    .grayscale()
    .normalize()                        // auto-levels for better contrast
    .sharpen({ sigma: 1.5 })
    .threshold(140)                     // binarise → crisp black-on-white
    .png({ compressionLevel: 6 })
    .toFile(outputPath);

  return outputPath;
};

/**
 * Run Tesseract OCR on a preprocessed image.
 * Language: eng+hin for bilingual (English + Devanagari Hindi) recognition.
 *
 * @param {string} imagePath  Preprocessed PNG path
 * @returns {Promise<string>} Raw OCR text
 */
const runOCR = async (imagePath) => {
  // Lazy-load Tesseract to avoid slow cold-start if not used
  const Tesseract = require('tesseract.js');

  console.log(`🔍 Running OCR on: ${path.basename(imagePath)}`);

  const { data } = await Tesseract.recognize(
    imagePath,
    'eng+hin',          // English + Hindi (Devanagari)
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r   OCR progress: ${(m.progress * 100).toFixed(0)}%`);
        }
      },
    }
  );

  process.stdout.write('\n');
  console.log(`✅ OCR complete. Extracted ${data.text.length} characters.`);
  return data.text;
};

/**
 * Full pipeline: preprocess → OCR (or direct text extraction for PDFs).
 *
 * @param {string} uploadedFilePath  Original upload path
 * @param {string} tempDir           Temp directory for intermediate files
 * @returns {Promise<Object>}        { ocrText, processedPath }
 */
const extractTextFromImage = async (uploadedFilePath, tempDir) => {
  const ext = path.extname(uploadedFilePath).toLowerCase();

  if (ext === '.pdf') {
    console.log(`[Kent OCR] Input is a PDF. Attempting direct text extraction...`);
    try {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(uploadedFilePath);
      const pdfData = await pdfParse(pdfBuffer);

      const ocrText = pdfData.text || '';

      if (ocrText.trim().length > 30) {
        console.log(`[Kent OCR] Successfully extracted ${ocrText.length} characters directly from PDF.`);
        return { ocrText, processedPath: uploadedFilePath };
      } else {
        console.warn(`[Kent OCR] Direct PDF text extraction returned too little text.`);
        throw new Error('This PDF appears to be a scanned image (contains no selectable text). Please convert it to a JPG or PNG image first, then upload.');
      }
    } catch (err) {
      console.error(`[Kent OCR] PDF extraction error:`, err);
      if (err.message && (err.message.includes('scanned image') || err.message.includes('selectable text'))) {
        throw err;
      }
      throw new Error(`Failed to extract text from PDF (${err.message || 'unknown error'}). If it is a scanned PDF, please convert it to a JPG/PNG and try again.`);
    }
  }

  // Fallback to image preprocessing & Tesseract OCR for JPG/PNG
  const processedPath = await preprocessImage(uploadedFilePath, tempDir);
  const ocrText       = await runOCR(processedPath);
  return { ocrText, processedPath };
};

module.exports = { preprocessImage, runOCR, extractTextFromImage };
