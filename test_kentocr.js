'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const { initAI } = require('./config/aiConfig');
const { parseOcrToStructuredJson } = require('./services/kentAiParser');
const { generateKentExcel } = require('./services/kentExcelGenerator');

async function runTest() {
  console.log('🏁 Starting Kent OCR Pipeline Verification Test...');
  
  // 1. Initialize AI configuration
  console.log('⚙️ Initializing AI config...');
  const aiInitialized = initAI();
  if (!aiInitialized) {
    console.error('❌ AI Initialization failed. Please make sure GROQ_API_KEY is configured in server/.env');
    process.exit(1);
  }

  // 2. Prepare mock OCR data (bilingual English/Hindi from Kent's Repertory)
  const mockOcrText = `
  MIND - ANXIETY - morning
   सुबह की चिंता
   Bell, lyc, ACON
  MIND - ANXIETY - evening
   शाम की चिंता
   Acon, *bell*, *calc*
  `;

  console.log('\n📝 Mock OCR Input:\n-----------------');
  console.log(mockOcrText.trim());
  console.log('-----------------\n');

  try {
    // 3. Test AI structured JSON parsing
    console.log('🤖 Sending raw OCR text to AI (Groq Llama 3.3)...');
    const structuredData = await parseOcrToStructuredJson(mockOcrText);
    
    console.log('✅ Structured Data parsed successfully by AI:');
    console.log(JSON.stringify(structuredData, null, 2));

    // Simple validations
    if (!Array.isArray(structuredData) || structuredData.length === 0) {
      throw new Error('AI returned empty structured data.');
    }

    // 4. Test Excel generation
    console.log('\n📊 Generating Excel sheet from parsed data...');
    const tempTestDir = path.join(__dirname, 'uploads/test_temp');
    await fs.ensureDir(tempTestDir);
    
    const excelFilePath = await generateKentExcel(structuredData, tempTestDir);
    
    console.log(`✅ Excel sheet successfully created at: ${excelFilePath}`);
    
    // Check if file actually exists and is non-empty
    const stats = await fs.stat(excelFilePath);
    if (stats.size > 0) {
      console.log(`📁 File Size: ${stats.size} bytes`);
      console.log('\n🎉 ALL TESTS PASSED! The Kent OCR pipeline is working flawlessly. no syntax errors or configuration issues.');
    } else {
      throw new Error('Generated Excel file is empty.');
    }

    // Cleanup generated file
    await fs.remove(tempTestDir);
    console.log('🧹 Cleaned up temporary test directory.');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

runTest();
