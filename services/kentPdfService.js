'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Get total page count of a PDF using pdftoppm -l trick (pdfinfo preferred).
 * Falls back to running pdftoppm on a dummy range and counting output files.
 *
 * @param {string} pdfPath - Absolute path to the PDF file
 * @returns {Promise<number>} - Total number of pages
 */
const getPdfPageCount = async (pdfPath) => {
  try {
    // Try pdfinfo first (fastest)
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
    const match = stdout.match(/Pages:\s+(\d+)/);
    if (match) return parseInt(match[1], 10);
  } catch (_) {
    // pdfinfo not available — fall back to pdftoppm count
  }

  // Fallback: convert first page only and check if it works, then use pdftoppm -l 99999
  try {
    const { stdout } = await execFileAsync('pdftoppm', ['-l', '1', '-r', '1', '-png', pdfPath, '/dev/null'], {
      timeout: 10000
    });
  } catch (_) {}

  // Last resort: run pdfinfo via gs
  throw new Error('Cannot determine PDF page count. Make sure pdfinfo (poppler) is installed.');
};

/**
 * Convert a range of PDF pages to PNG images using pdftoppm.
 * pdftoppm outputs files named: <prefix>-000001.png, <prefix>-000002.png, etc.
 *
 * @param {string} pdfPath    - Absolute path to the PDF
 * @param {string} outputDir  - Directory to save PNG files
 * @param {number} firstPage  - First page to convert (1-indexed)
 * @param {number} lastPage   - Last page to convert (1-indexed, inclusive)
 * @param {number} dpi        - Resolution (default 200 dpi — good for Tesseract, low memory)
 * @returns {Promise<string[]>} - Sorted array of absolute paths to generated PNG files
 */
const convertPdfPagesToImages = async (pdfPath, outputDir, firstPage = 1, lastPage = null, dpi = 200) => {
  await fs.ensureDir(outputDir);

  const prefix = path.join(outputDir, 'page');

  const args = [
    '-r', String(dpi),       // DPI / resolution
    '-png',                   // Output format PNG (lossless, better for OCR)
    '-f', String(firstPage),  // First page
  ];

  if (lastPage) {
    args.push('-l', String(lastPage));
  }

  args.push(pdfPath, prefix);

  console.log(`[PDF→Images] Running pdftoppm pages ${firstPage}–${lastPage || 'end'} at ${dpi} DPI...`);

  try {
    await execFileAsync('pdftoppm', args, {
      timeout: 5 * 60 * 1000, // 5 min max for large batches
      maxBuffer: 50 * 1024 * 1024
    });
  } catch (err) {
    // Surface pdftoppm's own stderr so the real reason is visible in logs
    const detail = (err.stderr || err.stdout || '').trim();
    throw new Error(`pdftoppm failed (pages ${firstPage}–${lastPage || 'end'}): ${detail || err.message}`);
  }

  // Collect and sort all generated PNG files
  const files = await fs.readdir(outputDir);
  const pageImages = files
    .filter(f => f.startsWith('page-') && f.endsWith('.png'))
    .sort() // Alphabetical sort preserves page order (zero-padded numbers)
    .map(f => path.join(outputDir, f));

  console.log(`[PDF→Images] Generated ${pageImages.length} page images.`);
  return pageImages;
};

/**
 * Get PDF page count using pdftoppm by probing (no pdfinfo needed).
 * Converts page 1 to get the output file naming, then runs full count via pdftoppm -l 9999
 * and checks how many files were actually created.
 *
 * @param {string} pdfPath - Path to PDF
 * @param {string} tempDir - Temp dir for probe images
 * @returns {Promise<number>}
 */
const getPdfPageCountViaPdftoppm = async (pdfPath, tempDir) => {
  // ── Try pdfinfo first (fastest, most reliable) ──
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath], { timeout: 10000 });
    const match = stdout.match(/Pages:\s+(\d+)/);
    if (match) {
      const count = parseInt(match[1], 10);
      console.log(`[PDF] pdfinfo reports ${count} pages.`);
      return count;
    }
  } catch (_) {
    console.warn('[PDF] pdfinfo not available, falling back to pdftoppm probe...');
  }

  // ── Fallback: convert at 1 DPI (tiny, fast) to count output files ──
  const probeDir = path.join(tempDir, `probe_${Date.now()}`);
  await fs.ensureDir(probeDir);
  const prefix = path.join(probeDir, 'pg');

  try {
    await execFileAsync('pdftoppm', ['-r', '10', '-png', pdfPath, prefix], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024
    });
  } catch (err) {
    const detail = (err.stderr || '').trim();
    console.warn(`[PDF] pdftoppm probe error (may be partial): ${detail || err.message}`);
    // Fall through — check whatever files were created
  }

  const files = (await fs.readdir(probeDir)).filter(f => f.endsWith('.png'));
  await fs.remove(probeDir);

  if (files.length === 0) throw new Error('pdftoppm probe produced no output — is the PDF valid and not password-protected?');
  console.log(`[PDF] pdftoppm probe counted ${files.length} pages.`);
  return files.length;
};

module.exports = {
  convertPdfPagesToImages,
  getPdfPageCountViaPdftoppm,
};
