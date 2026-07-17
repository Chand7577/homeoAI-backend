'use strict';

const { initAI, getVisionModel, isAIReady } = require('../config/aiConfig');
const fs = require('fs');
const path = require('path');

/**
 * Initialize AI specifically for Kent OCR extraction
 */
const initKentAI = () => {
  if (!isAIReady()) {
    return initAI();
  }
  return true;
};

/**
 * Robustly parse and repair truncated or slightly malformed JSON from AI.
 */
const repairAndParseJson = (rawText) => {
  let text = rawText.trim();

  // Strip markdown code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?/i, '').replace(/```[\s]*$/m, '').trim();
  }

  // Extract the outermost JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  // Attempt 1: clean parse
  try {
    return JSON.parse(text);
  } catch (_) {
    // Attempt 2: repair truncated JSON
    try {
      let repaired = text;
      const lastGoodClose = repaired.lastIndexOf('},');
      const lastBraceClose = repaired.lastIndexOf('}');

      let cutPos = -1;
      if (lastGoodClose > 0) cutPos = lastGoodClose + 1;
      else if (lastBraceClose > 0) cutPos = lastBraceClose + 1;

      if (cutPos > 0) {
        repaired = repaired.substring(0, cutPos);
        let openBraces = 0, openBrackets = 0;
        let inString = false, escape = false;
        for (const ch of repaired) {
          if (escape) { escape = false; continue; }
          if (ch === '\\') { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') openBraces++;
          else if (ch === '}') openBraces--;
          else if (ch === '[') openBrackets++;
          else if (ch === ']') openBrackets--;
        }
        repaired += ']'.repeat(Math.max(0, openBrackets));
        repaired += '}'.repeat(Math.max(0, openBraces));
        return JSON.parse(repaired);
      }
    } catch (_) { /* fall through */ }

    throw new SyntaxError(`Could not parse AI response. Snippet: ${text.substring(0, 300)}`);
  }
};

/**
 * Run a single vision extraction pass on the image, focusing on a specific region.
 * @param {string} imagePath - Absolute path to the image
 * @param {string} columnHint - "left", "right", or "all"
 * @param {string} chapterHint - Already-detected chapter name to enforce consistency
 */
const extractColumnPass = async (imagePath, columnHint, chapterHint = '') => {
  const model = getVisionModel();

  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.pdf') mimeType = 'application/pdf';

  const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });

  let columnInstruction = '';
  if (columnHint === 'left') {
    columnInstruction = 'FOCUS ONLY on the LEFT half of the image. Ignore all text in the right half.';
  } else if (columnHint === 'right') {
    columnInstruction = 'FOCUS ONLY on the RIGHT half of the image. Ignore all text in the left half.';
  }

  const chapterInstruction = 'Extract the main CHAPTER NAME from the top of the page. Prepend this chapter name to all rubric_en paths.';

  const prompt = `You are a medical data extraction expert extracting from Kent's Repertory.
${columnInstruction}
${chapterInstruction}

--- PAGE LAYOUT & HIERARCHY RULES ---
1. The text is organized in a two-column layout. Focus ONLY on your designated column.
2. EXHAUSTIVE EXTRACTION (CRITICAL): You MUST extract EVERY SINGLE medicine abbreviation visible under each rubric. DO NOT skip, summarize, or truncate any medicines. Every comma-separated word must be captured. Read all deeply indented wrapped lines thoroughly.
3. HIERARCHY by Indentation:
   - NO INDENT (Starts at left margin): MAIN RUBRIC (often ALL CAPS, e.g., "EXTERNAL:", "AGGLUTINATION of nostrils:").
   - 1st INDENT: Sub-rubric (e.g., "morning:", "at root:").
   - 2nd INDENT: Sub-sub-rubric.
   - HANGING INDENT: Medicines belonging to the rubric above them wrap onto deeply indented lines.
4. MEDICINES:
   - They appear immediately after a rubric name (often after a colon ":") and continue on subsequent deeply indented lines.
   - They are comma-separated and usually end with a period (e.g., "Acon., alum., ambr.,").
   - Remove the trailing periods from medicine abbreviations (e.g. "Acon." -> "Acon").
5. RUBRIC PATHS:
   - Combine the Chapter, Main Rubric, and any Sub-rubrics to form the full path.
   - Format: "CHAPTER - MAIN RUBRIC - sub-rubric" (e.g., "NOSE - ABSCESS - at root").
6. GRADING (Font Styles):
   - BOLD (or ALL-CAPS medicines) → Grade 3
   - Italic → Grade 2
   - Normal Roman text → Grade 1
7. CROSS REFERENCES: Skip lines like "(See 'SMELL.')" or "(See 'Epistaxis.')".
8. COLUMN CONTINUATION: If a column starts with a deeply indented list of medicines, they belong to the LAST rubric from the previous column. If the column repeats a rubric name at the very top (e.g., "ROOT."), continue attaching the medicines to that rubric.

--- OUTPUT FORMAT ---
Group all extracted medicines under their full rubric path. Do NOT output a separate object per medicine. Return ONLY the JSON object, no markdown or explanations.

{
  "chapter_en": "NOSE",
  "data": [
    {
      "rubric_en": "NOSE - ABSCESS - at root",
      "medicines": [
        {"name": "Puls", "grading": 2}
      ]
    }
  ]
}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType } }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16000,
      responseMimeType: 'application/json'
    }
  });

  return await result.response.text();
};


/**
 * Main export: parse a Kent's Repertory image via two-pass column extraction.
 * Pass 1 = left column, Pass 2 = right column. Results are merged + deduplicated.
 *
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<Array>} - All medicine-rubric rows
 */
const parseImageToStructuredJson = async (imagePath) => {
  initKentAI();
  console.log(`[Kent AI Parser] Starting two-pass extraction: ${path.basename(imagePath)}`);

  const seenKeys = new Set();
  const allResults = [];
  let mainChapter = '';

  const addResults = (rows, detectedChapter) => {
    // Save the first valid chapter detected
    if (detectedChapter && !mainChapter) {
      mainChapter = detectedChapter.toUpperCase();
    }
    const currentChapter = mainChapter || detectedChapter || 'UNKNOWN';

    for (const group of (rows || [])) {
      const rubric_en = group.rubric_en || '';
      
      // Handle the case where the model still outputs legacy flat rows
      if (group.medicine && typeof group.medicine === 'string') {
        const cleanMed = group.medicine.replace(/\.$/, '').trim();
        const key = `${rubric_en}|||${cleanMed}`.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allResults.push({
            chapter_en: currentChapter,
            chapter_hi: '',
            rubric_en: rubric_en,
            rubric_hi: '',
            medicine: cleanMed,
            grading: group.grading || 1
          });
        }
        continue;
      }
      
      // Handle token-efficient grouped format
      for (const medObj of (group.medicines || [])) {
        const medField = (medObj.name || '').trim();
        const meds = medField.includes(',')
          ? medField.split(',').map(m => m.trim()).filter(Boolean)
          : medField ? [medField] : [];

        for (const med of meds) {
          const cleanMed = med.replace(/\.$/, '');
          const key = `${rubric_en}|||${cleanMed}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            allResults.push({
              chapter_en: currentChapter,
              chapter_hi: '',
              rubric_en: rubric_en,
              rubric_hi: '',
              medicine: cleanMed,
              grading: medObj.grading || 1
            });
          }
        }
      }
    }
  };

  // Pass 1: Left column
  try {
    console.log('[Kent AI Parser] Pass 1: Extracting LEFT column...');
    const leftResponse = await extractColumnPass(imagePath, 'left');
    console.log(`[Kent AI Parser] Left column response: ${leftResponse.length} chars`);
    const leftJson = repairAndParseJson(leftResponse);
    addResults(leftJson.data, leftJson.chapter_en);
    console.log(`[Kent AI Parser] Left column: ${allResults.length} rows so far`);
  } catch (e) {
    console.error('[Kent AI Parser] Left column pass failed:', e.message);
  }

  // Small delay between passes to avoid rate limiting
  await new Promise(r => setTimeout(r, 1500));

  // Pass 2: Right column
  try {
    console.log('[Kent AI Parser] Pass 2: Extracting RIGHT column...');
    const rightResponse = await extractColumnPass(imagePath, 'right');
    console.log(`[Kent AI Parser] Right column response: ${rightResponse.length} chars`);
    const rightJson = repairAndParseJson(rightResponse);
    addResults(rightJson.data, rightJson.chapter_en);
    console.log(`[Kent AI Parser] Right column: ${allResults.length} total rows after merge`);
  } catch (e) {
    console.error('[Kent AI Parser] Right column pass failed:', e.message);
  }

  if (allResults.length === 0) {
    throw new Error('Both column extraction passes failed. No data extracted.');
  }

  console.log(`[Kent AI Parser] ✅ Final: ${allResults.length} unique medicine-rubric rows extracted!`);
  return allResults;
};

// Backward compat alias for routes that call parseOcrToStructuredJson
const generateKentContent = async (prompt, imagePath) => {
  const model = getVisionModel();
  const parts = [{ text: prompt }];
  if (imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });
    parts.push({ inlineData: { data: base64Data, mimeType } });
  }
  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 16000, responseMimeType: 'application/json' }
  });
  return await result.response.text();
};

module.exports = {
  initKentAI,
  generateKentContent,
  parseImageToStructuredJson,
  parseOcrToStructuredJson: parseImageToStructuredJson
};
