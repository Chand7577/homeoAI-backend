'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Convert a single PDF page to a PNG image using pdftoppm.
 * Converting one page at a time avoids SIGTERM on memory-constrained hosts (e.g. Render free tier).
 *
 * @param {string} pdfPath   - Absolute path to the PDF
 * @param {string} outputDir - Directory to save PNG files
 * @param {number} pageNum   - Page number to convert (1-indexed)
 * @param {number} dpi       - Resolution (default 150 — good balance of quality vs memory)
 * @returns {Promise<string|null>} - Absolute path to generated PNG, or null on failure
 */
const convertSinglePageToImage = async (pdfPath, outputDir, pageNum, dpi = 150) => {
  await fs.ensureDir(outputDir);

  // Use per-page prefix so files don't collide: page-0001-000001.png → rename to page-0001.png
  const prefix = path.join(outputDir, `page-${String(pageNum).padStart(4, '0')}`);

  const args = [
    '-r', String(dpi),
    '-png',
    '-f', String(pageNum),
    '-l', String(pageNum),
    '-singlefile',          // Output one file without the page-number suffix
    pdfPath,
    prefix
  ];

  try {
    await execFileAsync('pdftoppm', args, {
      timeout: 60 * 1000,       // 1 min per page is more than enough
      maxBuffer: 30 * 1024 * 1024
    });
  } catch (err) {
    const detail = (err.stderr || err.stdout || '').trim();
    const reason = detail || err.message;
    console.error(`[PDF→Image] Page ${pageNum} failed: ${reason}`);
    return null; // Skip bad pages rather than crashing the whole job
  }

  // pdftoppm -singlefile writes <prefix>.png
  const expectedFile = `${prefix}.png`;
  if (await fs.pathExists(expectedFile)) {
    return expectedFile;
  }

  // Some builds of pdftoppm ignore -singlefile — fall back to scanning for the file
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const files = await fs.readdir(dir);
  const match = files.find(f => f.startsWith(base) && f.endsWith('.png'));
  if (match) return path.join(dir, match);

  console.warn(`[PDF→Image] Page ${pageNum}: no output file found.`);
  return null;
};

/**
 * Convert a range of PDF pages to PNG images, one page at a time.
 * This avoids SIGTERM kills caused by converting all pages in a single pdftoppm call.
 *
 * @param {string} pdfPath    - Absolute path to the PDF
 * @param {string} outputDir  - Directory to save PNG files
 * @param {number} firstPage  - First page to convert (1-indexed)
 * @param {number} lastPage   - Last page to convert (1-indexed, inclusive)
 * @param {number} dpi        - Resolution (default 150 dpi)
 * @returns {Promise<string[]>} - Sorted array of absolute paths to successfully generated PNG files
 */
const convertPdfPagesToImages = async (pdfPath, outputDir, firstPage = 1, lastPage = null, dpi = 150) => {
  await fs.ensureDir(outputDir);

  const endPage = lastPage || firstPage; // Caller should always pass both
  console.log(`[PDF→Images] Converting pages ${firstPage}–${endPage} one-by-one at ${dpi} DPI...`);

  const pageImages = [];
  let failedCount = 0;

  for (let page = firstPage; page <= endPage; page++) {
    const imgPath = await convertSinglePageToImage(pdfPath, outputDir, page, dpi);
    if (imgPath) {
      pageImages.push(imgPath);
    } else {
      failedCount++;
    }
  }

  console.log(`[PDF→Images] Done. ${pageImages.length} pages converted, ${failedCount} failed/skipped.`);

  if (pageImages.length === 0) {
    throw new Error(`All ${endPage - firstPage + 1} pages failed to convert. The PDF may be corrupt, encrypted, or unsupported.`);
  }

  return pageImages.sort(); // Ensure consistent order
};

/**
 * Get PDF page count.
 * Tries pdfinfo first (fast), falls back to pdftoppm probe (converts at 10 DPI page-by-page).
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

  // ── Fallback: convert at very low DPI to count pages ──
  const probeDir = path.join(tempDir, `probe_${Date.now()}`);
  await fs.ensureDir(probeDir);
  const prefix = path.join(probeDir, 'pg');

  try {
    await execFileAsync('pdftoppm', ['-r', '10', '-png', pdfPath, prefix], {
      timeout: 60000,
      maxBuffer: 30 * 1024 * 1024
    });
  } catch (err) {
    const detail = (err.stderr || '').trim();
    console.warn(`[PDF] pdftoppm probe error (may be partial): ${detail || err.message}`);
    // Fall through — count whatever files were created
  }

  const files = (await fs.readdir(probeDir)).filter(f => f.endsWith('.png'));
  await fs.remove(probeDir);

  if (files.length === 0) {
    throw new Error('pdftoppm probe produced no output — is the PDF valid and not password-protected?');
  }

  console.log(`[PDF] pdftoppm probe counted ${files.length} pages.`);
  return files.length;
};

module.exports = {
  convertSinglePageToImage,
  convertPdfPagesToImages,
  getPdfPageCountViaPdftoppm,
};
