'use strict';

require('dotenv').config();
const path = require('path');
const { extractTextFromImage } = require('./services/kentOcrService');
const fs = require('fs-extra');

async function testOcr() {
  // Path to the VERTIGO page image from the conversation
  const imagePath = '/Users/amritdeependrachand/.gemini/antigravity/brain/d7ad2769-d9a1-4a7b-9787-d2d3cc7696ba/media__1784086362562.png';
  const tempDir = path.join(__dirname, 'uploads/test_ocr_temp');
  
  await fs.ensureDir(tempDir);

  console.log('🔍 Running OCR on the VERTIGO page image...\n');

  try {
    const { ocrText } = await extractTextFromImage(imagePath, tempDir);
    
    console.log('='.repeat(60));
    console.log('RAW OCR TEXT OUTPUT:');
    console.log('='.repeat(60));
    console.log(ocrText);
    console.log('='.repeat(60));
    console.log(`\n✅ Total characters extracted: ${ocrText.length}`);
  } catch (err) {
    console.error('❌ OCR failed:', err.message);
  } finally {
    await fs.remove(tempDir);
  }
}

testOcr();
