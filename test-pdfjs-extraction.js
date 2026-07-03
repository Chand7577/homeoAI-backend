/**
 * Test extraction using pdf.js-extract
 */

const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');

async function extractWithPdfJs() {
  console.log('📚 Testing pdf.js-extract\n');
  
  const pdfExtract = new PDFExtract();
  const options = {
    firstPage: 1,
    lastPage: 50 // Test first 50 pages
  };
  
  console.log('📄 Extracting pages 1-50...');
  const data = await pdfExtract.extract(pdfPath, options);
  
  console.log(`✅ Extracted ${data.pages.length} pages`);
  
  // Extract medicine names from first 50 pages
  const medicines = [];
  const medicinePattern = /^[A-Z][A-Z\s\-\.']{4,49}$/;
  const repertorySections = new Set([
    'MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 'THROAT',
    'STOMACH', 'ABDOMEN', 'RECTUM', 'CHEST', 'BACK', 'EXTREMITIES', 
    'SKIN', 'SLEEP', 'FEVER', 'GENERALITIES', 'MODALITIES',
    'MATERIA MEDICA', 'REPERTORY', 'INDEX', 'CONTENTS', 'PREFACE'
  ]);
  
  data.pages.forEach((page, pageIdx) => {
    // Get text from page
    const pageText = page.content.map(item => item.str).join(' ');
    const lines = pageText.split(/\n| {3,}/).map(l => l.trim()).filter(Boolean);
    
    lines.forEach(line => {
      if (medicinePattern.test(line) && !repertorySections.has(line)) {
        medicines.push({
          name: line,
          page: page.pageInfo.num,
          pageText: lines.slice(0, 3).join(' ').substring(0, 100)
        });
      }
    });
  });
  
  console.log(`\n🧪 Found ${medicines.length} potential medicines in first 50 pages:\n`);
  
  // Remove duplicates by name
  const uniqueMedicines = Array.from(
    new Map(medicines.map(m => [m.name, m])).values()
  );
  
  console.log(`📋 Unique medicines: ${uniqueMedicines.length}\n`);
  
  uniqueMedicines.slice(0, 20).forEach((med, idx) => {
    console.log(`${String(idx + 1).padStart(3)}. ${med.name.padEnd(40)} → Page ${med.page}`);
  });
  
  return uniqueMedicines;
}

extractWithPdfJs().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
});
