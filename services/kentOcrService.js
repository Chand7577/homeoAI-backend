'use strict';

const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');

/**
 * Preprocess an uploaded image page with Sharp and split it physically into 
 * left and right column images to prevent cross-column text bleeding.
 *
 * @param {string} inputPath   Absolute path to the original upload
 * @param {string} outputDir   Directory where preprocessed PNGs are written
 * @returns {Promise<Object>}  { leftPath, rightPath }
 */
const preprocessAndSplitColumns = async (inputPath, outputDir) => {
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  const leftPath = path.join(outputDir, `${baseName}_left.png`);
  const rightPath = path.join(outputDir, `${baseName}_right.png`);

  const metadata = await sharp(inputPath).metadata();
  const rawWidth = metadata.width || 1200;
  const rawHeight = metadata.height || 1600;

  // Upscale to at least 2400px width for crisp font rendering
  const targetWidth = Math.max(rawWidth * 2, 2400);

  // Process full image buffer (grayscale + high contrast + sharpening)
  const processedBuffer = await sharp(inputPath, { pages: 1 })
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 4 })
    .toBuffer();

  const processedMeta = await sharp(processedBuffer).metadata();
  const width = processedMeta.width;
  const height = processedMeta.height;

  // Split down vertical center with 4% overlap at center gutter to avoid cutting edge words
  const halfWidth = Math.floor(width * 0.52);
  const rightStart = Math.floor(width * 0.48);

  // Left column crop
  await sharp(processedBuffer)
    .extract({ left: 0, top: 0, width: halfWidth, height: height })
    .toFile(leftPath);

  // Right column crop
  await sharp(processedBuffer)
    .extract({ left: rightStart, top: 0, width: width - rightStart, height: height })
    .toFile(rightPath);

  return { leftPath, rightPath };
};

/**
 * Preprocess full image without splitting (for fallback or single column pages).
 */
const preprocessImage = async (inputPath, outputDir) => {
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(outputDir, `${baseName}_proc.png`);

  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 800;
  const targetWidth = Math.max(width * 2, 2400);

  await sharp(inputPath, { pages: 1 })
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 4 })
    .toFile(outputPath);

  return outputPath;
};

/**
 * Run Tesseract OCR on an image file.
 * Uses OEM 1 (LSTM) and PSM 4 (single column text) for isolated column processing.
 *
 * @param {string} imagePath  PNG path
 * @returns {Promise<string>} Raw OCR text
 */
const runOCR = async (imagePath) => {
  const Tesseract = require('tesseract.js');

  console.log(`🔍 Running Tesseract OCR on: ${path.basename(imagePath)}`);

  const { data } = await Tesseract.recognize(
    imagePath,
    'eng+hin',
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r   [${path.basename(imagePath)}] OCR: ${(m.progress * 100).toFixed(0)}%`);
        }
      },
      tessedit_ocr_engine_mode: 1,
      tessedit_pageseg_mode: 4,       // Single column mode
      preserve_interword_spaces: '1',
    }
  );

  process.stdout.write('\n');
  console.log(`✅ [${path.basename(imagePath)}] Complete (${data.text.length} chars).`);
  return data.text;
};

/**
 * Run multi-column isolated OCR pipeline.
 * Splits page physically into left & right columns and runs Tesseract on each.
 *
 * @param {string} uploadedFilePath  Original upload path
 * @param {string} tempDir           Temp directory for intermediate files
 * @returns {Promise<Object>}        { leftText, rightText, leftPath, rightPath }
 */
const extractColumnTextsFromImage = async (uploadedFilePath, tempDir) => {
  const { leftPath, rightPath } = await preprocessAndSplitColumns(uploadedFilePath, tempDir);
  const leftText = await runOCR(leftPath);
  const rightText = await runOCR(rightPath);
  return { leftText, rightText, leftPath, rightPath };
};

/**
 * Full single-pass pipeline (legacy backward compatibility).
 */
const extractTextFromImage = async (uploadedFilePath, tempDir) => {
  const processedPath = await preprocessImage(uploadedFilePath, tempDir);
  const ocrText = await runOCR(processedPath);
  return { ocrText, processedPath };
};

module.exports = {
  preprocessImage,
  preprocessAndSplitColumns,
  runOCR,
  extractTextFromImage,
  extractColumnTextsFromImage
};


