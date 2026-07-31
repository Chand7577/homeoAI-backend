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
  'an-m': 'am-m',
  'ani-c': 'am-c',
  'an-c': 'am-c',
  'anbr': 'ambr',
  'aur-u': 'aur-m',
  'nice': 'nicc',
  'xant': 'xantlt',
  'xant-l': 'xantlt',
  'mercy-c': 'merc-c',
  'merc-cy': 'merc-c',
  'merc-y': 'merc-c',
  'clan': 'cham',
  'claun': 'cham',
  'clam': 'cham',
  'grath': 'graph',
  'coc-t': 'cocc',
  'coee': 'cocc',
  'aesc': 'æsc',
  'aesc-h': 'æsc',
  'csc': 'æsc',
  'alun': 'alum',
  'aiun': 'alum',
  'alnm': 'alum',
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
  'crot-h': 'crot-h',
  'aut-l': 'aur-m-n',
  'colt': 'coll',
  'eth': 'æth',
  'caus-s': 'cann-s',
  'canu-s': 'cann-s',
  'miez': 'mez',
  'rars': 'sars',
  'stroit': 'stront',
  'phy': 'phyt',
  'gratt': 'grat',
  'chiel': 'chel',
  'muer-ac': 'mur-ac',
  'mure-ac': 'mur-ac',
  'lo-bi': 'lob',
  'auac': 'anac',
  'direc': 'dirc',
  'an-m': 'am-m',
  'stauu': 'stann',
  'gaub': 'gamb',
  'uux-m': 'nux-m',
  'uat-c': 'nat-c',
  'uat-s': 'nat-s',
  'nnr-ac': 'nit-ac',
  'nil-ac': 'nit-ac',
  'anhlr': 'anthr',
  'ciunic': 'cimic',
  'crol-t': 'crot-t',
  'saug': 'sang',
  'slaph': 'staph',
  'canst': 'caust'
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

    const halfWidth = Math.floor(width * 0.55);
    const rightStart = Math.floor(width * 0.45);

    await sharp(imagePath)
      .extract({ left: 0, top: 0, width: halfWidth, height })
      .jpeg({ quality: 95 })
      .toFile(leftCropPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height })
      .jpeg({ quality: 95 })
      .toFile(rightCropPath);

    return {
      leftCropPath,
      rightCropPath,
      cleanup: () => {
        try { if (fs.existsSync(leftCropPath)) fs.unlinkSync(leftCropPath); } catch (_) { }
        try { if (fs.existsSync(rightCropPath)) fs.unlinkSync(rightCropPath); } catch (_) { }
      }
    };
  } catch (err) {
    console.warn(`[Kent AI Parser] Sharp column crop warning: ${err.message}`);
    return { leftCropPath: imagePath, rightCropPath: imagePath, cleanup: () => { } };
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
 * NOTE: now returns { data, wasRepaired } so callers can tell when truncation
 * repair kicked in (which means rows were likely silently dropped).
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
    return { data: JSON.parse(text), wasRepaired: false };
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
        const droppedChars = repaired.length - cutPos;
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

        const parsed = JSON.parse(repaired);
        // IMPORTANT: this is the case that was silently swallowing left-column
        // rows. If we had to cut characters off the end to get valid JSON,
        // the model's response was truncated (almost always maxOutputTokens
        // being hit) and everything after the last complete rubric group was
        // lost. Surface that loudly instead of pretending it's fine.
        console.warn(
          `[Kent AI Parser] ⚠️ JSON was TRUNCATED and repaired. ` +
          `Dropped ~${droppedChars} trailing chars of the raw response — ` +
          `this almost always means the model hit its output token limit ` +
          `mid-column. Any rubrics after the last complete one were lost. ` +
          `Raw response length was ${rawText.length} chars.`
        );
        return { data: parsed, wasRepaired: true };
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
 * @returns {Promise<{text: string, finishReason: string}>}
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
  const columnInstruction = 'PROCESS THE FULL IMAGE: This image is a single vertical column from Kent\'s Repertory. (Note for Right Column / Column 2: Main Rubrics in ALL-CAPS start at the left edge of this column near the book\'s center divider line. Any flush-left ALL-CAPS heading in this column is a NEW MAIN RUBRIC that resets the rubric stack!)';

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
   Extract EVERY SINGLE rubric and EVERY SINGLE remedy listed from top to bottom of this column image.
   Do NOT skip small sub-rubrics (e.g. "difficult stool", "after:", "during menses:", "walking, while:", "extending to:", "tenesmus:").
   Do NOT combine sub-rubrics into their parent. Every line with a colon or qualifier MUST generate its own distinct sub-rubric entry!

2. TYPOGRAPHY & INDENTATION STACK:
   - MAIN RUBRICS (ALL CAPS / BOLD CAPS & SYNONYMS): Flush left headings starting with ALL-CAPS (e.g., "DIARRHŒA.", "CONSTIPATION", "PAIN"). Resets sub-rubric stack.
   - PRIMARY SUB-RUBRICS (SMALL / LOWERCASE INDENTED LEVEL 1): Printed in small/lowercase letters indented under main rubric (e.g., "aged people:", "burns, after:", "cabbage, after:", "children, in:").
   - SECONDARY QUALIFIERS / SUB-SUB-RUBRICS (LEVEL 2 INDENTED): Further indented qualifiers under a primary sub-rubric (e.g. under "breakfast:", "amel.: Bov., nat-s." -> "DIARRHŒA - breakfast - amel.").

   CRITICAL (SUB-RUBRIC IS MANDATORY):
   - Under a main heading like "DIARRHŒA.", every indented line starting with a lowercase qualifier (e.g. "aged people: Ant-c., Ars...") MUST include "aged people" as a sub-rubric! Output: "DIARRHŒA - aged people".
   - NEVER drop the qualifier "aged people" and attach remedies directly to "DIARRHŒA"!

3. SUB-RUBRICS WITH PARENTHETICAL NOTES & COMPARISONS:
   - Whenever an indented sub-rubric line includes parenthetical notes or comparisons like 'smarting (compare "burning"):', e.g.:
     "smarting (compare 'burning'): Æsc., æth., aloe..."
   - You MUST extract "smarting" as a SUB-RUBRIC under the parent rubric! (Target path: "PAIN - shooting - smarting").
   - NEVER drop the sub-rubric title "smarting" and dump remedies directly into "PAIN, shooting"!
   - STRIP parenthetical notes like "(compare ...)" or "(see ...)" from the rubric title if appropriate, but ALWAYS preserve the main sub-rubric term ("smarting", "difficult stool").

4. QUALIFIERS BEFORE COLONS & SUB-RUBRICS ENDING IN ETC.:
   - Whenever an indented line starts with a word/phrase followed by a colon (e.g. "aged people:", "downward, outward, etc.:", "smarting:", "women:", "air, in cold:"), the text BEFORE the colon is a SUB-RUBRIC QUALIFIER.
   - You MUST append that qualifier to the parent rubric path!
   - Examples under "PAIN, pressing, evening.":
     - Line "bed, in: Iod." -> "PAIN - pressing - evening - bed, in"
     - Line "sitting, while: Calc., chin-s." -> "PAIN - pressing - evening - sitting, while"
     - Line "downward, outward, etc.: Agar, aloe..." -> "PAIN - pressing - evening - downward, outward, etc."
   - Examples under "PAIN, shooting.":
     - Line "smarting (compare 'burning'): Æsc., æth..." -> "PAIN - shooting - smarting"
     - Line "soreness: Æsc., agn..." -> "PAIN - shooting - soreness"
   - NEVER drop qualifiers like "downward, outward, etc.", "bed, in", "sitting, while", "smarting"!

5. FULL RUBRIC PATH SYNTAX (DO NOT INCLUDE CHAPTER NAME IN RUBRIC_EN):
   Format: "MAIN RUBRIC - subrubric - subsubrubric" (DO NOT prefix with Chapter Name! Chapter is stored separately in chapter_en.)
   Examples:
     - Line "DIARRHŒA." followed by "aged people: Ant-c., Ars..." -> "rubric_en": "DIARRHŒA - aged people"
     - Line "DIARRHŒA." followed by "women: Kreos., nat-s." -> "rubric_en": "DIARRHŒA - women"
     - Line "DIARRHŒA." followed by "air, in cold: Nat-s., sil." -> "rubric_en": "DIARRHŒA - air, in cold"

6. COLUMN CONTINUATION HEADERS AT TOP OF COLUMN (CRITICAL FIX FOR CONTINUATION CONTAMINATION):
   - At the top of a column, a header like "DIARRHŒA, breakfast." means:
     - MAIN RUBRIC is "DIARRHŒA".
     - Active sub-rubric continuing from the previous column is "breakfast".
   - Lines indented DEEPER under "breakfast" (e.g. "amel.: Bov., nat-s., tromb.") belong to "DIARRHŒA - breakfast - amel.".
   - IMPORTANT (SUB-RUBRIC LEVEL RESET): As soon as a line appears at the PRIMARY sub-rubric indent level (e.g. "burns, after: Ars.", "cabbage, after: Bry.", "children, in: Acon."), it is a NEW primary sub-rubric under "DIARRHŒA"!
   - You MUST RESET the sub-rubric stack back to "DIARRHŒA"! Output:
     - "DIARRHŒA - burns, after"
     - "DIARRHŒA - cabbage, after"
     - "DIARRHŒA - children, in"
   - DO NOT lock the whole column under "DIARRHŒA - breakfast"! "breakfast" ONLY applies to lines indented under it.

7. MEDICINES & CLINICAL TYPOGRAPHY GRADING — TOKEN-EFFICIENT GROUPED OUTPUT (CRITICAL):
   - Capture every remedy abbreviation on every line. Clean off trailing periods.
   - Grade each remedy by its typography: BOLD ALL CAPS or BOLD = grading 3, ITALIC = grading 2, NORMAL ROMAN = grading 1.
   - DO NOT output one JSON object per remedy. That format burns output tokens fast and causes the response to hit the token limit and truncate partway through a long column, silently losing every rubric after the cutoff.
   - INSTEAD: for each rubric, group all remedies of the same grading into a SINGLE object, with the remedy names joined by commas in one "name" string. Emit at most 3 objects per rubric (one per grading level that is actually present).
   - Example — a rubric with remedies "Æsc.(bold), agar., all-c., Alum.(bold), am-c., Am-m.(bold)" must be emitted as:
     "medicines": [
       {"name": "Æsc,Alum,Am-m", "grading": 3},
       {"name": "agar,all-c,am-c", "grading": 1}
     ]
     NOT as six separate {"name": "...", "grading": ...} objects.
   - This grouped format is REQUIRED for every single rubric in this column, especially long ones like "difficult stool" that may list 80+ remedies — grouping keeps the whole column well within the output budget.

8. STANDALONE CROSS-REFERENCES:
   - Skip ONLY lines that contain NO remedies and ONLY a cross reference, e.g. "slips back, stool: (See under 'difficult')". If a line contains medicines (e.g. "difficult stool (see 'Inactivity'): Æsc., agar..."), extract the sub-rubric "difficult stool" with all its remedies!

--- OUTPUT FORMAT ---
Return ONLY valid JSON matching this structure (no markdown, no preamble). Remember: group remedies by grading tier per rubric as shown — do not emit one object per remedy.
{
  "chapter_en": "DETECTED_CHAPTER_NAME",
  "data": [
    {
      "rubric_en": "MAIN RUBRIC - SUBRUBRIC - QUALIFIER",
      "medicines": [
        {"name": "remedy_abbrev1,remedy_abbrev2,...", "grading": 3},
        {"name": "remedy_abbrev3,remedy_abbrev4,...", "grading": 1}
      ]
    }
  ]
}`;

  // NOTE: raised from 16000 -> 32000. Even with the token-efficient grouped
  // medicines format above, dense columns (e.g. a "difficult stool" rubric
  // with 80+ remedies plus a dozen more rubrics below it) can still be long.
  // Check your model's actual max output token ceiling and raise this to that
  // ceiling if 32000 is not high enough / not supported.
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType } }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 32000,
      responseMimeType: 'application/json'
    }
  });

  const response = result.response;
  const text = await response.text();

  // Surface truncation at the source, not just when JSON parsing later fails.
  // Gemini-style SDKs expose this on response.candidates[0].finishReason.
  let finishReason = 'UNKNOWN';
  try {
    finishReason = response?.candidates?.[0]?.finishReason || 'UNKNOWN';
  } catch (_) { /* ignore - some SDK versions may not expose this */ }

  if (finishReason === 'MAX_TOKENS') {
    console.warn(
      `[Kent AI Parser] ⚠️ Model stopped due to MAX_TOKENS on a "${columnHint}" pass. ` +
      `Response length was ${text.length} chars. Content after this point was NOT generated ` +
      `(this is a hard cutoff, not something repairAndParseJson can recover — increase ` +
      `maxOutputTokens or split the column crop further).`
    );
  }

  return { text, finishReason };
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

  const cleanRubricPath = (rubricStr, chapterName) => {
    if (!rubricStr) return '';
    let clean = rubricStr.trim();
    if (chapterName) {
      const chapRegex = new RegExp(`^${chapterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
      clean = clean.replace(chapRegex, '');
    }
    clean = clean.replace(/^(?:\[CHAPTER\]|CHAPTER|[A-Z]{3,})\s*-\s*/i, (match) => {
      const prefix = match.replace(/\s*-\s*$/, '').trim().toUpperCase();
      const KNOWN_CHAPTERS = ['RECTUM', 'MIND', 'HEAD', 'EYE', 'EAR', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 'STOMACH', 'ABDOMEN', 'STOOL', 'URINARY', 'GENITALIA', 'RESPIRATION', 'COUGH', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'FEVER', 'SKIN', 'GENERALITIES', 'CHAPTER', '[CHAPTER]'];
      if (KNOWN_CHAPTERS.includes(prefix)) {
        return '';
      }
      return match;
    });
    return clean.trim();
  };

  const cleanHindiRubricPath = (rubricStr, chapterHindi) => {
    if (!rubricStr) return '';
    let clean = rubricStr.trim();
    if (chapterHindi) {
      const chapRegex = new RegExp(`^${chapterHindi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
      clean = clean.replace(chapRegex, '');
    }
    clean = clean.replace(/^(?:मलाशय|मन|सिर|आंख|कान|नाक|चेहरा|मुंह|गला|पेट|उदर|मल|मूत्र|जननांग|श्वसन|खांसी|छाती|पीठ|अंग|नींद|बुखार|त्वचा|सामान्यएं)\s*-\s*/i, '');
    return clean.trim();
  };

  const addResults = (rows, detectedChapter) => {
    // Save the first valid chapter detected
    if (detectedChapter && !mainChapter) {
      mainChapter = detectedChapter.toUpperCase();
    }
    const currentChapter = mainChapter || detectedChapter || 'UNKNOWN';

    for (const group of (rows || [])) {
      const rubric_en = cleanRubricPath(group.rubric_en || '', currentChapter);
      const rubric_hi = cleanHindiRubricPath(group.rubric_hi || '', '');

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
            rubric_hi: rubric_hi,
            medicine: cleanMed,
            grading: group.grading || 1
          });
        }
        continue;
      }

      // Handle token-efficient grouped format (one object per grading tier,
      // "name" is a comma-separated list of remedies at that grading)
      for (const medObj of (group.medicines || [])) {
        const medField = (medObj.name || '').trim();
        const meds = medField.includes(',')
          ? medField.split(',').map(m => m.trim()).filter(Boolean)
          : medField ? [medField] : [];

        for (const med of meds) {
          // If OCR merged two remedy names without a comma (e.g. "ruta sang"), split them
          const subMeds = (med.includes(' ') && !med.includes('-'))
            ? med.split(/\s+/).map(m => m.trim()).filter(Boolean)
            : [med];

          for (const sMed of subMeds) {
            const cleanMed = cleanAndCorrectMedicine(sMed);
            if (!cleanMed) continue;
            const key = `${rubric_en}|||${cleanMed}`.toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              allResults.push({
                chapter_en: currentChapter,
                chapter_hi: '',
                rubric_en: rubric_en,
                rubric_hi: rubric_hi,
                medicine: cleanMed,
                grading: medObj.grading || 1
              });
            }
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
      const { text: leftResponse, finishReason: leftFinishReason } = await extractColumnPass(leftCropPath, 'left');
      console.log(`[Kent AI Parser] Left column response: ${leftResponse.length} chars, finishReason=${leftFinishReason}`);
      console.log(`[Kent AI Parser] Left response preview: ${leftResponse.substring(0, 200)}`);
      const { data: leftParsed, wasRepaired: leftWasRepaired } = repairAndParseJson(leftResponse);
      const { data: leftData, chapter: leftChapter } = extractDataArray(leftParsed);
      console.log(`[Kent AI Parser] Left column parsed: ${leftData.length} groups, chapter="${leftChapter}", truncated=${leftWasRepaired || leftFinishReason === 'MAX_TOKENS'}`);
      addResults(leftData, leftChapter);
      console.log(`[Kent AI Parser] Left column: ${allResults.length} rows so far`);

      // If the left pass was truncated, one retry with a "keep it grouped and
      // compact" nudge is cheap insurance before falling back to the full-page pass.
      if ((leftWasRepaired || leftFinishReason === 'MAX_TOKENS')) {
        console.warn('[Kent AI Parser] Left column was truncated — this WILL cause missing rubrics unless the full-page fallback recovers them.');
      }
    } catch (e) {
      console.error('[Kent AI Parser] Left column pass failed:', e.message);
    }

    // Delay between passes to respect rate limits
    await new Promise(r => setTimeout(r, 2000));

    // Pass 2: Right column crop — pass the clean parent rubric context from left pass
    let lastRubricFromLeft = '';
    if (allResults.length > 0) {
      const fullPath = allResults[allResults.length - 1].rubric_en || '';
      const parts = fullPath.split(' - ');
      lastRubricFromLeft = parts.slice(0, Math.min(3, parts.length)).join(' - ');
    }
    const leftRowCount = allResults.length;
    let rightAttempts = 0;
    const maxRetries = 2;

    while (rightAttempts < maxRetries) {
      rightAttempts++;
      try {
        console.log(`[Kent AI Parser] Pass 2 (attempt ${rightAttempts}): Extracting RIGHT column crop...`);
        console.log(`[Kent AI Parser] Passing last rubric context: "${lastRubricFromLeft}"`);
        const { text: rightResponse, finishReason: rightFinishReason } = await extractColumnPass(rightCropPath, 'right', lastRubricFromLeft);
        console.log(`[Kent AI Parser] Right column response: ${rightResponse.length} chars, finishReason=${rightFinishReason}`);
        console.log(`[Kent AI Parser] Right response preview: ${rightResponse.substring(0, 300)}`);

        const { data: rightParsed } = repairAndParseJson(rightResponse);
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
        const { text: fullResponse, finishReason: fullFinishReason } = await extractColumnPass(imagePath, 'all', lastRubricFromLeft);
        console.log(`[Kent AI Parser] Full page response: ${fullResponse.length} chars, finishReason=${fullFinishReason}`);
        const { data: fullParsed } = repairAndParseJson(fullResponse);
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