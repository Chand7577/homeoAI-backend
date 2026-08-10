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
  'stauu': 'stann',
  'gaub': 'gamb',
  'uux-m': 'nux-m',
  'uat-c': 'nat-c',
  'uat-s': 'nat-s',
  'nnr-ac': 'nit-ac',
  'nil-ac': 'nit-ac',
  'anhlr': 'anthr',
  'ciunic': 'cimic',
  'ciniic': 'cimic',
  'crol-t': 'crot-t',
  'saug': 'sang',
  'slaph': 'staph',
  'canst': 'caust',
  'causl': 'caust',
  'nal-m': 'nat-m',
  'siu-a': 'sul-ac',
  'ran-s': 'ran-sc',
  'stamn': 'stann',
  'stamin': 'stann',
  'plas': 'plat',
  'chiin': 'chin',
  'arr': 'arn',
  'gal-c': 'gal-ac',
  'merc-i': 'merc-i-f',
  'sulp': 'sulph',
  'poïo': 'podo',
  'poio': 'podo',
  'muac': 'manc',
  'acou': 'acon',
  'alumnu': 'alumn',
  'alumu': 'alumn',
  // Page 117 & 126 confirmed OCR typos
  'lacl': 'lach',       // l/h character confusion in 'lach'
  'anil': 'anl-t',      // 'anl-t' misread as 'anil'
  'lyos': 'hyos',       // 'h' misread as 'l' in 'hyos'
  'plal': 'plat',       // 't' misread as 'l' in 'plat'
  'sulpli-ac': 'sulph-ac', // 'ph' misread as 'li' in 'sulph-ac'
  'sulpli': 'sulph',    // same ligature error without '-ac'
  'ann-c': 'am-c',      // 'm' misread as 'nn' in 'am-c'
  'viinc': 'vinc',      // double 'i' OCR typo in 'vinc'
  'strout': 'stront',   // 'n' misread as 'u' in 'stront'
  'ziuc': 'zinc',       // 'n' misread as 'u' in 'zinc'
  'rain-sc': 'ran-sc',  // 'an' misread as 'ain' in 'ran-sc'
  'chain': 'cham',      // 'm' misread as 'in' in 'cham'
  'iudg': 'indg',       // 'n' misread as 'u' in 'indg'
  'anl-t': 'anl-t',    // passthrough identity (already correct)
  'hyos': 'hyos',       // passthrough identity
  // Page 126 confirmed OCR typos and ligatures
  's-ac': 'fl-ac',
  'sccalc': 'secale',
  'abies-u': 'abies-n',
  'asc': 'æsc',
  'ath': 'æth',
  'corti': 'corn',
  'browm': 'brom',
  'cale-n': 'calc-a',
  'campli': 'camph',
  'cami-s': 'cann-s',
  'cantli': 'canth',
  'cofl': 'coff',
  'crol-t': 'crot-t',
  'lura': 'hura',
  'kali-chil': 'kali-chl',
  'kali-un': 'kali-n',
  'vine': 'vinc',
  'vera': 'verat',
  'am-in': 'am-m',
  'zines': 'zinc',
  'dulce': 'dulc',
  'silly': 'sil',
  'aruui-t': 'arum-t',
  'nag-s': 'mag-s',
  'phios': 'phos',
  'dell': 'bell',
  'alam': 'alum',
  'mun': 'alum',
  'osn': 'osm'
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

    const halfWidth = Math.floor(width * 0.60);
    const rightStart = Math.floor(width * 0.40);

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
   Do NOT skip small or short sub-rubrics (e.g. "Occiput on:", "ends at:", "lustreless:", "tangles easily:", "rising, on:", "waking, on:", "forenoon:", "noon:", "afternoon:", "evening:", "downward, outward, etc.:", "smarting:", "after:", "during menses:", "walking, while:").
   Do NOT combine sub-rubrics into their parent. Every line with a colon or qualifier MUST generate its own distinct sub-rubric entry!

2. ABSOLUTE LITERAL FIDELITY (NO HALLUCINATIONS):
   - Extract ONLY remedies that are physically printed on the page image under that exact rubric line.
   - NEVER hallucinate, guess, or add unlisted remedies (e.g. do NOT insert "cupr" or "nux-v" under "HAIR, falling" if they are not printed on that line).

3. SPATIAL VISUAL INDENTATION & HIERARCHY STACK (GENERALIZED FOR ALL PAGES):
   - LEVEL 0: MAIN CHAPTER & MAIN RUBRICS (ALL CAPS / BOLD CAPS): Headings starting at top/flush-left (e.g. "RECTUM", "PAIN", "STOOL", "COLDNESS", "ERUPTION", "HAIR", "HEAT"). Resets all sub-hierarchies. ALL MAIN RUBRICS ARE ALWAYS PRINTED IN ALL CAPS!
   - LEVEL 1: PRIMARY SUB-RUBRICS / SIBLING RUBRICS (FLUSH LEFT TO COLUMN MARGIN):
     * ANY heading or term whose text starts AT THE LEFT MARGIN of the column (not indented under a previous item) is a Level-1 Primary Sub-Rubric under the active main rubric (e.g. "HAIR - color changes", "HAIR - falling", "HAIR - Occiput on", "PAIN - smarting", "PAIN - soreness").
     * ANATOMICAL LOCATION SUB-RUBRICS UNDER SENSATIONS / MAIN HEADINGS: Anatomical locations in Title-case (e.g. "Forehead:", "Occiput on:", "Temples:", "Vertex:", "Sides:", "Brain:", "Scalp:") printed under a main rubric (like HAIR, COLDNESS, PAIN, ERUPTION) are SUB-RUBRICS of that active Main Rubric! (Target path: "HAIR - Occiput on", "COLDNESS - Forehead"). NEVER skip or treat Title-case "Occiput on:" as a top-level Main Rubric!
     * GENERALIZED MARGIN RESET RULE: Any term printed at the column's left margin IMMEDIATELY RESETS the sub-rubric stack to Level 1 under the active ALL-CAPS Main Rubric.
   - LEVEL 2+: INDENTED QUALIFIERS & SUB-MODIFIERS:
     * Lines that are physically INDENTED under a Level-1 rubric (e.g., "evening - bed, in:", "sitting, while:", "morning:", "rising, on:", "waking, on:").
     * Append these indented qualifiers sequentially to the parent Level-1 rubric path (e.g. "HEAT - morning", "HEAT - rising, on", "PAIN - pressing - evening - bed, in").

   CRITICAL (QUALIFIERS ARE MANDATORY):
   - Under a heading like "HEAT", lines starting with "morning:", "rising, on:", "waking, on:", "forenoon:", "noon:", "afternoon:", "evening:" MUST be extracted as separate sub-rubric entries ("HEAT - morning", "HEAT - rising, on", "HEAT - afternoon", etc.).

4. SUB-RUBRICS WITH PARENTHETICAL NOTES & COMPARISONS:
   - Whenever a line includes parenthetical notes or comparisons like 'smarting (compare "burning"):', e.g.:
     "smarting (compare 'burning'): Æsc., æth., aloe..."
   - You MUST extract "smarting" as a RUBRIC / SUB-RUBRIC under the parent rubric! (Target path: "PAIN - smarting").

5. QUALIFIERS BEFORE COLONS, SUB-MODIFIERS (amel., agg.) & SUB-RUBRICS ENDING IN ETC.:
   - Whenever an indented line starts with a word/phrase followed by a colon (e.g. "aged people:", "downward, outward, etc.:", "smarting:", "women:", "air, in cold:"), the text BEFORE the colon is a SUB-RUBRIC QUALIFIER.
   - MANDATORY SUB-MODIFIER INCLUSION: When a line under a rubric (like "AIR, open, in:") is indented and starts with "amel.:" or "agg.:", you MUST append "- amel." or "- agg." to the active rubric path (e.g. "AIR - open, in - amel."). NEVER drop "amel." or "agg."!

6. FULL RUBRIC PATH SYNTAX (DO NOT INCLUDE CHAPTER NAME IN RUBRIC_EN):
   Format: "MAIN RUBRIC - subrubric - subsubrubric" (DO NOT prefix with Chapter Name! Chapter is stored separately in chapter_en.)

7. COLUMN CONTINUATION HEADERS & GENERALIZED MARGIN RESET:
   - At the top of a column, a header like "PAIN, shooting." or "PAIN, pressing, evening." is a continuation header from the previous column/page.
   - UNIVERSAL MARGIN RESET RULE: As soon as any line appears whose text starts FLUSH WITH THE LEFT MARGIN of the column, it is a NEW SIBLING RUBRIC at Level 1 under the main section.

8. MEDICINES & STRICT 3-TIER CLINICAL TYPOGRAPHY GRADING (CRITICAL):
   - DO NOT DEFAULT THE FIRST REMEDY ON A LINE TO GRADE 3! Capitalization at the beginning of a line or after a colon does NOT equal Bold.
   - Inspect the visual font weight of EVERY remedy abbreviation carefully:
     * GRADE 3 = HEAVY BOLD TEXT ONLY. The letters are visibly THICKER and DARKER than surrounding text (e.g. "Sulph", "Calc", "Lyc", "Mag-c", "Crot-t", "Podo", "Caust", "Graph", "Nat-m", "Nux-v", "Puls", "Tabac", "Thuj", "Mez", "Phos", "Aur", "Lach", "Bor", "Bry", "Camph", "Verat", "Acon", "Apis").
     * GRADE 2 = ITALIC TEXT. The letters are SLANTED/OBLIQUE. Capitalized italics (e.g., "Alum.", "Am-c.", "Aloe.", "Kali-i.", "Fl-ac.", "Nit-ac.", "Glon.", "Nit-ac.") AND lowercase italics (e.g., "ambr.", "calc.", "chel.", "phos.", "psor.", "secale.", "sulph.", "graph.") MUST BE GRADED AS 2.
       --> ALL SLANTED/ITALIC TEXT MUST BE GRADED AS 2. NEVER GRADE ITALICS AS 1 OR 3!
     * GRADE 1 = PLAIN ROMAN UPRIGHT LOWERCASE. Upright, non-italic, non-bold, smaller font (e.g. "bad", "chel", "kali-c", "phos", "secale", "sars", "staph", "tabac", "tep", "ust", "vesp", "zinc").
   - TOKEN-EFFICIENT GROUPED OUTPUT: for each rubric, group remedies of the same grading into a SINGLE object, with remedy names joined by commas:
     "medicines": [
       {"name": "Æsc,Aloe,Graph", "grading": 3},
       {"name": "Ammc,Arn,Ant-c", "grading": 2},
       {"name": "bar-c,nux-v,sulph", "grading": 1}
     ]

9. STANDALONE CROSS-REFERENCES:
   - Skip ONLY lines that contain NO remedies and ONLY a cross reference. If a line contains medicines, extract the sub-rubric with all its remedies!

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

  let activeMainRubric = '';
  const ANATOMICAL_KEYWORDS = ['forehead', 'occiput', 'temples', 'vertex', 'sides', 'brain', 'scalp'];

  /**
   * Extract the bare ALL-CAPS main rubric word from a segment like
   * "COLDNESS, chilliness, etc." → "COLDNESS"
   * "PAIN" → "PAIN"
   * "pressing" → '' (not a main rubric)
   */
  const extractMainRubricWord = (segment) => {
    if (!segment) return '';
    // Take only the part before the first comma, space-followed-by-lowercase, or period
    const bare = segment.split(/[,.(]/)[0].trim();
    // Must be ALL-CAPS and at least 3 characters
    if (bare.length >= 3 && bare === bare.toUpperCase() && /^[A-Z]/.test(bare)) {
      return bare;
    }
    return '';
  };

  const addResults = (rows, detectedChapter) => {
    // Save the first valid chapter detected
    if (detectedChapter && !mainChapter) {
      mainChapter = detectedChapter.toUpperCase();
    }
    const currentChapter = mainChapter || detectedChapter || 'UNKNOWN';

    for (const group of (rows || [])) {
      let rubric_en = cleanRubricPath(group.rubric_en || '', currentChapter);
      let rubric_hi = cleanHindiRubricPath(group.rubric_hi || '', '');

      // Guardrail: Track active ALL-CAPS main rubric.
      // Use extractMainRubricWord() so qualifiers like "COLDNESS, chilliness, etc."
      // correctly resolve to "COLDNESS" instead of failing the toUpperCase() check.
      const parts = rubric_en.split(/\s*-\s*/);
      const firstPart = parts[0] ? parts[0].trim() : '';

      // Scan ALL path segments for an ALL-CAPS anchor (handles "COLDNESS - Forehead" correctly)
      let detectedMainRubric = '';
      for (const seg of parts) {
        const word = extractMainRubricWord(seg.trim());
        if (word) { detectedMainRubric = word; break; }
      }

      if (detectedMainRubric) {
        // Row contains a valid ALL-CAPS main rubric — update tracker
        activeMainRubric = detectedMainRubric;
      } else if (firstPart && activeMainRubric) {
        // Row has NO ALL-CAPS prefix — check if it starts with an anatomical location
        // (e.g. "Forehead", "Occiput") that should be attached to the active main rubric
        const firstLower = firstPart.toLowerCase();
        if (ANATOMICAL_KEYWORDS.some(k => firstLower.startsWith(k))) {
          rubric_en = `${activeMainRubric} - ${rubric_en}`;
        }
      }

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

const KENT_TERM_TRANSLATIONS = {
  // --- Chapters ---
  'RECTUM': 'मलाशय', 'MIND': 'मन', 'HEAD': 'सिर', 'EYE': 'आंख', 'EAR': 'कान', 'NOSE': 'नाक',
  'FACE': 'चेहरा', 'MOUTH': 'मुंह', 'THROAT': 'गला', 'STOMACH': 'पेट', 'ABDOMEN': 'उदर',
  'STOOL': 'मल', 'URINARY': 'मूत्र', 'GENITALIA': 'जननांग', 'RESPIRATION': 'श्वसन',
  'COUGH': 'खांसी', 'CHEST': 'छाती', 'BACK': 'पीठ', 'EXTREMITIES': 'अंग', 'SLEEP': 'नींद',
  'FEVER': 'बुखार', 'SKIN': 'त्वचा', 'GENERALITIES': 'सामान्यें',
  // --- Main Rubrics ---
  'PAIN': 'दर्द', 'CONGESTION': 'जमाव', 'CONSTRICTION': 'जकड़न', 'COLDNESS': 'ठंडापन',
  'TENSION': 'तनाव', 'CONSTRICTION, tension': 'जकड़न, तनाव',
  'FULLNESS': 'परिपूर्णता', 'EMPTINESS': 'खालीपन', 'HEAVINESS': 'भारीपन',
  'ERUPTIONS': 'दाने / चकत्ते', 'ERUPTION': 'दाने', 'HEAT': 'गर्मी', 'SWEAT': 'पसीना',
  'INFLAMMATION': 'सूजन', 'ITCHING': 'खुजली', 'NUMBNESS': 'सुन्नपन',
  'PULSATION': 'धड़कन', 'RUSH OF BLOOD': 'रक्त की तेज़ी', 'SENSITIVE': 'संवेदनशील',
  'SHOCKS': 'झटके', 'SORE': 'दुखन', 'SORENESS': 'पीड़ा', 'SPASMS': 'ऐंठन',
  'STIFFNESS': 'अकड़न', 'SWELLING': 'सूजन', 'TEARING': 'चीरने जैसा दर्द',
  'THROBBING': 'धड़कता दर्द', 'TINGLING': 'झुनझुनी', 'TWITCHING': 'फड़कना',
  'ULCERS': 'छाले', 'WEAKNESS': 'कमज़ोरी', 'WEARINESS': 'थकान',
  'HAIR': 'बाल', 'FUNGUS': 'फफूंद', 'GURGLING': 'गड़गड़ाहट',
  // --- Time / Condition modifiers ---
  'pressing': 'दबाव', 'evening': 'शाम', 'morning': 'सुबह', 'night': 'रात', 'afternoon': 'दोपहर',
  'forenoon': 'पूर्वाह्न', 'noon': 'दोपहर', 'midnight': 'आधी रात',
  'tension': 'तनाव', 'amel.': 'घटता है', 'agg.': 'बढ़ता है',
  // --- Circumstance modifiers (page 117 specific) ---
  'mental exertion, from': 'मानसिक परिश्रम, से',
  'motion, from': 'गति, से',
  'music, from': 'संगीत, से',
  'nose, on blowing': 'नाक, फूँकने पर',
  'pains, when, suddenly cease': 'दर्द, जब, अचानक बंद हो जाता है',
  'parturition, in': 'प्रसव, में',
  'perspiration, during': 'पसीना, दौरान',
  'pressure amel.': 'दबाव घटता है',
  'riding, from': 'सवारी, से',
  'rising, on': 'बढ़ना, चालू होना',
  'rising, on - amel.': 'उठना, पर - घटता है',
  'room, on entering': 'कमरा, प्रवेश करने पर',
  'room, on entering - in a hot': 'कमरा, प्रवेश करने पर - गर्मी में',
  'room, on entering - sitting in, amel.': 'कमरा, प्रवेश करने पर - अंदर बैठना, घटता है',
  'sitting, while': 'बैठना, जबकि',
  'sitting, while - must sit up': 'बैठना, जबकि - उठना चाहिए',
  'sleep, during': 'नींद, दौरान',
  'sleep, during - amel., after': 'नींद, दौरान - घटता है, बाद में',
  'smoking, from': 'धूम्रपान, से',
  'speaking, when': 'बोलना, कब',
  'speaking, when - when spoken to harshly': 'बोलना, कब - कब कठोरता से बोला जाए',
  'standing, from': 'खड़ा होना, से',
  'stepping heavily, from': 'जोर से कदम बढ़ाना, से',
  'stool, before': 'मल, पहले',
  'stool, during': 'मल, दौरान',
  'stool, after': 'मल, बाद में',
  'stooping, when': 'झुकना, जब',
  'sun, from exposure to': 'धूप के संपर्क से',
  'suppressed discharges or suddenly ceasing pains': 'दबे हुए स्राव या अचानक बंद होने वाला दर्द',
  'waking, on': 'जागने पर',
  'walking, while': 'चलना, जबकि',
  'walking, while - in open air': 'चलना, जबकि - खुली हवा में',
  'walking, while - amel.': 'चलना, जबकि - घटता है',
  'wet, from getting the feet': 'गीला होना, पैरों से',
  'wine, after': 'शराब, बाद में',
  'working, while': 'काम करना, जबकि',
  'writing, while': 'लिखना, जबकि',
  'extending to, from abdomen': 'फैलाव, उदर से',
  'extending to, from chest': 'फैलाव, छाती से',
  'extending to, from back': 'फैलाव, पीठ से',
  // --- Anatomical locations ---
  'Forehead, in': 'माथे में', 'Forehead': 'माथा',
  'Occiput': 'पश्चकपाल', 'Temples': 'कनपटी', 'Temple': 'मंदिर / कनपटी', 'Vertex': 'शीर्ष',
  'Side of head': 'सिर का किनारा', 'Brain': 'मस्तिष्क', 'Scalp': 'खोपड़ी',
  // --- General modifiers ---
  'standing, while': 'खड़े रहना, जबकि', 'lying, while': 'लेटते समय',
  'walking': 'चलना', 'flatus, during': 'पेट फूलना, दौरान', 'rest amel.': 'आराम घटता है',
  'reading, while': 'पढ़ना, जबकि', 'writing, while': 'लिखते समय',
  'talking, after, agg.': 'बात करना, बाद में, बढ़ता है',
  'sewing agg.': 'सिलाई बढ़ता है', 'siesta, after': 'नींद, बाद में',
  'sneezing, on': 'छींक, पर', 'sleep, agg. after': 'नींद, बढ़ता है बाद',
  'vertigo, during': 'चक्कर, दौरान', 'wine, after': 'शराब, बाद में',
  'motion agg.': 'गति बढ़ता है', 'pressure of hat agg.': 'टोपी का दबाव बढ़ता है',
  'room enough, as if there were not; a forcing out, washing and eating amel.': 'पर्याप्त जगह, जैसे कि थी ही नहीं; ज़बरदस्ती बाहर निकालना, धोना और खाना।',
  'stool amel.': 'मल घटता है', 'stooping, on': 'झुका हुआ, पर',
  'walking, while': 'चलना, जबकि', 'eyes, over': 'आंखें, ऊपर',
  'eyes, over - with vertigo': 'आँखें, ऊपर - चक्कर के साथ',
  'nose, over, evening': 'नाक, ऊपर, शाम',
  'sitting, while - up agg.': 'बैठना, जबकि - ऊपर की ओर।',
  'stool, when straining at': 'मल, जब तनाव हो',
  'stool, when straining at - amel. after': 'मल, जब तनाव हो - घटता है बाद',
  'Occiput - evening, in': 'पश्च भाग - शाम, अंदर',
  'Occiput - walking in open air': 'पश्च भाग - खुली हवा में चलना',
  'Occiput - coughing, on': 'पश्चकपाल - खाँसना, पर',
  'Vertex - evening': 'शिखर - संध्या', 'Vertex - reading, while': 'शीर्ष - पढ़ना, जबकि',
  'Vertex - sitting up agg.': 'शीर्ष - ऊपर बैठना बढ़ता है', 'Vertex - stooping': 'शीर्ष - झुका हुआ',
  'closing eyes amel.': 'आंखें बंद करना घटता है',
  'baldness': 'गंजापन', 'patches': 'धब्बे', 'young people': 'युवा लोग',
  'bristling': 'खड़े होना', 'brittleness': 'भुरभुरापन',
  'smarting': 'टीसदार जलन', 'smarting (compare "burning")': 'टीसदार जलन (जलन से तुलना करें)',
  'soreness': 'दुखन / पीड़ा', 'shooting': 'चुभने जैसा दर्द', 'rawness': 'कच्चापन',
  'rasping': 'कर्कशता / छीलने जैसा', 'scraping': 'खुरचना', 'stool, hard, during': 'मल, कठोर, दौरान',
  'diarrhœa, during': 'दस्त, दौरान', 'bed, in': 'बिस्तर, अंदर', 'as in a': 'जैसे कि', 'not for': 'मल, के लिए नहीं',
  'moving, after': 'हिलना, बाद में',
  'menses, during': 'मासिक धर्म के दौरान', 'menses, before': 'मासिक धर्म, पहले'
};

const ensureHindiTranslation = (enText, currentHi) => {
  // Accept existing Hindi ONLY if it contains Devanagari AND has no leftover ASCII letters
  // (avoids accepting half-translated strings like "सिर - परिपूर्णता - motion agg.")
  if (
    currentHi &&
    /[\u0900-\u097F]/.test(currentHi) &&
    !/[a-zA-Z]/.test(currentHi)
  ) {
    return currentHi;
  }
  if (!enText) return '';
  const parts = enText.split(/\s*-\s*/);
  const hiParts = parts.map(part => {
    const trimmed = part.trim();
    // Direct dictionary lookup (case-sensitive first, then case-insensitive)
    if (KENT_TERM_TRANSLATIONS[trimmed]) return KENT_TERM_TRANSLATIONS[trimmed];
    const lower = trimmed.toLowerCase();
    if (KENT_TERM_TRANSLATIONS[lower]) return KENT_TERM_TRANSLATIONS[lower];
    // Try suffix matching for compound modifiers like "motion agg."
    for (const [key, val] of Object.entries(KENT_TERM_TRANSLATIONS)) {
      if (key.toLowerCase() === lower) return val;
    }
    return trimmed;
  });
  return hiParts.join(' - ');
};

/**
 * High-performance Hindi Translation Service.
 * Uses Google Translate Free GTX Engine (0 cost, ultra-fast ~500ms) with Groq LLM fallback & Repertory Dictionary.
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

  let chapterResults = {};
  let rubricResults = {};

  // Step 1: Try Free Google Translate API first (per-item so one failure doesn't drop the batch)
  try {
    // Use allSettled so a single item failure doesn't abort the whole batch
    const chapterSettled = await Promise.allSettled(
      chaptersArray.map(ch => googleTranslateSingle(ch).then(res => [ch, res]))
    );
    const rubricSettled = await Promise.allSettled(
      rubricsArray.map(rub => googleTranslateSingle(rub).then(res => [rub, res]))
    );

    for (const result of chapterSettled) {
      if (result.status === 'fulfilled') {
        const [key, val] = result.value;
        chapterResults[key] = val;
      }
    }
    for (const result of rubricSettled) {
      if (result.status === 'fulfilled') {
        const [key, val] = result.value;
        // Only accept result if it's fully in Hindi (no leftover ASCII letters)
        if (val && !/[a-zA-Z]/.test(val)) {
          rubricResults[key] = val;
        } else if (val && /[\u0900-\u097F]/.test(val)) {
          // Partial Hindi — still better than nothing, keep it for now
          rubricResults[key] = val;
        }
      }
    }

    const duration = Date.now() - startTime;
    const gtSuccessCount = Object.keys(chapterResults).length + Object.keys(rubricResults).length;
    console.log(`[Hindi Translation] ✅ Google Translate completed ${gtSuccessCount}/${chaptersArray.length + rubricsArray.length} items in ${duration}ms!`);
  } catch (err) {
    console.warn('[Hindi Translation] Google Translate batch error, will use Groq fallback:', err.message);
  }

  // Step 2: Fallback to Groq AI if needed
  const groqApiKey = process.env.GROQ_API_KEY;
  if (groqApiKey && Object.keys(rubricResults).length < rubricsArray.length) {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: groqApiKey });

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
          if (parsed.chapters) Object.assign(chapterResults, parsed.chapters);
          if (parsed.rubrics) Object.assign(rubricResults, parsed.rubrics);
        } catch (e) {
          console.warn(`[Hindi Translation] Groq batch error: ${e.message}`);
        }
      }
    } catch (err) {
      console.error('[Hindi Translation] Groq Fallback error:', err.message);
    }
  }

  // Step 3: Map results & apply Kent Repertory Dictionary Fallback to eliminate ANY English in Hindi column
  return structuredData.map(row => {
    const rawChapHi = row.chapter_hi || chapterResults[row.chapter_en?.trim()] || '';
    const rawRubHi = row.rubric_hi || rubricResults[row.rubric_en?.trim()] || '';

    const finalChapHi = ensureHindiTranslation(row.chapter_en, rawChapHi);
    const finalRubHi = ensureHindiTranslation(row.rubric_en, rawRubHi);

    return {
      ...row,
      chapter_hi: finalChapHi,
      rubric_hi: finalRubHi
    };
  });
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