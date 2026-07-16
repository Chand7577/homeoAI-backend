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
  const OVERLAP = 800; // Generous overlap to prevent data loss
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
  console.log(`[Kent AI Parser] Target: Extract 80%+ medicines (224+ out of ~280 estimated)`);
  
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
  
  const prompt = `You are an expert homeopathic repertory data extraction assistant specializing in Kent's Repertory.
I will provide you with raw OCR text from a Kent's Repertory page (chunk ${chunkNum}/${totalChunks}).

**CRITICAL MISSION: Extract EVERY SINGLE medicine from this chunk. Missing even one medicine is a failure.**

Your task is to extract EVERY rubric, sub-rubric, and **EACH INDIVIDUAL MEDICINE** listed under them.

--- KENT'S REPERTORY PAGE STRUCTURE ---
- The CHAPTER name is usually at the very top of the page in ALL CAPS (e.g., "VERTIGO.", "MIND.", "HEAD.").
- MAIN RUBRICS are in BOLD ALL CAPS (e.g., "ROCKING", "SITTING", "SLEEP", "STAGGERING", "STANDING").
- SUB-RUBRICS are indented qualifiers (e.g., "from:", "amel.:", "as if:", "while:", "on going to:", "during:", "after:", "bed, up in:", "eating before:", "high, as if too:", etc.)
- MEDICINES are listed after the rubric/sub-rubric, separated by commas or semicolons.
- A SINGLE rubric line can have 50-70+ medicines - YOU MUST extract ALL of them, not just the first 20-30.
- Medicine GRADING:
  * Grade 3 (highest) = ALL CAPS medicine name (e.g., "ACON", "PHOS", "NUX-V")
  * Grade 2 (medium)  = Italicised medicine name — in OCR output often appears with slightly different casing
  * Grade 1 (lowest)  = Plain lowercase medicine name (e.g., "bell.", "calc.", "ars.")

--- REQUIRED OUTPUT SCHEMA ---
For EACH MEDICINE under EACH rubric/sub-rubric, output ONE JSON object.

**YOU MUST CREATE ONE ROW PER MEDICINE. If you see 70 medicines, output 70 objects.**

{
  "chapter_en": "The chapter name (e.g., 'VERTIGO', 'MIND', 'HEAD')",
  "chapter_hi": "Hindi chapter name if present, else empty string",
  "rubric_en": "Full rubric path using ' - ' as separator (e.g., 'VERTIGO - SITTING - while')",
  "rubric_hi": "Hindi rubric translation if present in text, else empty string",
  "medicine": "Medicine abbreviation exactly as it appears, without trailing period",
  "grading": 1
}

--- CRITICAL EXTRACTION RULES ---
1. ALWAYS prefix the rubric path with the CHAPTER name.
2. Build the FULL hierarchical path for sub-rubrics.
3. **NEVER TRUNCATE THE MEDICINE LIST. Extract ALL medicines, even if there are 70+ in one rubric.**
4. If a rubric line says "bell., calc., phos., ... [50 more medicines]", you MUST extract all 53 medicines.
5. Do NOT stop at the 20th or 30th medicine. Continue until the LAST medicine in the list.
6. Remove trailing periods: "bell." → "bell"
7. Skip page numbers, headers, footers only.
8. Medicine lists are comma-separated. Parse EACH one.

--- EXAMPLE: LONG MEDICINE LIST ---
Input: "SITTING, while: Æth., aloe, alum., am-c., anac., apis, arg-m., ars., bell., calc., camph., carb-ac., carb-an., carb-s., carb-v., caust., cham., chin., cic., coca., cocc., colch., coloc., cop., croth., crot-t., cupr., dig., eugen."

YOU MUST OUTPUT 28 SEPARATE OBJECTS (one per medicine), NOT just the first 10.

--- RAW OCR TEXT FROM PAGE ---
${chunkText}
--- END OF OCR TEXT ---

Return ONLY valid JSON with a "data" array. No markdown, no truncation, no shortcuts.
Extract EVERY medicine you see. This is critical for medical accuracy.`;

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
  // Aggressive chunking: 3500 chars per chunk with 800 char overlap
  // Target: 80%+ extraction (224+ out of 280 medicines)
  const MAX_CHUNK_SIZE = 3500;
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
