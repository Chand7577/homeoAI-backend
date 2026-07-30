'use strict';

const { initAI, getVisionModel, isAIReady } = require('../config/aiConfig');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Comprehensive Kent's Repertory Homeopathic Remedy Correction Dictionary.
 * Corrects common OCR & Vision model character substitutions, missing hyphens, and ligatures.
 */
const REMEDY_SPELL_CORRECTIONS = {
  // Common OCR character substitution errors (n/m, l/i/1, c/e)
  'ann-m': 'am-m',
  'ani-c': 'am-c',
  'anbr': 'ambr',
  'aur-u': 'aur-m',
  'nice': 'nicc',
  'xant': 'xantlt',
  'xant-l': 'xantlt',
  'mercy-c': 'merc-c',
  'merc-cy': 'merc-c',
  'clan': 'cham',
  'coc-t': 'cocc',
  'coee': 'cocc',
  'aesc': 'æsc',
  'aesc-h': 'æsc',
  'csc': 'æsc',
  'sol-tæ': 'sol-t-æ',
  'sol-tae': 'sol-t-æ',
  'sol-t-ae': 'sol-t-æ',
  'squil': 'squill',
  'aium': 'alum',
  'aioe': 'aloe',
  'bei1': 'bell',
  'be11': 'bell',
  'cale': 'calc',
  'betb': 'berb',
  'oena': 'œna',
  'oen': 'œna',
  'chins': 'chin-s',
  'chin-s': 'chin-s',
  'nuxv': 'nux-v',
  'nuxm': 'nux-m',
  'nitac': 'nit-ac',
  'sulac': 'sul-ac',
  'phac': 'ph-ac',
  'carbv': 'carb-v',
  'kalibi': 'kali-bi',
  'rhust': 'rhus-t',
  'eup-per': 'eup-per',
  'crot-t': 'crot-t',
  'coc-c': 'coc-c',
  'lil-t': 'lil-t',
  'lilt': 'lil-t',
  'tarent-c': 'tarent-c',
  'tarentc': 'tarent-c',
  'viol-o': 'viol-o',
  'viol-t': 'viol-t',
  'merc-i-f': 'merc-i-f',
  'merc-i-r': 'merc-i-r',
  'crot-h': 'crot-h'
};

/**
 * Clean trailing periods/punctuation, normalize hyphens, and apply remedy spell corrections.
 */
const cleanAndCorrectMedicine = (medName) => {
  if (!medName || typeof medName !== 'string') return '';
  let clean = medName.trim().replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
  if (!clean) return '';

  // 1. Normalize unhyphenated compound remedy names (e.g. "Am c" -> "Am-c", "Nux v" -> "Nux-v", "Nit ac" -> "Nit-ac")
  clean = clean.replace(/\b(Am|Ant|Aur|Bar|Calc|Carb|Crot|Eup|Kali|Mag|Merc|Nat|Nux|Ph|Pic|Rhus|Sul|Sul-ac|Viol)\s+(ac|an|b|bi|c|f|h|i|m|n|p|r|s|t|v)\b/gi, '$1-$2');

  const lower = clean.toLowerCase();

  // 2. Direct dictionary match
  if (REMEDY_SPELL_CORRECTIONS[lower]) {
    const corrected = REMEDY_SPELL_CORRECTIONS[lower];
    if (/^[A-Z]/.test(clean)) {
      return corrected.charAt(0).toUpperCase() + corrected.slice(1);
    }
    return corrected;
  }

  return clean;
};

/**
 * Physically split image into high-res Left and Right column crops.
 * This prevents cross-column text bleeding and doubles input visual clarity for AI Vision.
 */
const splitImageForAi = async (imagePath) => {
  try {
    const metadata = await sharp(imagePath).metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 1600;

    const dir = path.dirname(imagePath);
    const ext = path.extname(imagePath) || '.jpg';
    const base = path.basename(imagePath, ext);

    const leftCropPath = path.join(dir, `${base}_ai_left${ext}`);
    const rightCropPath = path.join(dir, `${base}_ai_right${ext}`);

    const halfWidth = Math.floor(width * 0.52);
    const rightStart = Math.floor(width * 0.48);

    await sharp(imagePath)
      .extract({ left: 0, top: 0, width: halfWidth, height })
      .jpeg({ quality: 90 })
      .toFile(leftCropPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height })
      .jpeg({ quality: 90 })
      .toFile(rightCropPath);

    return {
      leftCropPath,
      rightCropPath,
      cleanup: () => {
        try { if (fs.existsSync(leftCropPath)) fs.unlinkSync(leftCropPath); } catch (_) {}
        try { if (fs.existsSync(rightCropPath)) fs.unlinkSync(rightCropPath); } catch (_) {}
      }
    };
  } catch (err) {
    console.warn(`[Kent AI Parser] Sharp column crop warning: ${err.message}`);
    return { leftCropPath: imagePath, rightCropPath: imagePath, cleanup: () => {} };
  }
};

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

  // Note: imagePath is already physically cropped to a single column by Sharp!
  const columnInstruction = 'PROCESS THE FULL IMAGE: This image is a single vertical column from Kent\'s Repertory. Extract all text from top-left to bottom-right across the full image.';

  const chapterInstruction = 'DYNAMIC CHAPTER DETECTION: Locate the main CHAPTER NAME from the page running header at the top (e.g. MIND, HEAD, EYE, EAR, NOSE, FACE, MOUTH, THROAT, STOMACH, ABDOMEN, RECTUM, STOOL, URINARY, GENITALIA, RESPIRATION, COUGH, CHEST, BACK, EXTREMITIES, SLEEP, FEVER, SKIN, GENERALITIES, etc.). Set "chapter_en" to this detected chapter name.';

  const contextInstruction = lastRubricContext
    ? `CONTEXT FROM PREVIOUS COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a continuation header (e.g. "PAIN, tearing." or "COLOR, redness, inside."), reconstruct the parent path using this context for all sub-rubrics beneath it.`
    : '';

  const prompt = `You are an expert medical data extractor processing James Tyler Kent's Repertory of the Homeopathic Materia Medica.
${columnInstruction}
${chapterInstruction}
${contextInstruction}

--- REPERTORY LAYOUT & HIERARCHY STACK RULES ---
1. EXHAUSTIVE LINE-BY-LINE EXTRACTION (CRITICAL):
   Extract EVERY SINGLE remedy listed under every rubric from top to bottom of this column image.
   Do NOT skip long remedy lists (e.g. 50+ medicines under "tenesmus:" or "tearing:").
   Read every line completely, including deeply wrapped hanging-indent lines.

2. INDENTATION STACK & RUBRIC PATH ASSEMBLY:
   - Level 0 (Flush Left / ALL CAPS or BOLD): Main Rubric (e.g., "PAIN", "TEARING", "STITCHING", "TENESMUS"). Resets active sub-rubric stack.
   - Level 1 (First indent): Sub-rubric (e.g., "stitching, stool:", "walking, while:", "extending to abdomen:").
   - Level 2 (Second indent): Sub-sub-rubric (e.g., "after:", "during stool:", "pudendum, during menses:").
   - Level 3 (Third indent): Sub-sub-sub-rubric (e.g., "after stool:", "edges:", "corners:").

3. FULL RUBRIC PATH SYNTAX:
   Format: "[DETECTED_CHAPTER] - MAIN RUBRIC - SUBRUBRIC - SUBSUBRUBRIC"
   Examples:
     "[CHAPTER] - PAIN - stitching, stool - after"
     "[CHAPTER] - PAIN - stitching, stool - pudendum, during menses - after stool"
     "[CHAPTER] - PAIN - tearing - evening - after hard stool"
     "[CHAPTER] - PAIN - tenesmus - dysentery, during"

4. SUB-RUBRICS VS HANGING REMEDY CONTINUATION LINES:
   - A line with text ending in a colon ":" or comma (e.g. "morning:", "bed, in:", "stool, during:") defines a NEW SUB-RUBRIC heading.
   - A line with NO rubric heading that contains ONLY comma-separated remedy abbreviations (e.g. "bry., cact., calc., cann-i., Caps., carb-v.") is a HANGING INDENT CONTINUATION of remedies belonging to the rubric directly above it! Do NOT create a new rubric for hanging remedy lines; attach all remedies to the active rubric above!

5. COLUMN CONTINUATION HEADERS AT TOP OF COLUMN:
   - If the column top starts with a line like "PAIN, tearing." or "COLOR, redness, inside.", this is an INHERITED PARENT HEADER from the previous column.
   - Reconstruct the parent path from the previous column context and append all subsequent sub-rubrics under it until a new flush-left ALL-CAPS rubric appears.

6. MEDICINES & CLINICAL TYPOGRAPHY GRADING:
   - Capture every remedy abbreviation on every line. Clean off trailing periods.
   - BOLD ALL CAPS or BOLD remedy (e.g. **Æsc.**, **Nit-ac.**, **Caps.**, **Sulph.**, **Merc.**) = grading 3
   - ITALIC remedy (e.g. *thuj.*, *mag-m.*, *graph.*, *nat-m.*) = grading 2
   - NORMAL ROMAN remedy (e.g. berb., calad., canth.) = grading 1

7. SKIP CROSS-REFERENCES:
   - Skip entries like "(See 'FACE, Eruptions.')" — do not output cross-reference text.

--- OUTPUT FORMAT ---
Return ONLY valid JSON matching this structure (no markdown, no preamble):
{
  "chapter_en": "DETECTED_CHAPTER_NAME",
  "data": [
    {
      "rubric_en": "DETECTED_CHAPTER_NAME - MAIN RUBRIC - SUBRUBRIC",
      "medicines": [
        {"name": "remedy_abbreviation", "grading": 1}
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
  console.log(`[Kent AI Parser] Starting two-pass column crop extraction: ${path.basename(imagePath)}`);

  // Split image into high-res physical column crops
  const { leftCropPath, rightCropPath, cleanup } = await splitImageForAi(imagePath);

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
        const cleanMed = cleanAndCorrectMedicine(group.medicine);
        if (!cleanMed) continue;
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
          const cleanMed = cleanAndCorrectMedicine(med);
          if (!cleanMed) continue;
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

  /**
   * Helper to safely extract data array from parsed JSON.
   * The AI might return: {data: [...]}, {chapter_en: "...", data: [...]}, or just [...]
   */
  const extractDataArray = (parsed) => {
    if (Array.isArray(parsed)) return { data: parsed, chapter: '' };
    if (parsed && Array.isArray(parsed.data)) return { data: parsed.data, chapter: parsed.chapter_en || '' };
    // Maybe it's wrapped differently
    const keys = Object.keys(parsed || {});
    for (const key of keys) {
      if (Array.isArray(parsed[key])) return { data: parsed[key], chapter: parsed.chapter_en || '' };
    }
    return { data: [], chapter: '' };
  };

  try {
    // Pass 1: Left column crop
    try {
      console.log('[Kent AI Parser] Pass 1: Extracting LEFT column crop...');
      const leftResponse = await extractColumnPass(leftCropPath, 'left');
      console.log(`[Kent AI Parser] Left column response: ${leftResponse.length} chars`);
      console.log(`[Kent AI Parser] Left response preview: ${leftResponse.substring(0, 200)}`);
      const leftParsed = repairAndParseJson(leftResponse);
      const { data: leftData, chapter: leftChapter } = extractDataArray(leftParsed);
      console.log(`[Kent AI Parser] Left column parsed: ${leftData.length} groups, chapter="${leftChapter}"`);
      addResults(leftData, leftChapter);
      console.log(`[Kent AI Parser] Left column: ${allResults.length} rows so far`);
    } catch (e) {
      console.error('[Kent AI Parser] Left column pass failed:', e.message);
    }

    // Delay between passes to respect rate limits
    await new Promise(r => setTimeout(r, 2000));

    // Pass 2: Right column crop — pass the last rubric path from left pass as context
    const lastRubricFromLeft = allResults.length > 0 ? allResults[allResults.length - 1].rubric_en : '';
    const leftRowCount = allResults.length;
    let rightAttempts = 0;
    const maxRetries = 2;

    while (rightAttempts < maxRetries) {
      rightAttempts++;
      try {
        console.log(`[Kent AI Parser] Pass 2 (attempt ${rightAttempts}): Extracting RIGHT column crop...`);
        console.log(`[Kent AI Parser] Passing last rubric context: "${lastRubricFromLeft}"`);
        const rightResponse = await extractColumnPass(rightCropPath, 'right', lastRubricFromLeft);
        console.log(`[Kent AI Parser] Right column response: ${rightResponse.length} chars`);
        console.log(`[Kent AI Parser] Right response preview: ${rightResponse.substring(0, 300)}`);
        
        const rightParsed = repairAndParseJson(rightResponse);
        const { data: rightData, chapter: rightChapter } = extractDataArray(rightParsed);
        console.log(`[Kent AI Parser] Right column parsed: ${rightData.length} groups, chapter="${rightChapter}"`);
        
        addResults(rightData, rightChapter);
        const rightRowsAdded = allResults.length - leftRowCount;
        console.log(`[Kent AI Parser] Right column: +${rightRowsAdded} rows (${allResults.length} total)`);
        
        if (rightRowsAdded > 0) break; // Success
        console.warn(`[Kent AI Parser] Right column returned 0 new rows. Retrying...`);
      } catch (e) {
        console.error(`[Kent AI Parser] Right column pass attempt ${rightAttempts} failed:`, e.message);
      }
      
      if (rightAttempts < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Fallback: If right column produced 0 rows, try a FULL PAGE pass
    if (allResults.length === leftRowCount) {
      console.warn('[Kent AI Parser] ⚠️ Right column crop extraction failed after retries. Trying FULL PAGE fallback...');
      await new Promise(r => setTimeout(r, 2000));
      try {
        const fullResponse = await extractColumnPass(imagePath, 'all', lastRubricFromLeft);
        console.log(`[Kent AI Parser] Full page response: ${fullResponse.length} chars`);
        const fullParsed = repairAndParseJson(fullResponse);
        const { data: fullData, chapter: fullChapter } = extractDataArray(fullParsed);
        console.log(`[Kent AI Parser] Full page parsed: ${fullData.length} groups`);
        addResults(fullData, fullChapter);
        console.log(`[Kent AI Parser] After full page fallback: ${allResults.length} total rows`);
      } catch (e) {
        console.error('[Kent AI Parser] Full page fallback also failed:', e.message);
      }
    }

    if (allResults.length === 0) {
      throw new Error('All extraction passes failed. No data extracted.');
    }

    console.log(`[Kent AI Parser] ✅ Final: ${allResults.length} unique medicine-rubric rows extracted!`);
    return allResults;

  } finally {
    // Cleanup temporary image crop files
    cleanup();
  }
};

/**
 * Translate English rubrics and chapters to Hindi using AI.
 * Uses Groq (Llama 3.3 70B) for fast, high-quality translation with generous quota.
 * Batches translations to minimize API calls.
 * 
 * @param {Array} structuredData - Array of extracted rubric rows with chapter_en and rubric_en
 * @returns {Promise<Array>} - Same data with chapter_hi and rubric_hi filled in
 */
/**
 * Free Google Translate HTTP helper for fast Devanagari translation (0 cost, 0 token limits).
 */
const googleTranslateSingle = (text, targetLang = 'hi') => {
  if (!text || !text.trim()) return Promise.resolve('');
  const https = require('https');
  return new Promise((resolve) => {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text.trim());
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translatedText = parsed[0].map(item => item[0]).join('');
          resolve(translatedText || text);
        } catch (e) {
          resolve(text);
        }
      });
    }).on('error', () => resolve(text));
  });
};

/**
 * High-performance Hindi Translation Service.
 * Uses Google Translate Free GTX Engine (0 cost, ultra-fast ~500ms) with Groq LLM fallback.
 *
 * @param {Array} structuredData - Array of extracted rubric rows with chapter_en and rubric_en
 * @returns {Promise<Array>} - Same data with chapter_hi and rubric_hi filled in
 */
const translateRubricsToHindi = async (structuredData) => {
  if (!structuredData || structuredData.length === 0) {
    return structuredData;
  }

  // Collect unique chapters and rubrics
  const uniqueChapters = new Set();
  const uniqueRubrics = new Set();
  
  structuredData.forEach(row => {
    if (row.chapter_en) uniqueChapters.add(row.chapter_en.trim());
    if (row.rubric_en) uniqueRubrics.add(row.rubric_en.trim());
  });

  const chaptersArray = Array.from(uniqueChapters);
  const rubricsArray = Array.from(uniqueRubrics);

  console.log(`[Hindi Translation] Translating ${chaptersArray.length} chapters and ${rubricsArray.length} rubrics...`);
  const startTime = Date.now();

  // Step 1: Try Free Google Translate API first (Lightning fast: ~500ms total, 0 token limits)
  try {
    const chapterPromises = chaptersArray.map(ch => googleTranslateSingle(ch).then(res => [ch, res]));
    const rubricPromises = rubricsArray.map(rub => googleTranslateSingle(rub).then(res => [rub, res]));

    const chapterResults = Object.fromEntries(await Promise.all(chapterPromises));
    const rubricResults = Object.fromEntries(await Promise.all(rubricPromises));

    const duration = Date.now() - startTime;
    console.log(`[Hindi Translation] ✅ Google Translate completed ${chaptersArray.length + rubricsArray.length} items in ${duration}ms!`);

    return structuredData.map(row => ({
      ...row,
      chapter_hi: row.chapter_hi || chapterResults[row.chapter_en?.trim()] || '',
      rubric_hi: row.rubric_hi || rubricResults[row.rubric_en?.trim()] || ''
    }));

  } catch (err) {
    console.warn('[Hindi Translation] Google Translate failed, falling back to Groq AI:', err.message);
  }

  // Step 2: Fallback to Groq AI if Google Translate is unavailable
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return structuredData;

  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: groqApiKey });
  const translationMaps = { chapters: {}, rubrics: {} };

  try {
    const BATCH_SIZE = 25;
    for (let i = 0; i < rubricsArray.length; i += BATCH_SIZE) {
      const rubricBatch = rubricsArray.slice(i, i + BATCH_SIZE);
      const chapterBatch = (i === 0) ? chaptersArray : [];

      const prompt = `You are a medical translator. Translate to Hindi:
${chapterBatch.length > 0 ? `CHAPTERS:\n${JSON.stringify(chapterBatch, null, 2)}\n` : ''}
RUBRICS:
${JSON.stringify(rubricBatch, null, 2)}
Return JSON: {"chapters":{"EN":"HI"}, "rubrics":{"EN":"HI"}}`;

      try {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        });

        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        if (parsed.chapters) Object.assign(translationMaps.chapters, parsed.chapters);
        if (parsed.rubrics) Object.assign(translationMaps.rubrics, parsed.rubrics);
      } catch (e) {
        console.warn(`[Hindi Translation] Groq batch error: ${e.message}`);
      }
    }

    return structuredData.map(row => ({
      ...row,
      chapter_hi: row.chapter_hi || translationMaps.chapters[row.chapter_en?.trim()] || '',
      rubric_hi: row.rubric_hi || translationMaps.rubrics[row.rubric_en?.trim()] || ''
    }));

  } catch (err) {
    console.error('[Hindi Translation] Groq Fallback error:', err.message);
    return structuredData;
  }
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
  parseOcrToStructuredJson: parseImageToStructuredJson,
  translateRubricsToHindi
};
