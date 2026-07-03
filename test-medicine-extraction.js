/**
 * Test script to verify AI medicine extraction from PDF
 */

require('dotenv').config();
const path = require('path');
const { extractChaptersFromPdf } = require('./services/aiService');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');
const pdfName = 'Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf';

async function testExtraction() {
  console.log('🧪 Testing Medicine Name Extraction from PDF\n');
  console.log(`PDF Path: ${pdfPath}\n`);
  
  try {
    const mappings = await extractChaptersFromPdf(pdfPath, pdfName);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ EXTRACTION SUCCESSFUL!\n');
    console.log(`Total medicines mapped: ${Object.keys(mappings).length}\n`);
    
    console.log('📋 First 20 mappings:');
    Object.entries(mappings).slice(0, 20).forEach(([name, page], idx) => {
      console.log(`  ${idx + 1}. ${name} → Page ${page}`);
    });
    
    console.log('\n📋 Last 10 mappings:');
    const entries = Object.entries(mappings);
    entries.slice(-10).forEach(([name, page], idx) => {
      console.log(`  ${entries.length - 9 + idx}. ${name} → Page ${page}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💾 Full mappings object:');
    console.log(JSON.stringify(mappings, null, 2));
    
  } catch (error) {
    console.error('\n❌ EXTRACTION FAILED:');
    console.error(error.message);
    console.error('\nStack trace:', error.stack);
  }
}

testExtraction();
