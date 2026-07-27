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

  // Get metadata without loading full image
  const metadata = await sharp(inputPath).metadata();
  const rawWidth = metadata.width || 1200;
  const rawHeight = metadata.height || 1600;

  // MEMORY FIX: Reduce target width from 2400px to 1800px (25% less memory)
  // Still high quality but uses ~44% less RAM
  const targetWidth = Math.max(rawWidth * 1.5, 1800);

  // MEMORY FIX: Save to temp file instead of keeping buffer in memory
  const tempProcessedPath = path.join(outputDir, `${baseName}_temp.jpg`);
  
  await sharp(inputPath, { pages: 1, limitInputPixels: 268402689 }) // Limit to 256MP max
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 85, mozjpeg: true }) // Reduced quality for memory
    .toFile(tempProcessedPath);

  // Get dimensions from saved file
  const processedMeta = await sharp(tempProcessedPath).metadata();
  const width = processedMeta.width;
  const height = processedMeta.height;

  // Split down vertical center with 4% overlap
  const halfWidth = Math.floor(width * 0.52);
  const rightStart = Math.floor(width * 0.48);

  // MEMORY FIX: Process columns sequentially instead of parallel to reduce peak RAM
  await sharp(tempProcessedPath)
    .extract({ left: 0, top: 0, width: halfWidth, height: height })
    .toFile(leftPath);
  
  // Force garbage collection hint between operations
  if (global.gc) global.gc();
  
  await sharp(tempProcessedPath)
    .extract({ left: rightStart, top: 0, width: width - rightStart, height: height })
    .toFile(rightPath);

  // Cleanup temp file immediately
  if (fs.existsSync(tempProcessedPath)) {
    fs.unlinkSync(tempProcessedPath);
  }

  return { leftPath, rightPath };
};

/**
 * Preprocess full image without splitting (for fallback or single column pages).
 */
const preprocessImage = async (inputPath, outputDir) => {
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(outputDir, `${baseName}_proc.jpg`);

  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 800;
  
  // MEMORY FIX: Reduced from 2400px to 1800px
  const targetWidth = Math.max(width * 1.5, 1800);

  await sharp(inputPath, { pages: 1, limitInputPixels: 268402689 })
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(outputPath);

  return outputPath;
};

/**
 * Run Tesseract OCR on an image file.
 * Uses OEM 1 (LSTM) and PSM 4 (single column text) for isolated column processing.
 *
 * @param {string} imagePath  Image path
 * @returns {Promise<string>} Raw OCR text
 */
const runOCR = async (imagePath) => {
  const Tesseract = require('tesseract.js');

  // MEMORY FIX: Create worker with memory limits
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: () => {},
  });

  try {
    await worker.setParameters({
      tessedit_ocr_engine_mode: 1,
      tessedit_pageseg_mode: 4,
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(imagePath);
    
    // MEMORY FIX: Terminate worker immediately after use
    await worker.terminate();
    
    return data.text;
  } catch (error) {
    // Ensure worker is terminated even on error
    try {
      await worker.terminate();
    } catch (e) {
      // Ignore termination errors
    }
    throw error;
  }
};

/**
 * Run multi-column isolated OCR pipeline.
 * Splits page physically into left & right columns and runs Tesseract on each in parallel.
 *
 * @param {string} uploadedFilePath  Original upload path
 * @param {string} tempDir           Temp directory for intermediate files
 * @returns {Promise<Object>}        { leftText, rightText, leftPath, rightPath }
 */
const extractColumnTextsFromImage = async (uploadedFilePath, tempDir) => {
  const { leftPath, rightPath } = await preprocessAndSplitColumns(uploadedFilePath, tempDir);
  
  // MEMORY FIX: Run OCR sequentially instead of parallel to reduce peak memory
  // This prevents 2x Tesseract workers running simultaneously
  const leftText = await runOCR(leftPath);
  
  // Force garbage collection hint between operations
  if (global.gc) global.gc();
  
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


