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
const extractColumnPass = async (imagePath, columnHint, lastRubricContext = '') => {
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

  const contextInstruction = lastRubricContext
    ? `CONTEXT FROM LEFT COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a comma-separated continuation header (e.g. "COLOR, redness, inside."), reconstruct the parent path from this context and use it for all sub-rubrics beneath it.`
    : '';

  const prompt = `You are a medical data extraction expert extracting from Kent's Repertory.
${columnInstruction}
${chapterInstruction}
${contextInstruction}

--- PAGE LAYOUT & HIERARCHY RULES ---
1. TWO-COLUMN LAYOUT: Focus ONLY on your designated column. Do not read the other half.

2. EXHAUSTIVE EXTRACTION (CRITICAL): You MUST capture EVERY SINGLE medicine abbreviation on every line. Do NOT skip, summarize, or truncate. Read every deeply wrapped hanging-indent line completely.

3. HIERARCHY by Indentation Level:
   - LEVEL 0 (flush left margin, often ALL CAPS or bold): MAIN RUBRIC.
   - LEVEL 1 (small indent): Sub-rubric (e.g., "redness", "right side of:").
   - LEVEL 2 (medium indent): Sub-sub-rubric (e.g., "tip:", "septum:", "wings:").
   - LEVEL 3+ (deep indent): Sub-sub-sub-rubric (e.g., "evening:", "edges:", "corners:").
   - HANGING INDENT: A deeply indented line with ONLY medicine names is a CONTINUATION of the medicines belonging to the rubric directly above it. It is NOT a new rubric.

4. COLUMN HEADER CONTINUATION (VERY IMPORTANT):
   A column sometimes starts with a line like "COLOR, redness, inside." using commas as separators. This is a CONTINUATION HEADER, not a new top-level rubric. It means: all sub-rubrics beneath it belong to that inherited parent path.
   Example from this actual page:
     Right column starts with: "COLOR, redness, inside."  → parent path = "NOSE - COLOR, redness - inside"
       "septum: Alum., bov., bor., lil-t."  → rubric = "NOSE - COLOR, redness - inside - septum"
       "tip: Alum., aur., bell., ..."        → rubric = "NOSE - COLOR, redness - inside - tip"
         "evening: Caps."                    → rubric = "NOSE - COLOR, redness - inside - tip - evening"
         "menses, during: Carb-an."          → rubric = "NOSE - COLOR, redness - inside - tip - menses, during"
       "wings: Calc., kali-bi., ..."         → rubric = "NOSE - COLOR, redness - inside - wings"
         "right: Canth., gins."              → rubric = "NOSE - COLOR, redness - inside - wings - right"
         "edges: Coc-c., gels., phos-ac."    → rubric = "NOSE - COLOR, redness - inside - wings - edges"
         "corners: Benz-ac., plb."           → rubric = "NOSE - COLOR, redness - inside - wings - corners"
     Then the next unindented ALL-CAPS entry "COMEDONES" starts a fresh top-level rubric.

5. RUBRIC PATH FORMAT: "CHAPTER - MAIN RUBRIC, qualifier - sub-rubric - sub-sub-rubric"
   e.g., "NOSE - COLOR, redness - inside - tip - evening"

6. MEDICINES:
   - Comma-separated, usually ending with a period. Remove trailing periods.
   - Grading: BOLD/ALL-CAPS medicine = 3, Italic = 2, Normal = 1.

7. SKIP: Cross-references like "(See 'FACE, Eruptions.')" — skip entirely.

--- OUTPUT FORMAT ---
Group medicines under their full rubric path. Return ONLY valid JSON, no markdown.

{
  "chapter_en": "NOSE",
  "data": [
    {
      "rubric_en": "NOSE - COLOR, redness - inside - septum",
      "medicines": [
        {"name": "Alum", "grading": 1},
        {"name": "bov", "grading": 1}
      ]
    },
    {
      "rubric_en": "NOSE - COLOR, redness - inside - tip - evening",
      "medicines": [
        {"name": "Caps", "grading": 1}
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

  // Pass 2: Right column — pass the last rubric path from left pass as context
  const lastRubricFromLeft = allResults.length > 0 ? allResults[allResults.length - 1].rubric_en : '';
  try {
    console.log('[Kent AI Parser] Pass 2: Extracting RIGHT column...');
    console.log(`[Kent AI Parser] Passing last rubric context to right pass: "${lastRubricFromLeft}"`);
    const rightResponse = await extractColumnPass(imagePath, 'right', lastRubricFromLeft);
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
