'use strict';

const { getModel, isAIReady } = require('../config/aiConfig');

/**
 * Process large OCR text in chunks to avoid Groq's 12k token limit
 * @param {string} ocrText Full OCR text
 * @param {number} chunkSize Max characters per chunk
 * @returns {Promise<Array>} Combined parsed rows
 */
const parseInChunks = async (ocrText, chunkSize) => {
  const chunks = [];
  let startIdx = 0;
  
  // Split text into chunks, trying to break at rubric boundaries
  while (startIdx < ocrText.length) {
    let endIdx = Math.min(startIdx + chunkSize, ocrText.length);
    
    // If not the last chunk, try to break at a line boundary
    if (endIdx < ocrText.length) {
      const nextNewline = ocrText.indexOf('\n', endIdx);
      if (nextNewline !== -1 && nextNewline - endIdx < 500) {
        endIdx = nextNewline;
      }
    }
    
    chunks.push(ocrText.substring(startIdx, endIdx));
    startIdx = endIdx;
  }
  
  console.log(`[Kent AI Parser] Split into ${chunks.length} chunks`);
  
  // Process each chunk sequentially (to avoid rate limits)
  const allResults = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Kent AI Parser] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    
    try {
      const chunkResults = await parseSingleChunk(chunks[i], i + 1, chunks.length);
      allResults.push(...chunkResults);
      
      // Delay between chunks to avoid rate limiting (increased to 2s)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`[Kent AI Parser] Chunk ${i + 1} failed:`, error.message);
      // Continue with next chunk even if one fails
    }
  }
  
  console.log(`[Kent AI Parser] ✅ Combined total: ${allResults.length} rows from ${chunks.length} chunks`);
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
  
  const prompt = `You are an expert homeopathic repertory data extraction assistant specializing in Kent's Repertory.
I will provide you with raw OCR text from a Kent's Repertory page (chunk ${chunkNum}/${totalChunks}).

Your task is to extract EVERY rubric, sub-rubric, and **EACH INDIVIDUAL MEDICINE** listed under them.

--- KENT'S REPERTORY PAGE STRUCTURE ---
- The CHAPTER name is usually at the very top of the page in ALL CAPS (e.g., "VERTIGO.", "MIND.", "HEAD.").
- MAIN RUBRICS are in BOLD ALL CAPS (e.g., "ROCKING", "SITTING", "SLEEP").
- SUB-RUBRICS are indented qualifiers (e.g., "from:", "amel.:", "as if:", "while:", "on going to:", "during:", "after:", "bed, up in:", "eating before:", "high, as if too:", etc.)
- MEDICINES are listed after the rubric/sub-rubric, separated by commas or semicolons.
- Medicine GRADING:
  * Grade 3 (highest) = ALL CAPS medicine name (e.g., "ACON", "PHOS", "NUX-V")
  * Grade 2 (medium)  = Italicised medicine name — in OCR output often appears with slightly different casing or surrounded by styling markers
  * Grade 1 (lowest)  = Plain lowercase medicine name (e.g., "bell.", "calc.", "ars.")
  * IMPORTANT: If a word is ALL CAPS → Grade 3. If mixed/title case but not all caps → Grade 2. If lowercase → Grade 1. When uncertain → Grade 1.

--- REQUIRED OUTPUT SCHEMA ---
For EACH MEDICINE under EACH rubric/sub-rubric, output ONE JSON object.

**CRITICAL**: If a rubric has 50 medicines, you MUST output 50 separate JSON objects - one for each medicine.

{
  "chapter_en": "The chapter name (e.g., 'VERTIGO', 'MIND', 'HEAD')",
  "chapter_hi": "Hindi chapter name if present, else empty string",
  "rubric_en": "Full rubric path using ' - ' as separator (e.g., 'VERTIGO - SITTING - while')",
  "rubric_hi": "Hindi rubric translation if present in text, else empty string",
  "medicine": "Medicine abbreviation exactly as it appears, without trailing period (e.g., 'bell', 'Acon', 'PHOS', 'carb-an')",
  "grading": 1
}

--- CRITICAL RULES ---
1. ALWAYS prefix the rubric path with the CHAPTER name (e.g., "VERTIGO - ROCKING - from", not just "ROCKING - from").
2. Build the FULL hierarchical path for sub-rubrics by combining parent rubrics with sub-rubrics.
3. **EXPAND EVERY MEDICINE INTO A SEPARATE ROW**. This is the MOST IMPORTANT rule.
   Example: "SITTING, while: bell., calc., phos." should produce 3 separate rows:
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "bell", "grading": 1 }
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "calc", "grading": 1 }
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "phos", "grading": 1 }
4. Remove trailing periods from medicine names: "bell." → "bell", "Phos." → "Phos".
5. Skip page numbers, headers, footers, or any non-medicinal text.
6. Medicine lists are usually comma-separated. Parse EACH medicine individually.
7. A single rubric line can have 50+ medicines - create ONE ROW for EACH medicine.

--- RAW OCR TEXT FROM PAGE ---
${chunkText}
--- END OF OCR TEXT ---

Return ONLY a valid JSON object with a single key "data" containing the array. No markdown, no extra text.
{
  "data": [
    { "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - ROCKING", "rubric_hi": "", "medicine": "Bell", "grading": 3 },
    { "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - ROCKING", "rubric_hi": "", "medicine": "calad", "grading": 1 }
  ]
}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.05,
      responseMimeType: 'application/json',
      maxOutputTokens: 12000 // Increased to extract more medicines per chunk
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
  
  // Check if we need to chunk the text to avoid Groq's 12k token limit
  // Reduced to 6000 chars per chunk for more manageable processing
  // This allows ~4500 input tokens + ~3000 prompt tokens = ~7500 total (under 12k limit)
  const MAX_CHUNK_SIZE = 6000;
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
