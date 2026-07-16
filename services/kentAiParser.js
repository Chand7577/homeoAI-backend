'use strict';

const { getModel, isAIReady } = require('../config/aiConfig');

/**
 * Process large OCR text in chunks with generous overlap to ensure 80%+ extraction
 * @param {string} ocrText Full OCR text
 * @param {number} chunkSize Max characters per chunk
 * @returns {Promise<Array>} Combined parsed rows
 */
const parseInChunks = async (ocrText, chunkSize) => {
  const chunks = [];
  const OVERLAP = 600; // 600 char overlap (reduced from 800 for token balance)
  let startIdx = 0;
  
  // Split text into heavily overlapping chunks
  while (startIdx < ocrText.length) {
    let endIdx = Math.min(startIdx + chunkSize, ocrText.length);
    
    // If not the last chunk, try to break at a paragraph/rubric boundary
    if (endIdx < ocrText.length) {
      // Look for double newline (rubric separator) first
      const doubleNewline = ocrText.indexOf('\n\n', endIdx);
      if (doubleNewline !== -1 && doubleNewline - endIdx < 400) {
        endIdx = doubleNewline;
      } else {
        // Otherwise break at single newline
        const nextNewline = ocrText.indexOf('\n', endIdx);
        if (nextNewline !== -1 && nextNewline - endIdx < 200) {
          endIdx = nextNewline;
        }
      }
    }
    
    chunks.push({
      text: ocrText.substring(startIdx, endIdx),
      start: startIdx,
      end: endIdx
    });
    
    // Move forward but overlap generously
    startIdx = endIdx - OVERLAP;
    
    // Prevent infinite loop - always move forward at least 1 char
    if (startIdx <= chunks[chunks.length - 1].start && endIdx < ocrText.length) {
      startIdx = chunks[chunks.length - 1].start + 100;
    }
    
    // Break if we've reached the end
    if (endIdx >= ocrText.length) break;
  }
  
  console.log(`[Kent AI Parser] Split into ${chunks.length} chunks with ${OVERLAP} char overlap`);
  console.log(`[Kent AI Parser] Target: Extract 80%+ medicines (using ${chunks.length} small chunks to avoid 12k token limit)`);
  
  // Process each chunk sequentially (to avoid rate limits)
  const allResults = [];
  const seenMedicines = new Set(); // Deduplicate overlapping entries
  
  for (let i = 0; i < chunks.length; i++) {
    const percentage = Math.round(((i + 1) / chunks.length) * 100);
    console.log(`[Kent AI Parser] 📊 Processing chunk ${i + 1}/${chunks.length} (${percentage}% progress, ${chunks[i].text.length} chars, pos ${chunks[i].start}-${chunks[i].end})...`);
    
    try {
      const chunkResults = await parseSingleChunk(chunks[i].text, i + 1, chunks.length);
      
      // Deduplicate based on rubric + medicine combination
      let newEntries = 0;
      for (const row of chunkResults) {
        const key = `${row.rubric_en}|||${row.medicine}`;
        if (!seenMedicines.has(key)) {
          seenMedicines.add(key);
          allResults.push(row);
          newEntries++;
        }
      }
      
      console.log(`[Kent AI Parser] Chunk ${i + 1} added ${newEntries} new medicines (total: ${allResults.length})`);
      
      // Delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3s delay for stability
      }
    } catch (error) {
      console.error(`[Kent AI Parser] ⚠️ Chunk ${i + 1} failed:`, error.message);
      console.error(`[Kent AI Parser] Continuing with next chunk...`);
      // Continue with next chunk even if one fails
    }
  }
  
  const extractionRate = Math.round((allResults.length / 280) * 100);
  console.log(`[Kent AI Parser] ✅ Extraction complete: ${allResults.length} unique rows from ${chunks.length} chunks`);
  console.log(`[Kent AI Parser] 📈 Estimated extraction rate: ${extractionRate}% (target: 80%+)`);
  
  if (extractionRate < 80) {
    console.warn(`[Kent AI Parser] ⚠️ WARNING: Extraction rate ${extractionRate}% is below 80% target`);
  }
  
  return allResults;
};

/**
 * Parse a single chunk of OCR text
 * @param {string} chunkText Text chunk
 * @param {number} chunkNum Current chunk number
 * @param {number} totalChunks Total number of chunks
 * @returns {Promise<Array>} Parsed rows
 */
const parseSingleChunk = async (chunkText, chunkNum, totalChunks) => {
  const model = getModel();
  
  const prompt = `Extract ALL medicines from Kent's Repertory OCR text (chunk ${chunkNum}/${totalChunks}).

STRUCTURE:
- CHAPTER: ALL CAPS at top (VERTIGO, MIND, HEAD)
- RUBRICS: BOLD CAPS (SITTING, STANDING, STAGGERING)
- Sub-rubrics: lowercase with colon (while:, from:, amel.:)
- Medicines: comma-separated list after rubric

GRADING: ALL CAPS=3, Mixed case=2, lowercase=1

OUTPUT: One JSON object per medicine.
{
  "chapter_en": "VERTIGO",
  "chapter_hi": "",
  "rubric_en": "VERTIGO - SITTING - while",
  "rubric_hi": "",
  "medicine": "bell",
  "grading": 1
}

RULES:
1. Prefix rubric with CHAPTER name
2. ONE ROW per medicine (if 50 medicines, output 50 objects)
3. Remove trailing periods from medicine names
4. Extract ALL medicines in list, not just first 20

OCR TEXT:
${chunkText}

Return JSON only: {"data": [...]}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.05,
      responseMimeType: 'application/json',
      maxOutputTokens: 8000 // 70B model has 12k TPM: ~2k prompt + ~1.5k input + 8k output = 11.5k
    }
  });

  let text = result.response.candidates[0].content.parts[0].text.trim();
  
  // Clean up markdown if the AI mistakenly included it
  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }

  const parsedJson = JSON.parse(text);
  if (!parsedJson.data || !Array.isArray(parsedJson.data)) {
    throw new Error('AI did not return a valid "data" array as expected.');
  }

  console.log(`[Kent AI Parser] Chunk ${chunkNum}/${totalChunks} returned ${parsedJson.data.length} rows`);
  
  // POST-PROCESSING: Expand any rows where medicine field contains multiple medicines
  const expandedData = [];
  
  for (const row of parsedJson.data) {
    const medicineField = (row.medicine || '').trim();
    
    // Check if medicine field contains comma-separated medicines
    if (medicineField.includes(',')) {
      // Split by comma and create separate rows
      const medicines = medicineField.split(',').map(m => m.trim()).filter(m => m.length > 0);
      
      for (const med of medicines) {
        expandedData.push({
          ...row,
          medicine: med.replace(/\.$/, '') // Remove trailing period
        });
      }
    } else if (medicineField.length > 0) {
      // Single medicine, keep as is
      expandedData.push({
        ...row,
        medicine: medicineField.replace(/\.$/, '') // Remove trailing period
      });
    }
  }
  
  return expandedData;
};

/**
 * Prompts the AI (Groq Llama) to parse the raw OCR text from a Kent's Repertory
 * page into a structured JSON array, handling rubrics, sub-rubrics, and medicines.
 *
 * @param {string} ocrText The raw extracted text from Tesseract
 * @returns {Promise<Array>} Parsed rows
 */
const parseOcrToStructuredJson = async (ocrText) => {
  if (!isAIReady()) {
    throw new Error('AI is not configured. Please set the GROQ_API_KEY in your .env file.');
  }

  // Log original text length for debugging
  console.log(`[Kent AI Parser] OCR text length: ${ocrText.length} characters`);
  
  // Check if we need to chunk the text to avoid Groq's token limits
  // llama-3.3-70b-versatile: 12k TPM limit
  // Balance: 1800 char chunks + compact prompt (~1.5k tokens) + 8k output = ~11.5k total
  const MAX_CHUNK_SIZE = 1800;
  const needsChunking = ocrText.length > MAX_CHUNK_SIZE;
  
  if (needsChunking) {
    console.log(`[Kent AI Parser] Text too large (${ocrText.length} chars), processing in chunks...`);
    return await parseInChunks(ocrText, MAX_CHUNK_SIZE);
  }
  
  // For smaller texts, process in one go
  console.log(`[Kent AI Parser] Processing single chunk...`);
  const results = await parseSingleChunk(ocrText, 1, 1);
  console.log(`[Kent AI Parser] ✅ Final count: ${results.length} medicine-rubric rows`);
  return results;
};

module.exports = { parseOcrToStructuredJson };
