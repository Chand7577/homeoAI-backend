'use strict';

const { getModel, isAIReady } = require('../config/aiConfig');

/**
 * Prompts the AI (Groq/Gemini) to parse the raw OCR text into a structured JSON array
 * matching the required schema.
 *
 * @param {string} ocrText The raw extracted text from Tesseract
 * @returns {Promise<Array>} Parsed rows
 */
const parseOcrToStructuredJson = async (ocrText) => {
  if (!isAIReady()) {
    throw new Error('AI is not configured. Please set the GROQ_API_KEY in your .env file.');
  }

  const model = getModel();

  const prompt = `You are a homeopathic repertory data extraction assistant.
I will provide you with raw OCR text scanned from a page of Kent's Repertory (which may contain both English and Hindi translations).
Your job is to extract the rubrics, subrubrics, and medicines, and structure them into a valid JSON array.

REQUIRED SCHEMA (for each entry):
{
  "chapter_en": "English Chapter Name",
  "chapter_hi": "Hindi Chapter Name (if present, else empty string)",
  "rubric_en": "English Rubric/Subrubric Path (e.g., 'HEAD - PAIN - morning')",
  "rubric_hi": "Hindi translation of the Rubric (if present, else empty string)",
  "medicine": "Medicine name abbreviation (e.g., 'Bell', 'Acon', 'Lyc')",
  "grading": "1, 2, or 3 (where 3 is bold/capitals, 2 is italics, 1 is plain text)"
}

Guidelines:
1. Try to infer the chapter from context if missing, or use "" if completely unknown.
2. For the rubric_en, try to construct the full path if indented.
3. Medicine grades in Kent's:
   - PLAIN TEXT (e.g., acon) -> 1
   - ITALICS (e.g., *acon* or italicized) -> 2
   - BOLD/CAPITALS (e.g., ACON) -> 3
   (Since OCR might lose exact styling, infer grade 3 if ALL CAPS, grade 1 if lowercase. If unsure, default to 1).
4. If a rubric has multiple medicines, create a SEPARATE JSON object for EACH medicine.
5. Skip any random OCR noise, page numbers, or headers that do not contain medicinal data.

RAW OCR TEXT:
${ocrText.substring(0, 8000)} // Truncating if extremely long to avoid token limits

Return ONLY a valid JSON object with a single key "data" containing the array. Do not include markdown code blocks or conversational text.
Example format:
{
  "data": [
    { ... }
  ]
}
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // Low temperature for factual extraction
        responseMimeType: "application/json"
      }
    });

    let text = result.response.candidates[0].content.parts[0].text.trim();
    
    // Clean up markdown if the AI mistakenly included it
    if (text.startsWith('\`\`\`')) {
      text = text.replace(/^\`\`\`(json)?/i, '').replace(/\`\`\`$/, '').trim();
    }

    const parsedJson = JSON.parse(text);
    if (!parsedJson.data || !Array.isArray(parsedJson.data)) {
      throw new Error('AI did not return a valid "data" array as expected.');
    }

    return parsedJson.data;
  } catch (error) {
    console.error('❌ AI parsing failed:', error);
    throw new Error('Failed to parse OCR text into structured data: ' + error.message);
  }
};

module.exports = { parseOcrToStructuredJson };
