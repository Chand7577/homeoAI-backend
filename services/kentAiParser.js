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

  const chapterInstruction = chapterHint
    ? `The chapter for this page is "${chapterHint}" — use it for all rows.`
    : 'The CHAPTER is the large heading at the very top of the page. Use it for ALL rows.';

  const prompt = `You are a medical data extraction expert extracting from Kent's Repertory.
${columnInstruction}
${chapterInstruction}

RULES:
1. Extract ALL medicines visible in your designated half.
2. RUBRICS = ALL-CAPS words (e.g., ROCKING, SLEEP, STANDING).
3. Sub-rubrics = indented modifiers (while:, from:, amel.:, during:, agg.:).
4. rubric_en format: "CHAPTER - RUBRIC - sub-rubric" (e.g., "VERTIGO - SLEEP - during").
5. ONE object per medicine.
6. GRADING from font style:
   - BOLD → 3
   - Italic → 2  
   - Normal → 1
7. Remove trailing periods from medicine names.
8. Return ONLY the JSON object, no explanation.

OUTPUT FORMAT:
{"data": [{"chapter_en":"VERTIGO","chapter_hi":"","rubric_en":"VERTIGO - SLEEP - during","rubric_hi":"","medicine":"Nux-v","grading":3}]}`;

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
 * Detect the chapter name from the image (lightweight first pass).
 */
const detectChapter = async (imagePath) => {
  const model = getVisionModel();
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';

  const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: 'What is the chapter heading at the very top of this Kent\'s Repertory page? Reply with ONLY the chapter name in uppercase, nothing else. Example: VERTIGO' },
        { inlineData: { data: base64Data, mimeType } }
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 20 }
  });

  const chapter = (await result.response.text()).trim().replace(/\.$/, '').toUpperCase();
  console.log(`[Kent AI Parser] Detected chapter: ${chapter}`);
  return chapter;
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

  // Step 0: Detect chapter (cheap call, enforces consistency across both passes)
  let chapter = '';
  try {
    chapter = await detectChapter(imagePath);
  } catch (e) {
    console.warn('[Kent AI Parser] Chapter detection failed, will infer from columns.');
  }

  const seenKeys = new Set();
  const allResults = [];

  const addResults = (rows) => {
    for (const row of (rows || [])) {
      const medField = (row.medicine || '').trim();
      const meds = medField.includes(',')
        ? medField.split(',').map(m => m.trim()).filter(Boolean)
        : medField ? [medField] : [];

      for (const med of meds) {
        const cleanMed = med.replace(/\.$/, '');
        const key = `${row.rubric_en}|||${cleanMed}`.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allResults.push({ ...row, medicine: cleanMed });
        }
      }
    }
  };

  // Pass 1: Left column
  try {
    console.log('[Kent AI Parser] Pass 1: Extracting LEFT column...');
    const leftResponse = await extractColumnPass(imagePath, 'left', chapter);
    console.log(`[Kent AI Parser] Left column response: ${leftResponse.length} chars`);
    const leftJson = repairAndParseJson(leftResponse);
    addResults(leftJson.data);
    console.log(`[Kent AI Parser] Left column: ${allResults.length} rows so far`);
  } catch (e) {
    console.error('[Kent AI Parser] Left column pass failed:', e.message);
  }

  // Small delay between passes to avoid rate limiting
  await new Promise(r => setTimeout(r, 1500));

  // Pass 2: Right column
  try {
    console.log('[Kent AI Parser] Pass 2: Extracting RIGHT column...');
    const rightResponse = await extractColumnPass(imagePath, 'right', chapter);
    console.log(`[Kent AI Parser] Right column response: ${rightResponse.length} chars`);
    const rightJson = repairAndParseJson(rightResponse);
    addResults(rightJson.data);
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
