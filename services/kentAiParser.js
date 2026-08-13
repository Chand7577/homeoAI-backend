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
  'lach n': 'lach',     // Page 156 OCR artifact for Lachesis
  'lach-n': 'lach',     // Page 156 OCR artifact for Lachesis
  'phyto': 'phyt'       // Phytolacca
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

    // Left column takes 0%..53% width, full height (0..height)
    // Right column takes 47%..100% width, full height (0..height)
    const leftWidth = Math.floor(width * 0.53);
    const rightStart = Math.floor(width * 0.47);

    await sharp(imagePath)
      .extract({ left: 0, top: 0, width: leftWidth, height: height })
      .jpeg({ quality: 95 })
      .toFile(leftCropPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height: height })
      .jpeg({ quality: 95 })
      .toFile(rightCropPath);

    return {
      columns: [
        { path: leftCropPath, hint: 'left' },
        { path: rightCropPath, hint: 'right' }
      ],
      leftCropPath,
      rightCropPath,
      cleanup: () => {
        [leftCropPath, rightCropPath].forEach(p => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { }
        });
      }
    };
  } catch (err) {
    console.warn(`[Kent AI Parser] Sharp column crop warning: ${err.message}`);
    return {
      columns: [{ path: imagePath, hint: 'all' }],
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

--- REPERTORY LAYOUT & THREE-TIER HIERARCHY STACK RULES ---
1. EXHAUSTIVE LINE-BY-LINE EXTRACTION (CRITICAL):
   Extract EVERY SINGLE rubric and EVERY SINGLE remedy listed from top to bottom of this column image.
   Do NOT skip small sub-rubrics (e.g. "downward, outward, etc.:", "smarting:", "difficult stool", "after:", "during menses:", "walking, while:", "extending to:", "tenesmus:").
   Do NOT combine sub-rubrics into their parent. Every line with a colon or qualifier MUST generate its own distinct sub-rubric entry!

2. SPATIAL VISUAL INDENTATION & HIERARCHY STACK (RUBRIC -> SUB-RUBRIC -> SUB-SUB-RUBRIC):
   - LEVEL 0 [MAIN RUBRIC]: ALL-CAPS or BOLD-CAPS headings starting at left margin (e.g. "PAIN", "STOOL", "COLDNESS", "ERUPTION", "CONSTRICTION", "COUGH", "PAIN").
     * ALL MAIN RUBRICS ARE ALWAYS PRINTED IN ALL CAPS!
     * Resets the entire sub-rubric hierarchy stack for all following items.
   - LEVEL 1 [SUB-RUBRIC / SUBRIC]: Primary sub-heading under Main Rubric (e.g. "pressing", "burning", "smarting", "soreness", "morning", "stool, during", "Forehead").
     * ANY heading or term whose text starts AT THE LEFT MARGIN of the column (not indented under a previous item) is a Level-1 Primary Sub-Rubric under the active main rubric.
     * ANATOMICAL LOCATION SUB-RUBRICS UNDER SENSATIONS: Anatomical locations in Title-case (e.g. "Forehead:", "Occiput:", "Temples:", "Vertex:", "Sides:", "Brain:", "Scalp:") printed under a main rubric (like COLDNESS, PAIN, ERUPTION, EMPTY, ENLARGED) are SUB-RUBRICS (Level 1) of that active Main Rubric! (Target path: "COLDNESS - Forehead", and sub-items under it: "COLDNESS - Forehead - morning"). NEVER treat Title-case "Forehead:" as a top-level Main Rubric!
     * GENERALIZED MARGIN RESET RULE: Any term printed at the column's left margin IMMEDIATELY RESETS the sub-rubric stack to Level 1 under the active ALL-CAPS Main Rubric.
   - LEVEL 2 [SUB-SUB-RUBRIC / SUBRUIC]: Indented qualifiers & sub-modifiers under a Level-1 Sub-Rubric (e.g., "evening", "bed, in", "sitting, while", "extending to", "downward, outward, etc.").
     * Lines physically INDENTED under a Level-1 rubric.
     * Append these indented qualifiers sequentially to the parent Level-1 rubric path (e.g. "PAIN - pressing - evening - bed, in", "COLDNESS - Forehead - morning").
   - LEVEL 3+ [SUB-SUB-SUB-RUBRIC]: Further indented modalities or sub-modifiers under Level 2 (e.g. "amel.", "agg.", "walking, in open air").

3. MANDATORY FULL PATH CONSTRUCTION (MAIN RUBRIC - SUB-RUBRIC - SUB-SUB-RUBRIC):
   - EVERY JSON entry's "rubric_en" MUST be the complete concatenated path from Level 0 to the deepest level:
     Format: "MAIN RUBRIC - subrubric - subsubrubric - subsubsubrubric"
   - Example 1: Under "PAIN", sub-rubric "pressing", sub-sub-rubric "evening", sub-sub-sub-rubric "bed, in:":
     --> rubric_en: "PAIN - pressing - evening - bed, in"
   - Example 2: Under "COLDNESS", sub-rubric "Forehead", sub-sub-rubric "morning:":
     --> rubric_en: "COLDNESS - Forehead - morning"
   - Example 3: Under "AIR, open, in:", sub-rubric "amel.:":
     --> rubric_en: "AIR - open, in - amel."
   - NEVER emit an orphaned sub-rubric like "pressing - evening" without its parent Main Rubric ("PAIN")!

4. INDENTED SUB-RUBRICS UNDER QUALIFIERS (CRITICAL PARENT RETENTION RULE):
   - When a sub-rubric (e.g., "wine, from:", "work, from:", "slowly, while:", "washing, from:", "wet, from getting:", "wind, from exposure to:") has indented child sub-rubrics beneath it (such as "amel.:", "lead, containing:", "sour:", "sulphurous:", "cold water, amel.:", "while sweating:"), EVERY child entry MUST preserve its parent sub-rubric in the path!
   - Example A (under PAIN -> wine, from:):
     * "wine, from:" -> rubric_en: "PAIN - wine, from"
     * "amel.:" -> rubric_en: "PAIN - wine, from - amel."
     * "lead, containing:" -> rubric_en: "PAIN - wine, from - lead, containing"
     * "sour:" -> rubric_en: "PAIN - wine, from - sour"
     * "sulphurous:" -> rubric_en: "PAIN - wine, from - sulphurous"
   - Example B (under PAIN -> work, from:):
     * "work, from:" -> rubric_en: "PAIN - work, from"
     * "amel.:" -> rubric_en: "PAIN - work, from - amel."
   - Example C (under PAIN -> slowly, while:):
     * "slowly, while:" -> rubric_en: "PAIN - slowly, while"
     * "amel.:" -> rubric_en: "PAIN - slowly, while - amel."
   - Example D (under PAIN -> washing, from:):
     * "washing, from:" -> rubric_en: "PAIN - washing, from"
     * "cold water, amel.:" -> rubric_en: "PAIN - washing, from - cold water, amel."
   - NEVER drop "wine, from", "work, from", "slowly, while", or "washing, from" when building the rubric path for their indented sub-items!

5. MULTILINE VISUAL WRAPPING (PREVENT SPLITTING):
   - A single rubric description can wrap across multiple printed lines in the column.
   - If line breaks occur WITHOUT a colon (:) at the end of the line, it is a single wrapped rubric description.
   - Example: "mist before eyes; then fleeting pains, agg. at occipital protuberance, down neck and shoulders, amel. lying in a dark, quiet place, and from sleep: Podo." MUST be extracted as ONE single rubric entry ("PAIN - mist before eyes; then fleeting pains, agg. at occipital protuberance, down neck and shoulders, amel. lying in a dark, quiet place, and from sleep"). Do NOT split it into separate lines like "at occipital protuberance", "down neck and shoulders", etc.!

6. QUALIFIERS BEFORE COLONS & SUB-MODIFIERS (amel., agg., etc.):
   - Text before colon (:) is a sub-rubric/qualifier.
   - MANDATORY SUB-MODIFIER INCLUSION: When a line under a rubric (like "AIR, open, in:") is indented and starts with "amel.:" or "agg.:", you MUST append "- amel." or "- agg." to the active rubric path (e.g. "AIR - open, in - amel.").
   - NEVER drop qualifiers like "amel.", "agg.", "downward, outward, etc.", "bed, in", "sitting, while", "smarting", "soreness"!

7. SUB-RUBRICS WITH PARENTHETICAL NOTES & COMPARISONS:
   - Whenever a line includes parenthetical notes or comparisons like 'smarting (compare "burning"):', e.g.:
     "smarting (compare 'burning'): Æsc., æth., aloe..."
   - You MUST extract "smarting" as a RUBRIC / SUB-RUBRIC under the parent rubric! (Target path: "PAIN - smarting").
   - NEVER drop the rubric title "smarting" and dump remedies into a previous header like "PAIN - shooting"!

8. FULL RUBRIC PATH SYNTAX (DO NOT INCLUDE CHAPTER NAME IN RUBRIC_EN):
   Format: "MAIN RUBRIC - subrubric - subsubrubric" (DO NOT prefix with Chapter Name! Chapter is stored separately in chapter_en.)

9. COLUMN CONTINUATION HEADERS & GENERALIZED MARGIN RESET (PREVENT CONTINUATION CONTAMINATION):
   - At the top of a column, a header like "PAIN, weather." or "PAIN, shooting." is a continuation header from the previous column/page.
   - Continuation headers ONLY apply to items physically INDENTED beneath them (e.g. "warm, begins with the: Glon., nat-s.", "windy, stormy, from: ...", "wet, from getting: ...").
   - UNIVERSAL MARGIN RESET RULE: As soon as any line appears whose text starts FLUSH WITH THE LEFT MARGIN of the column (e.g., "wine, from:", "winking agg.:", "winter headaches:", "work, from:"), it is a NEW SIBLING SUB-RUBRIC at Level 1 under the main section (e.g., "PAIN - wine, from", "PAIN - winking agg.").
   - Immediately reset the active path to "MAIN_RUBRIC - <flush_left_rubric_name>"! NEVER nest a flush-left rubric as a sub-item of a continuation header!

10. MEDICINES & STRICT 3-TIER CLINICAL TYPOGRAPHY GRADING (CRITICAL):
   - DO NOT DEFAULT THE FIRST REMEDY ON A LINE TO GRADE 3! Capitalization at the beginning of a line or after a colon does NOT equal Bold.
   - Inspect the visual font weight of EVERY remedy abbreviation carefully:
     * GRADE 3 = HEAVY BOLD TEXT ONLY. The letters are visibly THICKER and DARKER than surrounding text. Example bold remedies in Kent: "Sulph", "Calc", "Lyc", "Mag-c", "Crot-t", "Podo", "Caust", "Graph", "Nat-m", "Nux-v", "Puls", "Tabac", "Gels", "Sep", "Rhus-t", "Nux-m", "Dulc". If unsure whether a remedy is Bold or Italic, prefer Grade 2 over Grade 3.
     * GRADE 2 = ITALIC TEXT. The letters are SLANTED/OBLIQUE. Italics can be CAPITALIZED ("Agar", "Glon", "Ambr", "Nit-ac", "Cimic", "Aur", "Thuj", "Camph", "Grat", "Eug", "Ol-an", "Apis", "Lac-ac", "Aloe", "Ign", "Kali-c", "Bar-c", "Lach", "Ox-ac", "Absin", "Chel", "Bell", "Chin", "Hipp", "Alum", "Podo") OR lowercase-italic ("agar", "apis", "arn", "ars", "calc", "carb-v", "dios", "hep", "kali-bi", "lil-t", "mur-ac", "phos", "rhus-t", "sep", "sul-ac", "thuj").
       --> CRITICAL MANDATE: ALL SLANTED/ITALIC TEXT — WHETHER CAPITALIZED OR NOT — MUST BE GRADED AS 2. NEVER GRADE ITALICS AS 1!
       --> IMPORTANT: The FIRST remedy printed after a rubric colon (:) is very commonly in ITALIC (Grade 2) — do NOT assume it is Grade 1 just because it is first!
     * GRADE 1 = PLAIN ROMAN UPRIGHT LOWERCASE. Upright, non-italic, non-bold, smaller font. e.g. "chin-s", "ferr", "cob", "grat", "nat-m", "verat", "aloe", "berb", "bry", "calc-p", "cimic", "am-c", "kali-b", "led", "lyc", "nat-s", "plant".
   - TOKEN-EFFICIENT GROUPED OUTPUT: for each rubric, group remedies of the same grading into a SINGLE object, with remedy names joined by commas:
     "medicines": [
       {"name": "Æsc,Aloe,Graph", "grading": 3},
       {"name": "Ammc,Arn,Ant-c", "grading": 2},
       {"name": "bar-c,nux-v,sulph", "grading": 1}
     ]

11. STANDALONE CROSS-REFERENCES:
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

  // Token budget:
  // - GPT-4o (OpenAI): max output = 16,384 tokens → use 16000
  // - Gemini 2.0 Flash: max output = 8,192 tokens → would need 32000 cap only if Gemini-Pro
  // Since we are now using GPT-4o as primary, set to 16000.
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType } }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16000,
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
  const { columns, leftCropPath, rightCropPath, cleanup } = await splitImageForAi(imagePath);

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
    
    // Aggressively strip any known chapter prefix, in case the AI hallucinated it
    // and currentChapter was UNKNOWN or mismatched.
    const ALL_CHAPTERS = ['MIND', 'HEAD', 'EYE', 'EAR', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL', 'URINARY', 'GENITALIA', 'RESPIRATION', 'COUGH', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'FEVER', 'SKIN', 'GENERALITIES'];
    for (const chap of ALL_CHAPTERS) {
      const chapRegex = new RegExp(`^${chap}\\s*-\\s*`, 'i');
      if (chapRegex.test(clean)) {
        clean = clean.replace(chapRegex, '');
        break;
      }
    }

    // Remove literal "[CHAPTER] -" or "CHAPTER -" prefixes hallucinated by AI
    clean = clean.replace(/^(?:\[CHAPTER\]|CHAPTER)\s*-\s*/i, '');
    return clean.trim();
  };

  const cleanHindiRubricPath = (rubricStr, chapterHindi) => {
    if (!rubricStr) return '';
    let clean = rubricStr.trim();
    if (chapterHindi) {
      const chapRegex = new RegExp(`^${chapterHindi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
      clean = clean.replace(chapRegex, '');
    }
    return clean.trim();
  };

  let activeMainRubric = '';
  let activeSubRubric = '';

  const extractMainRubricWord = (segment) => {
    if (!segment) return '';
    const bare = segment.split(/[,.(:]/)[0].trim();
    if (bare.length >= 3 && bare === bare.toUpperCase() && /^[A-Z]/.test(bare)) {
      return bare;
    }
    return '';
  };

  const KNOWN_CHILD_MODIFIERS = new Set([
    'amel.', 'agg.', 'lead, containing', 'sour', 'sulphurous',
    'cold water, amel.', 'while sweating', 'feet, from wetting',
    'head, from wetting', 'wind, from exposure to', 'cloudy',
    'cold', 'damp, cold', 'dry, cold', 'warm, begins with the',
    'windy, stormy, from', 'wet, from getting', 'riding in',
    'east', 'rough', 'wct, from getting'
  ]);

  const addResults = (rows, detectedChapter) => {
    // Lock chapter to page running header (ignore hallucinated chapters like TEETH)
    if (detectedChapter && !mainChapter) {
      mainChapter = detectedChapter.toUpperCase();
    }
    const currentChapter = mainChapter || detectedChapter || 'UNKNOWN';

    const ALL_CHAPTERS = new Set(['MIND', 'HEAD', 'EYE', 'EAR', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL', 'URINARY', 'GENITALIA', 'RESPIRATION', 'COUGH', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'FEVER', 'SKIN', 'GENERALITIES']);

    for (const group of (rows || [])) {
      let rubric_en = cleanRubricPath(group.rubric_en || '', currentChapter);
      let rubric_hi = cleanHindiRubricPath(group.rubric_hi || '', '');

      // Normalize continuation headers like "PAIN, weather" -> "PAIN - weather"
      rubric_en = rubric_en.replace(/^([A-Z]{3,})\s*,\s*([a-zA-Z0-9_,\s]+?)(?=\s*-\s*|$)/, '$1 - $2');

      const parts = rubric_en.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      let detectedMainRubric = '';
      for (const seg of parts) {
        const word = extractMainRubricWord(seg);
        if (word && !ALL_CHAPTERS.has(word)) { 
          detectedMainRubric = word; 
          break; 
        }
      }

      // If the AI hallucinated the chapter as the only text on the line, skip processing
      if (parts.length === 1 && ALL_CHAPTERS.has(extractMainRubricWord(parts[0]))) {
        continue;
      }

      if (detectedMainRubric) {
        activeMainRubric = detectedMainRubric;
      } else if (activeMainRubric) {
        if (parts[0] && parts[0].toUpperCase() === activeMainRubric.toUpperCase()) {
          parts[0] = activeMainRubric;
        } else {
          parts.unshift(activeMainRubric);
        }
        rubric_en = parts.join(' - ');
      } else if (!activeMainRubric && currentChapter === 'HEAD') {
        // Default active main rubric for HEAD chapter PAIN section
        activeMainRubric = 'PAIN';
        parts.unshift(activeMainRubric);
        rubric_en = parts.join(' - ');
      }

      // Re-anchor sub-rubrics and child modifiers under activeSubRubric
      if (parts.length >= 2 && parts[0] === activeMainRubric) {
        const level1 = parts[1];
        const level1Clean = level1.replace(/[:.]/g, '').trim().toLowerCase();
        const isKnownChild = KNOWN_CHILD_MODIFIERS.has(level1Clean) || level1Clean === 'amel.' || level1Clean === 'agg.';

        if (isKnownChild && activeSubRubric && !rubric_en.toLowerCase().includes(activeSubRubric.toLowerCase())) {
          parts.splice(1, 0, activeSubRubric);
          rubric_en = parts.join(' - ');
        } else if (!isKnownChild && parts.length === 2) {
          activeSubRubric = level1;
        } else if (parts.length >= 3) {
          activeSubRubric = parts[1];
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
    // 2-Pass Column Extraction Pipeline (Left Column -> Right Column)
    // Full-height column crops preserve complete top-to-bottom visual hierarchy,
    // prevent horizontal line slicing, and cleanly carry continuation context from Left to Right column.
    const columnsToRun = columns && columns.length === 2
      ? columns
      : [
        { path: leftCropPath, hint: 'left' },
        { path: rightCropPath, hint: 'right' }
      ];

    let lastRubricContext = '';

    for (let i = 0; i < columnsToRun.length; i++) {
      const col = columnsToRun[i];
      console.log(`[Kent AI Parser] Pass ${i + 1}/${columnsToRun.length}: Extracting ${col.hint.toUpperCase()} column...`);
      if (lastRubricContext) {
        console.log(`[Kent AI Parser] Context carried from previous column: "${lastRubricContext}"`);
      }

      try {
        const { text: responseText, finishReason } = await extractColumnPass(col.path, col.hint, lastRubricContext);
        console.log(`[Kent AI Parser] ${col.hint.toUpperCase()} response: ${responseText.length} chars, finishReason=${finishReason}`);

        const { data: parsed, wasRepaired } = repairAndParseJson(responseText);
        const { data: colData, chapter: colChapter } = extractDataArray(parsed);

        console.log(`[Kent AI Parser] ${col.hint.toUpperCase()} parsed: ${colData.length} groups, chapter="${colChapter}", repaired=${wasRepaired}`);
        addResults(colData, colChapter);

        // Update lastRubricContext for the next column
        if (allResults.length > 0) {
          const fullPath = allResults[allResults.length - 1].rubric_en || '';
          const parts = fullPath.split(' - ');
          lastRubricContext = parts.slice(0, Math.min(3, parts.length)).join(' - ');
        }
      } catch (e) {
        console.error(`[Kent AI Parser] ${col.hint.toUpperCase()} column pass failed:`, e.message);
      }

      // Small delay between column passes to respect rate limits
      if (i < columnsToRun.length - 1) {
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
  // Additional clinical terms for common rubrics
  'INFLAMMATION': 'सूजन', 'DRYNESS': 'सूखापन', 'DULLNESS': 'मंदता', 'ECCHYMOSIS': 'रक्तस्रावी धब्बे',
  'ENLARGEMENT': 'बढ़े होने का अहसास', 'ENLARGED': 'बड़ा हुआ', 'ERUPTIONS': 'फुंसियां', 'FULLNESS': 'भरे होने का अहसास',
  'GLASSY': 'कांच जैसा', 'GLAZED': 'चमकदार', 'GRANULAR': 'दानेदार', 'HARDNESS': 'कठोरता', 'HEAT': 'गर्मी', 'HEAVINESS': 'भारीपन',
  'HORDEOLA': 'स्टाई', 'HYPERTROPHY': 'हाइपरट्रॉफी', 'INFILTRATION': 'घुसपैठ', 'INFANTS': 'शिशुओं',
  'scrofulous': 'गंडमाला संबंधी', 'syphilitic': 'उपदंशीय', 'summer, in': 'गर्मी में', 'vaccination, after': 'टीकाकरण के बाद',
  'worse after 1 a.m.': 'रात 1 बजे के बाद बढ़ता है', 'suggilation after injuries': 'चोटों के बाद थक्का जमाव',
  'wind, dry cold': 'हवा, सूखी ठंडी', 'wounds from': 'घावों से', 'reading': 'पढ़ते समय', 'room, in': 'कमरे में',
  'waking, on': 'जागने पर', 'sensation of': 'अहसास', 'in canthi': 'कोनों में', 'canthi': 'कोनों का',
  'iris': 'आइरिस', 'lids': 'पलकों', 'lids, on': 'पलकों पर', 'about the eyes': 'आंखों के आसपास'
};

const postProcessHindiMedicalTerms = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/\bamel\./gi, 'घटता है')
    .replace(/\bamel\b/gi, 'घटता है')
    .replace(/\bamcl\./gi, 'घटता है') // OCR typo for amel.
    .replace(/\bamcl\b/gi, 'घटता है') // OCR typo for amel.
    // Remove \b for Hindi words because \b only works for ASCII \w characters
    .replace(/(?:^|\s)अमेल(?:।|\.|\b)?/gi, ' घटता है')
    .replace(/(?:^|\s)आमेल(?:।|\.|\b)?/gi, ' घटता है')
    .replace(/(?:^|\s)अमल(?:।|\.|\b)?/gi, ' घटता है')
    .replace(/(?:^|\s)एएमसीएल(?:।|\.|\b)?/gi, ' घटता है') // OCR typo translation
    .replace(/\bagg\./gi, 'बढ़ता है')
    .replace(/\bagg\b/gi, 'बढ़ता है')
    .replace(/(?:^|\s)एजीजी(?:।|\.|\b)?/gi, ' बढ़ता है')
    .replace(/\s+/g, ' ')
    .trim();
};

const translateSingleSegment = (part) => {
  if (!part) return '';
  const trimmed = part.trim();
  if (KENT_TERM_TRANSLATIONS[trimmed]) return KENT_TERM_TRANSLATIONS[trimmed];
  const lower = trimmed.toLowerCase();
  if (KENT_TERM_TRANSLATIONS[lower]) return KENT_TERM_TRANSLATIONS[lower];

  let result = trimmed;
  for (const [enKey, hiValue] of Object.entries(KENT_TERM_TRANSLATIONS)) {
    if (enKey.length >= 3) {
      const regex = new RegExp(`\\b${enKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, hiValue);
    }
  }
  return result;
};

const ensureHindiTranslation = (enText, currentHi) => {
  // If currentHi exists, has Devanagari, AND has NO remaining English words, keep it
  if (currentHi && /[\u0900-\u097F]/.test(currentHi) && !/[a-zA-Z]{2,}/.test(currentHi) && !/RECTUM - PAIN/.test(currentHi)) {
    return postProcessHindiMedicalTerms(currentHi);
  }

  // Otherwise, decompose by hyphen segments and translate any segment containing English
  const enParts = (enText || '').split(/\s*-\s*/);
  const hiParts = (currentHi || '').split(/\s*-\s*/);

  const finalParts = enParts.map((enPart, idx) => {
    const existingHiPart = hiParts[idx] ? hiParts[idx].trim() : '';
    if (existingHiPart && /[\u0900-\u097F]/.test(existingHiPart) && !/[a-zA-Z]{2,}/.test(existingHiPart)) {
      return existingHiPart;
    }
    const sourcePart = (existingHiPart && /[a-zA-Z]{2,}/.test(existingHiPart)) ? existingHiPart : enPart;
    return translateSingleSegment(sourcePart);
  });

  return postProcessHindiMedicalTerms(finalParts.join(' - '));
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
  translateRubricsToHindi,
  ensureHindiTranslation,
  postProcessHindiMedicalTerms
};