'use strict';

const { extractTextFromImage } = require('./kentOcrService');
const Groq = require('groq-sdk');
const fs = require('fs-extra');
const path = require('path');

/**
 * Parse OCR text from Tesseract using Groq AI for structured extraction.
 * This combines Tesseract OCR (free, unlimited) with Groq AI (free 14,400/day)
 * to provide unlimited Kent Repertory page processing.
 * 
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<Array>} - Structured medicine-rubric rows
 */
const parseTesseractOcrWithGroq = async (imagePath) => {
  console.log(`[Tesseract Parser] Starting OCR + AI parsing: ${path.basename(imagePath)}`);
  
  // Create temp directory for preprocessing
  const tempDir = path.dirname(imagePath);
  
  // Step 1: Extract text using Tesseract OCR (unlimited, free)
  console.log('[Tesseract Parser] Step 1: Running Tesseract OCR...');
  const { ocrText, processedPath } = await extractTextFromImage(imagePath, tempDir);
  
  if (!ocrText || ocrText.trim().length < 50) {
    throw new Error('Tesseract OCR returned insufficient text. Image quality may be poor.');
  }
  
  console.log(`[Tesseract Parser] OCR extracted ${ocrText.length} characters`);
  
  // Step 2: Parse OCR text using Groq AI (14,400 requests/day)
  console.log('[Tesseract Parser] Step 2: Parsing OCR text with Groq AI...');
  
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not found in environment');
  }
  
  const groq = new Groq({ apiKey: groqApiKey });
  
  const prompt = `You are a medical data extraction expert parsing OCR text from Kent's Repertory.

TASK: Parse the following OCR text into structured JSON format.

OCR TEXT:
"""
${ocrText}
"""

PARSING RULES:
1. Extract chapter name from the top of the page (usually ALL CAPS like "NOSE", "ABDOMEN", etc.)
2. Identify rubrics (symptoms) and their hierarchy based on indentation
3. Extract medicine abbreviations after each rubric (comma-separated, usually with a period at end)
4. Determine medicine grading:
   - Grade 3: ALL CAPS or BOLD medicines (most important)
   - Grade 2: Italic medicines
   - Grade 1: Normal text medicines (default)
5. Build full rubric paths: "CHAPTER - MAIN RUBRIC, qualifier - sub-rubric - sub-sub-rubric"

EXAMPLES OF RUBRIC HIERARCHY:
- Flush left, ALL CAPS = Main rubric: "DISCHARGE"
- Small indent = Sub-rubric: "thick"
- Medium indent = Sub-sub-rubric: "morning"
- Full path example: "NOSE - DISCHARGE - thick - morning"

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "chapter_en": "NOSE",
  "data": [
    {
      "rubric_en": "NOSE - DISCHARGE - thick",
      "medicines": [
        {"name": "Calc", "grading": 1},
        {"name": "Puls", "grading": 3},
        {"name": "Sil", "grading": 2}
      ]
    }
  ]
}

IMPORTANT:
- Remove trailing periods from medicine names
- Skip cross-references like "(See 'FACE, Eruptions.')"
- Preserve the exact hierarchy from indentation
- Group medicines under their full rubric path`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);
    
    // Extract and flatten the data
    const chapter = parsed.chapter_en || 'UNKNOWN';
    const dataArray = parsed.data || [];
    
    const allResults = [];
    const seenKeys = new Set();
    
    for (const group of dataArray) {
      const rubric_en = group.rubric_en || '';
      
      for (const medObj of (group.medicines || [])) {
        const medName = (medObj.name || '').trim().replace(/\.$/, '');
        const key = `${rubric_en}|||${medName}`.toLowerCase();
        
        if (!seenKeys.has(key) && medName) {
          seenKeys.add(key);
          allResults.push({
            chapter_en: chapter,
            chapter_hi: '',
            rubric_en: rubric_en,
            rubric_hi: '',
            medicine: medName,
            grading: medObj.grading || 1
          });
        }
      }
    }
    
    console.log(`[Tesseract Parser] ✅ Extracted ${allResults.length} medicine-rubric rows`);
    
    // Cleanup processed image
    if (fs.existsSync(processedPath)) {
      fs.unlinkSync(processedPath);
    }
    
    if (allResults.length === 0) {
      throw new Error('AI parsing returned 0 entries. OCR text may be malformed.');
    }
    
    return allResults;
    
  } catch (error) {
    console.error('[Tesseract Parser] Groq AI parsing failed:', error.message);
    throw new Error(`Failed to parse OCR text: ${error.message}`);
  }
};

/**
 * Main export: Process Kent Repertory image using Tesseract OCR + Groq AI.
 * This is a drop-in replacement for parseOcrToStructuredJson that doesn't use Gemini.
 * 
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<Array>} - Structured medicine-rubric rows
 */
const parseImageWithTesseract = async (imagePath) => {
  try {
    return await parseTesseractOcrWithGroq(imagePath);
  } catch (error) {
    console.error('[Tesseract Parser] Error:', error.message);
    throw error;
  }
};

module.exports = {
  parseImageWithTesseract,
  parseTesseractOcrWithGroq
};
