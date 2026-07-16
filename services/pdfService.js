const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Extracts specific page ranges (0-indexed) from a source PDF and writes to a new PDF.
 */
const extractPageRanges = async (inputPath, outputPath, ranges) => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Source PDF file not found at: ${inputPath}`);
  }

  const sourceBytes = fs.readFileSync(inputPath);
  const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const totalPages = sourceDoc.getPageCount();
  const pageIndices = [];

  for (const range of ranges) {
    const start = Math.max(0, range.start);
    const end = Math.min(totalPages - 1, range.end);
    for (let i = start; i <= end; i++) {
      pageIndices.push(i);
    }
  }

  if (pageIndices.length === 0) {
    throw new Error('No valid pages to extract');
  }

  // Copy pages
  const copiedPages = await newDoc.copyPages(sourceDoc, pageIndices);
  copiedPages.forEach(page => newDoc.addPage(page));

  const newBytes = await newDoc.save();
  
  // Ensure destination folder exists
  const destDir = path.dirname(outputPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, newBytes);
  console.log(`Successfully extracted ${pageIndices.length} pages to ${outputPath}`);
};

/**
 * Extracts full text content from a PDF file (all pages)
 * Returns the complete text content for AI parsing
 */
const extractFullPdfText = async (inputPath) => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Source PDF file not found at: ${inputPath}`);
  }

  // Lazy load pdf-parse only when needed
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (err) {
    throw new Error('pdf-parse package is not installed. Run: npm install pdf-parse');
  }

  console.log(`📄 Extracting text from PDF: ${path.basename(inputPath)}`);
  
  const pdfBuffer = fs.readFileSync(inputPath);
  const pdfData = await pdfParse(pdfBuffer, { max: 0 }); // Extract all pages
  
  const totalPages = pdfData.numpages;
  const fullText = pdfData.text;
  
  console.log(`✅ Extracted ${fullText.length} characters from ${totalPages} pages`);
  
  return {
    text: fullText,
    totalPages: totalPages,
    info: pdfData.info
  };
};

module.exports = { 
  extractPageRanges,
  extractFullPdfText
};
