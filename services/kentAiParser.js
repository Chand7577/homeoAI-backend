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
  'ann-c': 'am-c',
  // Page 156 additional OCR artifacts identified in audit
  'calc-a': 'calc-ac',
  'nuv': 'nux-v',
  'plhos-ac': 'phos-ac',
  'rhod': 'rhodo',
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
  // Page 126 & long-tail OCR typos
  'osim': 'osm',
  'viinc': 'vinc',
  'arun-t': 'arum-t',
  'strout': 'stront',
  'lacl': 'lach',       // l/h character confusion in 'lach'
  'anil': 'anl-t',      // 'anl-t' misread as 'anil'
  'lyos': 'hyos',       // 'h' misread as 'l' in 'hyos'
  'plal': 'plat',       // 't' misread as 'l' in 'plat'
  'sulpli-ac': 'sulph-ac', // 'ph' misread as 'li' in 'sulph-ac'
  'sulpli': 'sulph',    // same ligature error without '-ac'
  'anl-t': 'anl-t',    // passthrough identity (already correct)
  'hyos': 'hyos',       // passthrough identity
  // Page 126 additional OCR artifacts identified in audit
  'ziuc': 'zinc',       // 'n' misread as 'u', 'c' appended wrongly
  'curl': 'carl',       // 'Carl' (Carlsbad) misread as 'Curl'
  'chain': 'chin',      // 'chin' misread as 'chain'
  'kalin': 'kalm',      // 'Kalmia' OCR artifact
  'iudg': 'indg',       // 'indg' misread as 'iudg'
  'pectin': 'pectin',   // passthrough — valid if truly 'pectin'
  'arumd': 'arum-t',   // 'arum-t' without hyphen
  'ferr-m': 'ferr-m',  // passthrough — already correct
  'nuph': 'nuph',       // passthrough — Nuphar luteum
  'nal-m': 'nat-m',     // 'nat-m' misread as 'nal-m'
  'ann-c': 'am-c',      // 'am-c' misread as 'ann-c'
  'ann-c': 'am-c'
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

    const tlCropPath = path.join(dir, `${base}_ai_tl${ext}`);
    const blCropPath = path.join(dir, `${base}_ai_bl${ext}`);
    const trCropPath = path.join(dir, `${base}_ai_tr${ext}`);
    const brCropPath = path.join(dir, `${base}_ai_br${ext}`);

    const halfWidth = Math.floor(width * 0.55);
    const rightStart = Math.floor(width * 0.45);
    const halfHeight = Math.floor(height * 0.55);
    const bottomStart = Math.floor(height * 0.45);

    await sharp(imagePath)
      .extract({ left: 0, top: 0, width: halfWidth, height: halfHeight })
      .jpeg({ quality: 95 })
      .toFile(tlCropPath);

    await sharp(imagePath)
      .extract({ left: 0, top: bottomStart, width: halfWidth, height: height - bottomStart })
      .jpeg({ quality: 95 })
      .toFile(blCropPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height: halfHeight })
      .jpeg({ quality: 95 })
      .toFile(trCropPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: bottomStart, width: width - rightStart, height: height - bottomStart })
      .jpeg({ quality: 95 })
      .toFile(brCropPath);

    return {
      quadrants: [
        { path: tlCropPath, hint: 'top-left' },
        { path: blCropPath, hint: 'bottom-left' },
        { path: trCropPath, hint: 'top-right' },
        { path: brCropPath, hint: 'bottom-right' }
      ],
      leftCropPath: tlCropPath,
      rightCropPath: trCropPath,
      cleanup: () => {
        [tlCropPath, blCropPath, trCropPath, brCropPath].forEach(p => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { }
        });
      }
    };
  } catch (err) {
    console.warn(`[Kent AI Parser] Sharp quadrant crop warning: ${err.message}`);
    return {
      quadrants: [{ path: imagePath, hint: 'all' }],
      leftCropPath: imagePath,
      rightCropPath: imagePath,
      cleanup: () => { }
    };
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
   Do NOT skip small sub-rubrics (e.g. "downward, outward, etc.:", "smarting:", "difficult stool", "after:", "during menses:", "walking, while:", "extending to:", "tenesmus:").
   Do NOT combine sub-rubrics into their parent. Every line with a colon or qualifier MUST generate its own distinct sub-rubric entry!

2. SPATIAL VISUAL INDENTATION & HIERARCHY STACK (GENERALIZED FOR ALL PAGES):
   - LEVEL 0: MAIN CHAPTER & MAIN RUBRICS (ALL CAPS / BOLD CAPS): Headings starting at top/flush-left (e.g. "RECTUM", "PAIN", "STOOL", "COLDNESS", "ERUPTION"). Resets all sub-hierarchies. ALL MAIN RUBRICS ARE ALWAYS PRINTED IN ALL CAPS!
   - LEVEL 1: PRIMARY SUB-RUBRICS / SIBLING RUBRICS (FLUSH LEFT TO COLUMN MARGIN):
     * ANY heading or term whose text starts AT THE LEFT MARGIN of the column (not indented under a previous item) is a Level-1 Primary Sub-Rubric under the active main rubric (e.g. "PAIN - smarting", "PAIN - soreness", "PAIN - pressing", "COLDNESS - air, as from cold").
     * ANATOMICAL LOCATION SUB-RUBRICS UNDER SENSATIONS: Anatomical locations in Title-case (e.g. "Forehead:", "Occiput:", "Temples:", "Vertex:", "Sides:", "Brain:", "Scalp:") printed under a main rubric (like COLDNESS, PAIN, ERUPTION, EMPTY, ENLARGED) are SUB-RUBRICS of that active Main Rubric! (Target path: "COLDNESS - Forehead", and sub-items under it: "COLDNESS - Forehead - morning", "COLDNESS - Forehead - air, as from a draft"). NEVER treat Title-case "Forehead:" as a top-level Main Rubric!
     * GENERALIZED MARGIN RESET RULE: Any term printed at the column's left margin IMMEDIATELY RESETS the sub-rubric stack to Level 1 under the active ALL-CAPS Main Rubric.
   - LEVEL 2+: INDENTED QUALIFIERS & SUB-MODIFIERS:
     * Lines that are physically INDENTED under a Level-1 rubric (e.g., "evening - bed, in:", "sitting, while:", "morning:").
     * Append these indented qualifiers sequentially to the parent Level-1 rubric path (e.g. "PAIN - pressing - evening - bed, in", "COLDNESS - Forehead - morning").

   CRITICAL (QUALIFIERS ARE MANDATORY):
   - Under a heading like "PAIN, pressing, evening.", a line starting with "downward, outward, etc.: Agar, aloe..." MUST include "downward, outward, etc." as a sub-rubric! Target path: "PAIN - pressing - evening - downward, outward, etc.".
   - NEVER drop "downward, outward, etc." and attach remedies directly to "PAIN - pressing - evening"!

3. SUB-RUBRICS WITH PARENTHETICAL NOTES & COMPARISONS:
   - Whenever a line includes parenthetical notes or comparisons like 'smarting (compare "burning"):', e.g.:
     "smarting (compare 'burning'): Æsc., æth., aloe..."
   - You MUST extract "smarting" as a RUBRIC / SUB-RUBRIC under the parent rubric! (Target path: "PAIN - smarting").
   - NEVER drop the rubric title "smarting" and dump remedies into a previous header like "PAIN - shooting"!

4. QUALIFIERS BEFORE COLONS, SUB-MODIFIERS (amel., agg.) & SUB-RUBRICS ENDING IN ETC.:
   - Whenever an indented line starts with a word/phrase followed by a colon (e.g. "aged people:", "downward, outward, etc.:", "smarting:", "women:", "air, in cold:"), the text BEFORE the colon is a SUB-RUBRIC QUALIFIER.
   - MANDATORY SUB-MODIFIER INCLUSION: When a line under a rubric (like "AIR, open, in:") is indented and starts with "amel.:" or "agg.:", you MUST append "- amel." or "- agg." to the active rubric path (e.g. "AIR - open, in - amel."). NEVER drop "amel." or "agg."!
   - You MUST append that qualifier to the parent rubric path!
   - Examples under "PAIN, pressing, evening.":
     - Line "bed, in: Iod." -> "PAIN - pressing - evening - bed, in"
     - Line "sitting, while: Calc., chin-s." -> "PAIN - pressing - evening - sitting, while"
     - Line "downward, outward, etc.: Agar, aloe..." -> "PAIN - pressing - evening - downward, outward, etc."
   - Examples under "AIR, open, in:":
     - Line indented "amel.: Æth., am-m., caust..." -> "AIR - open, in - amel."
   - Examples under "PAIN":
     - Line "smarting (compare 'burning'): Æsc., æth..." -> "PAIN - smarting"
     - Line "soreness: Æsc., agn..." -> "PAIN - soreness"
     - Line "soreness:" followed by indented "morning: Thuj." -> "PAIN - soreness - morning"
   - NEVER drop qualifiers like "amel.", "agg.", "downward, outward, etc.", "bed, in", "sitting, while", "smarting"!

5. FULL RUBRIC PATH SYNTAX (DO NOT INCLUDE CHAPTER NAME IN RUBRIC_EN):
   Format: "MAIN RUBRIC - subrubric - subsubrubric" (DO NOT prefix with Chapter Name! Chapter is stored separately in chapter_en.)

6. COLUMN CONTINUATION HEADERS & GENERALIZED MARGIN RESET (PREVENT CONTINUATION CONTAMINATION):
   - At the top of a column, a header like "PAIN, shooting." or "PAIN, pressing, evening." is a continuation header from the previous column/page.
   - Continuation headers ONLY apply to items physically INDENTED beneath them (e.g. "evening: Sulph.", "itching: Sulph.", "extending to penis: Carl.").
   - UNIVERSAL MARGIN RESET RULE: As soon as any line appears whose text starts FLUSH WITH THE LEFT MARGIN of the column (e.g., "smarting", "soreness", "rasping", "rawness", "scraping"), it is a NEW SIBLING RUBRIC at Level 1 under the main section (e.g., "PAIN - smarting", "PAIN - soreness").
   - Immediately reset the active path to "MAIN_RUBRIC - <flush_left_rubric_name>"! NEVER nest a flush-left rubric as a sub-item of a continuation header!
   - Example output when "soreness:" appears flush left:
     - Line "soreness: Æsc..." -> "PAIN - soreness"
     - Line indented "morning: Thuj." -> "PAIN - soreness - morning" (NOT "PAIN - shooting - soreness - morning"!)
     - Line indented "sitting, while: Mag-c." -> "PAIN - soreness - sitting, while"

7. MEDICINES & STRICT 3-TIER CLINICAL TYPOGRAPHY GRADING (CRITICAL):
   - DO NOT DEFAULT THE FIRST REMEDY ON A LINE TO GRADE 3! Capitalization at the beginning of a line or after a colon does NOT equal Bold.
   - Inspect the visual font weight of EVERY remedy abbreviation carefully:
     * GRADE 3 = HEAVY BOLD TEXT ONLY. The letters are visibly THICKER and DARKER than surrounding text. Example bold remedies in Kent: "Sulph", "Calc", "Lyc", "Mag-c", "Crot-t", "Podo", "Caust", "Graph", "Nat-m", "Nux-v", "Puls", "Tabac". If unsure whether a remedy is Bold or Italic, prefer Grade 2 over Grade 3.
     * GRADE 2 = ITALIC TEXT. The letters are SLANTED/OBLIQUE. Italics can be CAPITALIZED ("Agar", "Glon", "Ambr", "Nit-ac", "Cimic", "Aur", "Thuj", "Camph", "Grat", "Eug", "Ol-an", "Apis", "Lac-ac", "Aloe", "Ign", "Kali-c", "Bar-c", "Lach", "Ox-ac", "Absin", "Chel") OR lowercase-italic ("agar", "apis", "arn", "ars", "calc", "carb-v", "dios", "hep", "kali-bi", "lil-t", "mur-ac", "phos", "rhus-t", "sep", "sul-ac", "thuj").
       --> CRITICAL MANDATE: ALL SLANTED/ITALIC TEXT — WHETHER CAPITALIZED OR NOT — MUST BE GRADED AS 2. NEVER GRADE ITALICS AS 1!
       --> IMPORTANT: The FIRST remedy printed after a rubric colon (:) is very commonly in ITALIC (Grade 2) — do NOT assume it is Grade 1 just because it is first!
     * GRADE 1 = PLAIN ROMAN UPRIGHT LOWERCASE. Upright, non-italic, non-bold, smaller font. e.g. "chin-s", "ferr", "cob", "grat", "nat-m", "verat", "aloe", "berb", "bry", "calc-p", "cimic".
   - TOKEN-EFFICIENT GROUPED OUTPUT: for each rubric, group remedies of the same grading into a SINGLE object, with remedy names joined by commas:
     "medicines": [
       {"name": "Æsc,Aloe,Graph", "grading": 3},
       {"name": "Ammc,Arn,Ant-c", "grading": 2},
       {"name": "bar-c,nux-v,sulph", "grading": 1}
     ]

8. STANDALONE CROSS-REFERENCES:
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
  console.log(`[Kent AI Parser] Starting four-quadrant column crop extraction: ${path.basename(imagePath)}`);

  // Split image into high-res physical quadrant crops (TL, BL, TR, BR)
  // IMPORTANT: destructure `quadrants` so the 4-pass pipeline below actually runs.
  // Previously only leftCropPath/rightCropPath were destructured, causing quadrants
  // to be undefined — silently falling back to 2-pass and dropping the bottom-left
  // content (e.g. HANDS, HEADLESS rubrics on page 126).
  const { quadrants, leftCropPath, rightCropPath, cleanup } = await splitImageForAi(imagePath);

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
      // KNOWN_CHAPTERS: these are chapter-level headings whose prefix should be
      // stripped from rubric_en (chapter is stored separately in chapter_en).
      // DO NOT include valid Main Rubrics like HANDS, HEADLESS, HAIR here —
      // those must be preserved as the first segment of rubric_en.
      const KNOWN_CHAPTERS = ['RECTUM', 'MIND', 'HEAD', 'EYE', 'EAR', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 'STOMACH', 'ABDOMEN', 'STOOL', 'URINARY', 'GENITALIA', 'RESPIRATION', 'COUGH', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'FEVER', 'SKIN', 'GENERALITIES', 'CHAPTER', '[CHAPTER]'];
      if (KNOWN_CHAPTERS.includes(prefix)) {
        return '';
      }
      // Rubrics like HANDS, HEADLESS, HAIR are valid main rubrics — do not strip!
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
    // 4-Quadrant Pass Pipeline (TL -> BL -> TR -> BR)
    // `quadrants` is now correctly destructured from splitImageForAi above.
    // Order: top-left → bottom-left → top-right → bottom-right ensures left column
    // is fully processed (including bottom-left content like HANDS / HEADLESS)
    // before moving to the right column.
    const quadrantsToRun = quadrants && quadrants.length === 4
      ? quadrants
      : [
          { path: leftCropPath, hint: 'left' },
          { path: rightCropPath, hint: 'right' }
        ];

    let lastRubricContext = '';

    for (let i = 0; i < quadrantsToRun.length; i++) {
      const q = quadrantsToRun[i];
      console.log(`[Kent AI Parser] Pass ${i + 1}/${quadrantsToRun.length}: Extracting ${q.hint.toUpperCase()} crop...`);
      if (lastRubricContext) {
        console.log(`[Kent AI Parser] Context carried from previous quadrant: "${lastRubricContext}"`);
      }

      try {
        const { text: responseText, finishReason } = await extractColumnPass(q.path, q.hint, lastRubricContext);
        console.log(`[Kent AI Parser] ${q.hint.toUpperCase()} response: ${responseText.length} chars, finishReason=${finishReason}`);

        const { data: parsed, wasRepaired } = repairAndParseJson(responseText);
        const { data: qData, chapter: qChapter } = extractDataArray(parsed);

        console.log(`[Kent AI Parser] ${q.hint.toUpperCase()} parsed: ${qData.length} groups, chapter="${qChapter}", repaired=${wasRepaired}`);
        addResults(qData, qChapter);

        // Update lastRubricContext for the next quadrant
        if (allResults.length > 0) {
          const fullPath = allResults[allResults.length - 1].rubric_en || '';
          const parts = fullPath.split(' - ');
          lastRubricContext = parts.slice(0, Math.min(3, parts.length)).join(' - ');
        }
      } catch (e) {
        console.error(`[Kent AI Parser] ${q.hint.toUpperCase()} pass failed:`, e.message);
      }

      // Small delay between quadrant passes to respect rate limits
      if (i < quadrantsToRun.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Fallback: If 0 rows extracted, try full page pass
    if (allResults.length === 0) {
      console.warn('[Kent AI Parser] ⚠️ Quadrant extraction produced 0 rows. Trying FULL PAGE fallback...');
      await new Promise(r => setTimeout(r, 1500));
      try {
        const { text: fullResponse, finishReason: fullFinishReason } = await extractColumnPass(imagePath, 'all', lastRubricContext);
        console.log(`[Kent AI Parser] Full page response: ${fullResponse.length} chars, finishReason=${fullFinishReason}`);
        const { data: fullParsed } = repairAndParseJson(fullResponse);
        const { data: fullData, chapter: fullChapter } = extractDataArray(fullParsed);
        addResults(fullData, fullChapter);
      } catch (e) {
        console.error('[Kent AI Parser] Full page fallback failed:', e.message);
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
  // --- Time / Condition modifiers ---
  'pressing': 'दबाव', 'evening': 'शाम', 'morning': 'सुबह', 'night': 'रात', 'afternoon': 'दोपहर',
  'tension': 'तनाव', 'amel.': 'घटता है', 'agg.': 'बढ़ता है', 'amel': 'घटता है', 'agg': 'बढ़ता है',
  // --- Circumstance modifiers ---
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
  'Occiput': 'पश्चकपाल', 'Temples': 'कनपटी', 'Vertex': 'शीर्ष',
  // --- General modifiers ---
  'standing, while': 'खड़े रहना, जबकि', 'lying, while': 'लेटते समय',
  'walking': 'चलना', 'flatus, during': 'पेट फूलना, दौरान', 'rest amel.': 'आराम घटता है',
  'smarting': 'टीसदार जलन', 'smarting (compare "burning")': 'टीसदार जलन (जलन से तुलना करें)',
  'soreness': 'दुखन / पीड़ा', 'shooting': 'चुभने जैसा दर्द', 'rawness': 'कच्चापन',
  'rasping': 'कर्कशता / छीलने जैसा', 'scraping': 'खुरचना', 'stool, hard, during': 'मल, कठोर, दौरान',
  'diarrhœa, during': 'दस्त, दौरान', 'bed, in': 'बिस्तर, अंदर', 'as in a': 'जैसे कि', 'not for': 'मल, के लिए नहीं',
  'moving, after': 'हिलना, बाद में',
  'menses, during': 'मासिक धर्म के दौरान', 'menses, before': 'मासिक धर्म, पहले'
};

const postProcessHindiMedicalTerms = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/\bamel\./gi, 'घटता है')
    .replace(/\bamel\b/gi, 'घटता है')
    .replace(/\bअमेल।?/gi, 'घटता है')
    .replace(/\bअमल।?/gi, 'घटता है')
    .replace(/\bagg\./gi, 'बढ़ता है')
    .replace(/\bagg\b/gi, 'बढ़ता है')
    .replace(/\bएजीजी।?/gi, 'बढ़ता है');
};

const ensureHindiTranslation = (enText, currentHi) => {
  if (currentHi && /[\u0900-\u097F]/.test(currentHi) && !/RECTUM - PAIN/.test(currentHi)) {
    return postProcessHindiMedicalTerms(currentHi);
  }
  if (!enText) return '';
  const parts = enText.split(/\s*-\s*/);
  const hiParts = parts.map(part => {
    const trimmed = part.trim();
    if (KENT_TERM_TRANSLATIONS[trimmed]) return KENT_TERM_TRANSLATIONS[trimmed];
    const lower = trimmed.toLowerCase();
    if (KENT_TERM_TRANSLATIONS[lower]) return KENT_TERM_TRANSLATIONS[lower];
    return trimmed;
  });
  return postProcessHindiMedicalTerms(hiParts.join(' - '));
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

  // Step 1: Try Free Google Translate API first
  try {
    const chapterPromises = chaptersArray.map(ch => googleTranslateSingle(ch).then(res => [ch, res]));
    const rubricPromises = rubricsArray.map(rub => googleTranslateSingle(rub).then(res => [rub, res]));

    chapterResults = Object.fromEntries(await Promise.all(chapterPromises));
    rubricResults = Object.fromEntries(await Promise.all(rubricPromises));

    const duration = Date.now() - startTime;
    console.log(`[Hindi Translation] ✅ Google Translate completed ${chaptersArray.length + rubricsArray.length} items in ${duration}ms!`);
  } catch (err) {
    console.warn('[Hindi Translation] Google Translate failed, falling back to Groq AI:', err.message);
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
    const finalRubHi = postProcessHindiMedicalTerms(ensureHindiTranslation(row.rubric_en, rawRubHi));

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