'use strict';

const { getModel, isAIReady } = require('../config/aiConfig');
const { extractFullPdfText } = require('./pdfService');

/**
 * Parse extracted PDF text into structured Materia Medica format
 * Similar to Kent OCR but for Materia Medica books
 * 
 * Expected output format:
 * {
 *   chapter_en: "MEDICINE NAME",
 *   chapter_hi: "Hindi translation if present",
 *   rubric_en: "SYMPTOM/SECTION - SUBSECTION",
 *   rubric_hi: "Hindi rubric if present",
 *   medicine: "Medicine abbreviation",
 *   grading: 1-3
 * }
 */
const parseMaterialMedicaPdfToStructuredJson = async (pdfText) => {
  if (!isAIReady()) {
    throw new Error('AI is not configured. Please set the GOOGLE_CLOUD_PROJECT and related credentials in your .env file.');
  }

  const model = getModel();
  
  // Truncate if too large to fit in context (keep first portion which usually has TOC and main content)
  const truncatedText = pdfText.substring(0, 50000); // Larger chunk for Materia Medica

  const prompt = `You are an expert homeopathic Materia Medica data extraction assistant.

I will provide you with raw text extracted from a Materia Medica / Repertory PDF. Your task is to extract EVERY rubric, sub-rubric, and medicine listed.

--- MATERIA MEDICA STRUCTURE ---
Materia Medica books describe individual medicines with their symptoms organized by body systems:
- MEDICINE NAME is usually in ALL CAPS or bold at the start of each medicine section (e.g., "ACONITUM NAPELLUS", "BELLADONNA")
- SECTIONS/CHAPTERS are body systems (e.g., "MIND", "HEAD", "EYES", "STOMACH", "FEVER", "SKIN", "GENERALITIES")
- SYMPTOMS are described under each section, often with modalities (worse/better from...)
- Some books may include GRADES indicating symptom intensity (1=present, 2=marked, 3=keynote)

For REPERTORY format:
- CHAPTER is the main body system (e.g., "VERTIGO", "MIND", "HEAD")
- RUBRIC is the symptom description
- SUB-RUBRICS are indented qualifiers (e.g., "worse from:", "better from:", "during:", "after:")
- MEDICINES are listed with grades: ALL CAPS (grade 3), Title Case/Italic (grade 2), lowercase (grade 1)

--- REQUIRED OUTPUT SCHEMA ---
For EACH symptom/rubric/medicine combination, output ONE JSON object:

{
  "chapter_en": "Chapter/Medicine name (e.g., 'MIND', 'ACONITUM', 'VERTIGO')",
  "chapter_hi": "Hindi chapter name if present in text, else empty string",
  "rubric_en": "Full symptom/rubric path using ' - ' separator (e.g., 'ANXIETY - fear of death', 'HEAD - pain - throbbing')",
  "rubric_hi": "Hindi rubric translation if present, else empty string",
  "medicine": "Medicine abbreviation (e.g., 'Acon', 'Bell', 'Phos') - only if this is a repertory. Leave empty for Materia Medica entries",
  "grading": 1
}

--- CRITICAL RULES ---
1. For Materia Medica: chapter_en = medicine name, rubric_en = symptom/section path, medicine field = empty
2. For Repertory: chapter_en = body system, rubric_en = symptom path, medicine = medicine abbreviation
3. Build FULL hierarchical paths for rubrics. Example:
   - "MIND" → rubric_en = "MIND"
   - "   ANXIETY" → rubric_en = "MIND - ANXIETY"
   - "     fear of death" → rubric_en = "MIND - ANXIETY - fear of death"
4. Create a SEPARATE object for EACH medicine (in repertory format) or symptom (in materia medica format)
5. Remove trailing periods from medicine names: "bell." → "Bell"
6. Detect grading from formatting: ALL CAPS = 3, Title/Mixed case = 2, lowercase = 1
7. Skip page numbers, headers, footers, indices, prefaces
8. If a line has no content, skip it

--- PDF TEXT EXTRACT ---
${truncatedText}
--- END OF TEXT ---

Return ONLY a valid JSON object with a single key "data" containing the array. No markdown, no extra text.

{
  "data": [
    { "chapter_en": "ACONITUM NAPELLUS", "chapter_hi": "", "rubric_en": "MIND - ANXIETY - fear of death", "rubric_hi": "", "medicine": "", "grading": 3 },
    { "chapter_en": "HEAD", "chapter_hi": "", "rubric_en": "HEAD - PAIN - throbbing", "rubric_hi": "", "medicine": "Acon", "grading": 3 }
  ]
}`;

  try {
    console.log('[Materia Medica Parser] Calling AI to parse PDF text...');
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.05, // Very low for factual extraction
        responseMimeType: 'application/json'
      }
    });

    let text = result.response.candidates[0].content.parts[0].text.trim();
    
    // Clean up markdown if present
    if (text.startsWith('```')) {
      text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }

    const parsedJson = JSON.parse(text);
    
    if (!parsedJson.data || !Array.isArray(parsedJson.data)) {
      throw new Error('AI did not return a valid "data" array as expected.');
    }

    console.log(`[Materia Medica Parser] ✅ Extracted ${parsedJson.data.length} rows`);
    return parsedJson.data;
    
  } catch (error) {
    console.error('❌ Materia Medica parsing failed:', error);
    throw new Error('Failed to parse PDF text into structured data: ' + error.message);
  }
};

/**
 * Main extraction pipeline: PDF → Text → AI Parsing → Structured Data
 */
const extractMaterialMedicaFromPdf = async (pdfFilePath) => {
  console.log('🔍 Starting Materia Medica PDF extraction...');
  
  // Step 1: Extract all text from PDF
  const { text, totalPages } = await extractFullPdfText(pdfFilePath);
  
  if (!text || text.trim().length < 100) {
    throw new Error('PDF text extraction failed or produced insufficient content. The PDF may be image-based or encrypted.');
  }
  
  // Step 2: Parse text with AI
  const structuredData = await parseMaterialMedicaPdfToStructuredJson(text);
  
  console.log(`✅ Extraction complete: ${structuredData.length} entries from ${totalPages} pages`);
  
  return {
    data: structuredData,
    totalPages: totalPages,
    totalEntries: structuredData.length
  };
};

module.exports = {
  extractMaterialMedicaFromPdf,
  parseMaterialMedicaPdfToStructuredJson
};
