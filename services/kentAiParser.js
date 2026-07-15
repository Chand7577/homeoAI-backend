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
  
  // Truncate to avoid token limits (separate from the prompt template)
  const truncatedText = ocrText.substring(0, 7500);

  const prompt = `You are an expert homeopathic repertory data extraction assistant specializing in Kent's Repertory.
I will provide you with raw OCR text from a single page of Kent's Repertory. The page may be from any chapter (e.g., VERTIGO, MIND, HEAD, etc.).

Your task is to extract EVERY rubric, sub-rubric, and each individual medicine listed under them.

--- KENT'S REPERTORY PAGE STRUCTURE ---
- The CHAPTER name is usually at the very top of the page in ALL CAPS (e.g., "VERTIGO.", "MIND.", "HEAD.").
- MAIN RUBRICS are in BOLD ALL CAPS (e.g., "ROCKING", "SITTING", "SLEEP").
- SUB-RUBRICS are indented qualifiers (e.g., "from:", "amel.:", "as if:", "while:", "on going to:", "during:", "after:", "bed, up in:", "eating before:", "high, as if too:", etc.)
- MEDICINES are listed after the rubric/sub-rubric, separated by commas.
- Medicine GRADING:
  * Grade 3 (highest) = ALL CAPS medicine name (e.g., "ACON", "PHOS", "NUX-V")
  * Grade 2 (medium)  = Italicised medicine name — in OCR output often appears with slightly different casing or surrounded by styling markers
  * Grade 1 (lowest)  = Plain lowercase medicine name (e.g., "bell.", "calc.", "ars.")
  * IMPORTANT: If a word is ALL CAPS → Grade 3. If mixed/title case but not all caps → Grade 2. If lowercase → Grade 1. When uncertain → Grade 1.

--- REQUIRED OUTPUT SCHEMA ---
For EACH medicine under EACH rubric/sub-rubric, output ONE JSON object:
{
  "chapter_en": "The chapter name (e.g., 'VERTIGO', 'MIND', 'HEAD')",
  "chapter_hi": "Hindi chapter name if present, else empty string",
  "rubric_en": "Full rubric path using ' - ' as separator (e.g., 'VERTIGO - SITTING - bed, up in')",
  "rubric_hi": "Hindi rubric translation if present in text, else empty string",
  "medicine": "Medicine abbreviation exactly as it appears, without trailing period (e.g., 'bell', 'Acon', 'PHOS', 'carb-an')",
  "grading": 1
}

--- CRITICAL RULES ---
1. ALWAYS prefix the rubric path with the CHAPTER name (e.g., "VERTIGO - ROCKING - from", not just "ROCKING - from").
2. Build the FULL hierarchical path for sub-rubrics. Example:
   - "ROCKING" → rubric_en = "VERTIGO - ROCKING"
   - "   from: Bor., coff." → rubric_en = "VERTIGO - ROCKING - from"
   - "   amel.: Secale." → rubric_en = "VERTIGO - ROCKING - amel"
3. Create a SEPARATE object for EACH medicine. If "ROCKING" has 5 medicines, output 5 objects.
4. Do NOT merge medicines into a single object. One medicine = one row.
5. Remove trailing periods from medicine names: "bell." → "bell", "Phos." → "Phos".
6. Skip page numbers, headers, footers, or any non-medicinal text.
7. If a line has no medicines (e.g., cross-references like "See Alcoholic"), skip it.

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
        responseMimeType: 'application/json'
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

    console.log(`[Kent AI Parser] Extracted ${parsedJson.data.length} medicine-rubric rows.`);
    return parsedJson.data;
  } catch (error) {
    console.error('❌ AI parsing failed:', error);
    throw new Error('Failed to parse OCR text into structured data: ' + error.message);
  }
};

module.exports = { parseOcrToStructuredJson };
