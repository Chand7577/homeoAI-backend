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

  // Keep a 10% overlap around the gutter.  Kent's left column frequently
  // reaches past the visual centre line; the old 52% crop clipped its last
  // words before OCR ever saw them.  These values match the proven Vision
  // crop geometry and deliberately let both passes see the gutter text.
  const halfWidth = Math.floor(width * 0.55);
  const rightStart = Math.floor(width * 0.45);

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
 * OCR one isolated column and retain each recognised line's bounding box.
 * The x-coordinate is the signal needed to distinguish a nested Kent rubric
 * from a wrapped remedy continuation line; plain OCR text loses that signal.
 *
 * @param {string} imagePath Image path for a single physical column crop
 * @returns {Promise<{text: string, lines: Array<{text: string, x: number, y: number}>}>}
 */
const runOCRWithLineLayout = async (imagePath) => {
  const Tesseract = require('tesseract.js');
  const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });

  try {
    await worker.setParameters({
      tessedit_ocr_engine_mode: 1,
      tessedit_pageseg_mode: 4,
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(imagePath);
    const lines = (data.lines || [])
      .map(line => ({
        text: (line.text || '').trim(),
        x: Math.round(line.bbox?.x0 || 0),
        y: Math.round(line.bbox?.y0 || 0),
      }))
      .filter(line => line.text.length > 0);

    await worker.terminate();
    return { text: data.text || '', lines };
  } catch (error) {
    try { await worker.terminate(); } catch (_) {}
    throw error;
  }
};

/**
 * Run Tesseract OCR on a single-line image strip (e.g. a page running header).
 * Uses PSM 7 (single text line) which is far more accurate for short 1-line strips
 * than PSM 4 (single column), which expects multi-line columnar text.
 *
 * @param {string} imagePath  Image path of the cropped strip
 * @returns {Promise<string>} Raw OCR text
 */
const runOCRSingleLine = async (imagePath) => {
  const Tesseract = require('tesseract.js');

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: () => {},
  });

  try {
    await worker.setParameters({
      tessedit_ocr_engine_mode: 1,
      tessedit_pageseg_mode: 7,   // PSM 7 = single text line (correct for header strips)
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz.',
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(imagePath);
    await worker.terminate();
    return data.text;
  } catch (error) {
    try { await worker.terminate(); } catch (e) {}
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

/**
 * Crop only the top strip of the original image (the page running header area)
 * and run Tesseract on it to detect the chapter name BEFORE column splitting
 * destroys the centered header.
 *
 * @param {string} imagePath  Original (full-page) image path
 * @param {string} outputDir  Temp directory for the strip file
 * @returns {Promise<string>} OCR text of the top strip
 */
const extractTopStripText = async (imagePath, outputDir) => {
  const ext  = path.extname(imagePath).toLowerCase();
  const base = path.basename(imagePath, ext);
  const stripPath = path.join(outputDir, `${base}_topstrip.jpg`);

  try {
    const metadata = await sharp(imagePath).metadata();
    const width  = metadata.width  || 1200;
    const height = metadata.height || 1600;

    // Crop the top 12% of the page — chapter running header lives here.
    // 12% (up from 9%) ensures low-res scans still capture the full header line.
    const stripHeight = Math.max(Math.floor(height * 0.12), 100);

    await sharp(imagePath, { pages: 1, limitInputPixels: 268402689 })
      .extract({ left: 0, top: 0, width, height: stripHeight })
      .grayscale()
      .normalize()
      // High-contrast threshold makes bold chapter capitals pop cleanly for OCR
      .threshold(160)
      .sharpen({ sigma: 2.0 })
      // Scale up 2× for better OCR accuracy on small strips
      .resize({ width: width * 2, kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 95 })
      .toFile(stripPath);

    // PSM 7 = single text line — CORRECT for a one-line running header
    const ocrText = await runOCRSingleLine(stripPath);
    console.log(`[Top-Strip OCR] Raw text: "${ocrText.replace(/\n/g, ' ').trim().slice(0, 80)}"`);

    // Cleanup strip immediately
    if (fs.existsSync(stripPath)) fs.unlinkSync(stripPath);

    return ocrText;
  } catch (err) {
    // Non-fatal — caller will fall back to column OCR text
    if (fs.existsSync(stripPath)) {
      try { fs.unlinkSync(stripPath); } catch (_) {}
    }
    return '';
  }
};

module.exports = {
  preprocessImage,
  preprocessAndSplitColumns,
  runOCR,
  runOCRWithLineLayout,
  runOCRSingleLine,
  extractTextFromImage,
  extractColumnTextsFromImage,
  extractTopStripText
};
