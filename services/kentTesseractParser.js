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
  // Split text into chunks if too large (Groq limit: 12,000 tokens/min)
  console.log('[Tesseract Parser] Step 2: Parsing OCR text with Groq AI...');
  
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not found in environment');
  }
  
  const groq = new Groq({ apiKey: groqApiKey });
  
  // Split OCR text into left and right columns (simulating the two-column layout)
  const lines = ocrText.split('\n');
  const midpoint = Math.floor(lines.length / 2);
  const leftText = lines.slice(0, midpoint).join('\n');
  const rightText = lines.slice(midpoint).join('\n');
  
  console.log(`[Tesseract Parser] Splitting into 2 chunks: ${leftText.length} + ${rightText.length} chars`);
  
  const allResults = [];
  const seenKeys = new Set();
  let chapter = '';
  
  // Process both chunks
  const chunks = [leftText, rightText];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    if (chunkText.trim().length < 20) {
      console.log(`[Tesseract Parser] Skipping empty chunk ${i + 1}`);
      continue;
    }
    
    const prompt = `You are a medical data extraction expert parsing OCR text from Kent's Repertory.

TASK: Parse the following OCR text into structured JSON format.

OCR TEXT:
"""
${chunkText}
"""

PARSING RULES:
1. Extract chapter name from the top (usually ALL CAPS like "NOSE", "ABDOMEN", etc.)
2. Identify rubrics (symptoms) and their hierarchy based on indentation
3. Extract medicine abbreviations after each rubric (comma-separated, with period at end)
4. Determine medicine grading:
   - Grade 3: ALL CAPS medicines (most important)
   - Grade 2: Italic medicines
   - Grade 1: Normal text (default)
5. Build full rubric paths: "CHAPTER - MAIN RUBRIC - sub-rubric - sub-sub-rubric"

OUTPUT FORMAT (JSON only):
{
  "chapter_en": "NOSE",
  "data": [
    {
      "rubric_en": "NOSE - DISCHARGE - thick",
      "medicines": [
        {"name": "Calc", "grading": 1},
        {"name": "Puls", "grading": 3}
      ]
    }
  ]
}

IMPORTANT:
- Remove trailing periods from medicine names
- Skip cross-references like "(See...)"
- Return ONLY valid JSON`;

    try {
      console.log(`[Tesseract Parser] Processing chunk ${i + 1}/2...`);
      
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);
      
      // Extract chapter from first chunk
      if (!chapter && parsed.chapter_en) {
        chapter = parsed.chapter_en;
      }
      
      const dataArray = parsed.data || [];
      
      for (const group of dataArray) {
        const rubric_en = group.rubric_en || '';
        
        for (const medObj of (group.medicines || [])) {
          const medName = (medObj.name || '').trim().replace(/\.$/, '');
          const key = `${rubric_en}|||${medName}`.toLowerCase();
          
          if (!seenKeys.has(key) && medName) {
            seenKeys.add(key);
            allResults.push({
              chapter_en: chapter || 'UNKNOWN',
              chapter_hi: '',
              rubric_en: rubric_en,
              rubric_hi: '',
              medicine: medName,
              grading: medObj.grading || 1
            });
          }
        }
      }
      
      console.log(`[Tesseract Parser] Chunk ${i + 1}: Extracted ${dataArray.length} rubrics`);
      
      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
      
    } catch (error) {
      console.error(`[Tesseract Parser] Chunk ${i + 1} failed:`, error.message);
      
      // Check if it's a token limit error
      if (error.message.includes('rate_limit_exceeded') || error.message.includes('too large')) {
        console.warn(`[Tesseract Parser] Token limit exceeded on chunk ${i + 1}. Trying smaller model...`);
        
        // Try with smaller model that has larger context
        try {
          const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant', // Smaller, faster model
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 4000,
            response_format: { type: 'json_object' }
          });
          
          const responseText = completion.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(responseText);
          
          if (!chapter && parsed.chapter_en) {
            chapter = parsed.chapter_en;
          }
          
          const dataArray = parsed.data || [];
          
          for (const group of dataArray) {
            const rubric_en = group.rubric_en || '';
            for (const medObj of (group.medicines || [])) {
              const medName = (medObj.name || '').trim().replace(/\.$/, '');
              const key = `${rubric_en}|||${medName}`.toLowerCase();
              if (!seenKeys.has(key) && medName) {
                seenKeys.add(key);
                allResults.push({
                  chapter_en: chapter || 'UNKNOWN',
                  chapter_hi: '',
                  rubric_en: rubric_en,
                  rubric_hi: '',
                  medicine: medName,
                  grading: medObj.grading || 1
                });
              }
            }
          }
          
          console.log(`[Tesseract Parser] Chunk ${i + 1} (fallback): Extracted ${dataArray.length} rubrics`);
        } catch (fallbackError) {
          console.error(`[Tesseract Parser] Fallback also failed for chunk ${i + 1}:`, fallbackError.message);
          // Continue to next chunk instead of failing completely
        }
      }
    }
  }
  
  console.log(`[Tesseract Parser] ✅ Total extracted: ${allResults.length} medicine-rubric rows`);
  
  // Cleanup processed image
  if (fs.existsSync(processedPath)) {
    fs.unlinkSync(processedPath);
  }
  
  if (allResults.length === 0) {
    throw new Error('AI parsing returned 0 entries. OCR text may be malformed or too complex.');
  }
  
  return allResults;
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
