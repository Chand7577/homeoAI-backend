'use strict';

const { getModel, isAIReady } = require('../config/aiConfig');

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

  const model = getModel();
  
  // Log original text length for debugging
  console.log(`[Kent AI Parser] OCR text length: ${ocrText.length} characters`);
  
  // Increase truncation limit to capture full page (was 7500, now 20000)
  const truncatedText = ocrText.substring(0, 20000);
  
  if (ocrText.length > 20000) {
    console.warn(`[Kent AI Parser] ⚠️ OCR text was truncated from ${ocrText.length} to 20000 characters`);
  }

  const prompt = `You are an expert homeopathic repertory data extraction assistant specializing in Kent's Repertory.
I will provide you with raw OCR text from a single page of Kent's Repertory. The page may be from any chapter (e.g., VERTIGO, MIND, HEAD, etc.).

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
2. Build the FULL hierarchical path for sub-rubrics by combining parent rubrics with sub-rubrics:
   Example from the page:
   - "SITTING" is the main rubric → rubric_en = "VERTIGO - SITTING"
   - "while:" is a sub-rubric → rubric_en = "VERTIGO - SITTING - while"
   - "eating before:" is another sub-rubric → rubric_en = "VERTIGO - SITTING - eating before"
   - "amel.:" is a modifier → rubric_en = "VERTIGO - SITTING - amel"
   
   Another example:
   - "SLEEP" is main rubric → rubric_en = "VERTIGO - SLEEP"
   - "on going to:" is sub-rubric → rubric_en = "VERTIGO - SLEEP - on going to"
   - "during:" is sub-rubric → rubric_en = "VERTIGO - SLEEP - during"
   
3. **EXPAND EVERY MEDICINE INTO A SEPARATE ROW**. This is the MOST IMPORTANT rule.
   Example: "SITTING, eating before: Kali-c." should produce:
   - { "rubric_en": "VERTIGO - SITTING - eating before", "medicine": "Kali-c", "grading": 1 }
   
   Example: "SITTING, while: bell., calc., phos." should produce 3 separate rows:
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "bell", "grading": 1 }
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "calc", "grading": 1 }
   - { "rubric_en": "VERTIGO - SITTING - while", "medicine": "phos", "grading": 1 }
   
4. Indentation indicates sub-rubric hierarchy. Look for patterns like:
   - Main rubric in CAPS
   - Indented qualifiers with colons (from:, while:, during:, after:, amel.:, eating before:, etc.)
   
5. Remove trailing periods from medicine names: "bell." → "bell", "Phos." → "Phos".
6. Skip page numbers, headers, footers, or any non-medicinal text.
7. If a line has no medicines (e.g., cross-references like "See Alcoholic"), skip it.
8. Medicine lists are usually comma-separated. Parse EACH medicine individually.
9. A single rubric line can have 50+ medicines - create ONE ROW for EACH medicine.

--- EXAMPLE INPUT ---
"SITTING, while: Æth., aloe, alum., bell., calc., PHOS."

--- EXAMPLE OUTPUT (6 separate objects, one per medicine) ---
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "Æth", "grading": 1 }
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "aloe", "grading": 1 }
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "alum", "grading": 1 }
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "bell", "grading": 1 }
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "calc", "grading": 1 }
{ "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SITTING - while", "rubric_hi": "", "medicine": "PHOS", "grading": 3 }

--- RAW OCR TEXT FROM PAGE ---
${truncatedText}
--- END OF OCR TEXT ---

Return ONLY a valid JSON object with a single key "data" containing the array. No markdown, no extra text.
{
  "data": [
    { "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - ROCKING", "rubric_hi": "", "medicine": "Bell", "grading": 3 },
    { "chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - ROCKING", "rubric_hi": "", "medicine": "calad", "grading": 1 }
  ]
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.05, // Very low — factual extraction, not creative
        responseMimeType: 'application/json',
        maxOutputTokens: 16384 // Doubled from 8192 - llama-3.3-70b-versatile supports up to 32768
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

    console.log(`[Kent AI Parser] AI returned ${parsedJson.data.length} rows`);
    
    // Log first few rows to see structure
    if (parsedJson.data.length > 0) {
      console.log('[Kent AI Parser] Sample rows:', JSON.stringify(parsedJson.data.slice(0, 3), null, 2));
    }
    
    // POST-PROCESSING: Expand any rows where medicine field contains multiple medicines
    const expandedData = [];
    let expansionCount = 0;
    
    for (const row of parsedJson.data) {
      const medicineField = (row.medicine || '').trim();
      
      // Check if medicine field contains comma-separated medicines
      if (medicineField.includes(',')) {
        // Split by comma and create separate rows
        const medicines = medicineField.split(',').map(m => m.trim()).filter(m => m.length > 0);
        
        console.log(`[Kent AI Parser] Expanding: "${medicineField}" → ${medicines.length} medicines`);
        expansionCount++;
        
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
      // Skip rows with no medicine
    }
    
    console.log(`[Kent AI Parser] Expanded ${expansionCount} rows with comma-separated medicines`);
    console.log(`[Kent AI Parser] ✅ Final count: ${expandedData.length} medicine-rubric rows (from ${parsedJson.data.length} AI rows)`);
    return expandedData;
  } catch (error) {
    console.error('❌ AI parsing failed:', error);
    throw new Error('Failed to parse OCR text into structured data: ' + error.message);
  }
};

module.exports = { parseOcrToStructuredJson };
