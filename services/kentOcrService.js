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

  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 800;

  // Upscale to at least 2400px wide so small medicine abbreviations are crisp
  const targetWidth = Math.max(width * 2, 2400);

  await sharp(inputPath, { pages: 1 })
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 }) // 2x upscale
    .grayscale()
    .normalize()                        // auto-levels for better contrast
    .sharpen({ sigma: 1.0 })            // lighter sharpen after upscale
    .threshold(145)                     // binarise → crisp black-on-white
    .png({ compressionLevel: 4 })
    .toFile(outputPath);

  return outputPath;
};

/**
 * Run Tesseract OCR on a preprocessed image.
 * Language: eng+hin for bilingual (English + Devanagari Hindi) recognition.
 * Uses LSTM engine (OEM 1) and single-column PSM (PSM 4) for dense medical text.
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
      tessedit_ocr_engine_mode: 1,       // OEM 1: LSTM neural net (most accurate)
      tessedit_pageseg_mode: 4,          // PSM 4: single column of variable-size text
      preserve_interword_spaces: '1',    // preserve spacing (helps with indented sub-rubrics)
    }
  );

  process.stdout.write('\n');
  console.log(`✅ OCR complete. Extracted ${data.text.length} characters.`);
  return data.text;
};


/**
 * Full pipeline: preprocess image → Tesseract OCR.
 * Only supports JPG/PNG. PDFs must be converted to images before uploading.
 *
 * @param {string} uploadedFilePath  Original upload path
 * @param {string} tempDir           Temp directory for intermediate files
 * @returns {Promise<Object>}        { ocrText, processedPath }
 */
const extractTextFromImage = async (uploadedFilePath, tempDir) => {
  const processedPath = await preprocessImage(uploadedFilePath, tempDir);
  const ocrText       = await runOCR(processedPath);
  return { ocrText, processedPath };
};

module.exports = { preprocessImage, runOCR, extractTextFromImage };

