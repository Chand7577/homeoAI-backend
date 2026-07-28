'use strict';

const { extractColumnTextsFromImage, extractTextFromImage, extractTopStripText } = require('./kentOcrService');
const { parseKentOcrTextAdvanced } = require('./kentTextParser');
const fs = require('fs-extra');
const path = require('path');

/**
 * Clean up common OCR errors in chapter names.
 * @param {string} chapterName - Raw chapter name from OCR
 * @returns {string} - Cleaned chapter name
 */
const cleanChapterName = (chapterName) => {
  const corrections = {
    // VERTIGO variations
    'VERTIG': 'VERTIGO',
    'VERTICC': 'VERTIGO',
    'VERTIQO': 'VERTIGO',
    'VERITGO': 'VERTIGO',
    'VERTICO': 'VERTIGO',
    
    // Common OCR errors
    'IEAT': 'HEAT',
    'JAWK': 'HAWK',
    
    // URETHRA variations
    'UTHERA': 'URETHRA',
    'UTHREA': 'URETHRA',
    'URETH RA': 'URETHRA',
    
    // Spacing errors
    'THRO AT': 'THROAT',
    'THROA T': 'THROAT',
    'ABDO MEN': 'ABDOMEN',
    'RECT UM': 'RECTUM',
    'STO MACH': 'STOMACH',
    'BLAD DER': 'BLADDER',
    'KID NEY': 'KIDNEY',
    'KID NEYS': 'KIDNEYS',
    
    // EXTREMITIES variations
    'EXTRE MITIES': 'EXTREMITIES',
    'EXTREMI TIES': 'EXTREMITIES',
    'EXTREM ITIES': 'EXTREMITIES',
    
    // GENERALITIES variations
    'GENERA LITIES': 'GENERALITIES',
    'GENERA LITES': 'GENERALITIES',
    'GENERAL ITIES': 'GENERALITIES',
    
    // RESPIRATION variations
    'RESPIR ATION': 'RESPIRATION',
    'RESPIRA TION': 'RESPIRATION',
    
    // EXPECTORATION variations
    'EXPECTOR ATION': 'EXPECTORATION',
    'EXPECTORA TION': 'EXPECTORATION',
    
    // PERSPIRATION variations
    'PERSPIR ATION': 'PERSPIRATION',
    'PERSPIRA TION': 'PERSPIRATION',
    
    // GENITALIA variations
    'GENIT ALIA': 'GENITALIA',
    'GENITA LIA': 'GENITALIA',
    'FEMALE GENIT ALIA': 'FEMALE GENITALIA',
    'MALE GENIT ALIA': 'MALE GENITALIA',
    'FEMALE GENITA LIA': 'FEMALE GENITALIA',
    'MALE GENITA LIA': 'MALE GENITALIA',
    
    // PROSTATE variations
    'PROST ATE': 'PROSTATE',
    'PROSTA TE': 'PROSTATE',
    'PROSTRATE': 'PROSTATE',  // Common misspelling
    
    // CONSTIPATION variations
    'CONSTIP ATION': 'CONSTIPATION',
    'CONSTIPA TION': 'CONSTIPATION',
    
    // DIARRHEA/DIARRHOEA variations
    'DIARR HEA': 'DIARRHEA',
    'DIARRH EA': 'DIARRHEA',
    'DIARR HOEA': 'DIARRHOEA',
    'DIARRH OEA': 'DIARRHOEA'
  };

  return corrections[chapterName] || chapterName;
};

/**
 * Extract chapter name from page header (top of OCR text).
 * Kent's Repertory always has the chapter name as the first line in large capitals.
 *
 * @param {string} ocrText - Raw OCR text from page header area
 * @returns {string} - Detected chapter name (uppercase) or 'UNKNOWN'
 */
const extractChapterFromHeader = (ocrText) => {
  if (!ocrText || ocrText.trim().length === 0) return 'UNKNOWN';

  // Guard: if OCR text contains PDF viewer / browser toolbar noise, skip it
  // This happens when user uploads a screenshot with Acrobat/browser UI visible
  const uiNoisePhrases = ['acrobat', 'copilot', 'draw', 'edit with', 'ask copilot', 'chrome', 'firefox'];
  const lowerText = ocrText.toLowerCase();
  if (uiNoisePhrases.some(phrase => lowerText.includes(phrase))) {
    console.warn('[Chapter Detect] Top-strip contains UI toolbar noise — skipping, will use column text fallback.');
    return 'UNKNOWN';
  }

  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return 'UNKNOWN';

  // Known Kent Repertory chapters (complete 39 chapters from Kent's original work)
  // IMPORTANT: Sorted by length (longest first) to avoid substring matches
  const knownChapters = [
    // Multi-word chapters (longest first - 14+ chars)
    'FEMALE GENITALIA', 'MALE GENITALIA', 'PROSTATE GLAND', 'PROSTRATE GLAND',
    'EXPECTORATION', 'PERSPIRATION', 'GENERALITIES', 'EXTREMITIES',
    'CONSTIPATION',
    // Alternate spellings (12-13 chars)
    'FEMALE GENITAL', 'MALE GENITAL',
    // 10-11 char chapters
    'RESPIRATION', 'GENITALIA', 'DIARRHOEA', 'DIARRHEA',
    // 7-9 char chapters
    'PROSTATE', 'PROSTRATE', 'HEARING', 'KIDNEYS', 'BLADDER', 
    'ABDOMEN', 'STOMACH', 'VERTIGO', 'LARYNX', 'URETHRA', 'UTHERA',
    // 6 char chapters
    'THROAT', 'RECTUM', 'KIDNEY', 'VISION', 'CHEST', 'FEVER', 
    'SLEEP', 'STOOL', 'URINE', 'MOUTH', 'TEETH', 'CHILL',
    // 4-5 char chapters
    'MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'BACK', 
    'SKIN', 'EYE', 'EAR', 'COUGH'
  ];

  /**
   * Helper: strip spaces between single letters (e.g. "R E C T U M" → "RECTUM")
   * and remove decorative characters like dots, dashes, underscores.
   */
  const deSpace = (s) => s.replace(/(?<=\b[A-Z])\s+(?=[A-Z]\b)/g, '').replace(/[.\-_·•]+/g, '').trim();

  // Try up to 15 lines; chapter header can appear anywhere near the top
  const scanLines = lines.slice(0, 15).map(l => l.toUpperCase().trim());

  const tryMatch = (lineText) => {
    // 1. Exact match
    if (knownChapters.includes(lineText)) return cleanChapterName(lineText);

    // 2. Starts-with match (e.g. "RECTUM." or "EAR 608")
    //    Next char must NOT be comma (that would be a rubric qualifier)
    for (const chapter of knownChapters) {
      if (lineText.startsWith(chapter)) {
        const nextChar = lineText[chapter.length];
        if (!nextChar || nextChar === '.' || nextChar === ' ' || nextChar === ':') {
          return cleanChapterName(chapter);
        }
      }
    }

    // 3. Whole-word regex — only on short lines to avoid false positives
    for (const chapter of knownChapters) {
      if (lineText.length <= chapter.length + 5) {
        const pattern = new RegExp(`\\b${chapter}\\b`, 'i');
        if (pattern.test(lineText)) return cleanChapterName(chapter);
      }
    }

    // 4. After cleaning OCR artifacts
    const cleanedLine = cleanChapterName(lineText);
    if (knownChapters.includes(cleanedLine)) return cleanedLine;

    // 5. De-spaced version (e.g. "R E C T U M" → "RECTUM")
    const deSpaced = deSpace(lineText);
    if (knownChapters.includes(deSpaced)) return cleanChapterName(deSpaced);
    const cleanedDeSpaced = cleanChapterName(deSpaced);
    if (knownChapters.includes(cleanedDeSpaced)) return cleanedDeSpaced;

    return null;
  };

  // Scan the first 10 lines — chapter header only appears near the top.
  // Scanning further risks matching rubric headings (e.g. "CONSTIPATION" rubric
  // inside a RECTUM page) and misidentifying the chapter.
  for (const lineText of scanLines.slice(0, 10)) {
    const result = tryMatch(lineText);
    if (result) return result;
  }

  // If not found in top-strip, return UNKNOWN — Groq auto-detect will infer
  // the chapter from rubric content (see chapterInstruction in parseColumnTextWithGroq).
  return 'UNKNOWN';
};

/**
 * Structure raw OCR text from a single column using Groq AI (Llama 3.3 70B).
 * Very fast (~800ms), no vision token costs, and handles complex repertory formatting.
 *
 * @param {string} rawText          Raw OCR text from 1 column
 * @param {string} columnSide       "left" or "right"
 * @param {string} lastRubricContext Last rubric path from left column for header continuation
 * @param {string} detectedChapter  Chapter detected from page header (e.g., "RECTUM", "ABDOMEN")
 * @returns {Promise<Object|null>}   Parsed JSON object or null if unavailable
 */
const parseColumnTextWithGroq = async (rawText, columnSide = 'left', lastRubricContext = '', detectedChapter = 'UNKNOWN') => {
  // Collect all available Groq API keys (supports up to 5 keys via env vars)
  const apiKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean); // drop undefined/empty

  if (!apiKeys.length || !rawText || rawText.trim().length < 20) {
    return null;
  }

  try {
    const Groq = require('groq-sdk');

    const contextInstruction = lastRubricContext
      ? `CONTEXT FROM PREVIOUS (LEFT) COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a list of medicines or a comma-separated continuation header (e.g. "COLOR, redness, inside."), reconstruct the parent path from this context and use it for all sub-rubrics beneath it.`
      : '';
    
    const chapterInstruction = detectedChapter && detectedChapter !== 'UNKNOWN'
      ? `\n\n⚠️ CRITICAL CHAPTER ENFORCEMENT:\nThe page header indicates this is the "${detectedChapter}" chapter.\nYou MUST prefix ALL rubric paths with "${detectedChapter} - " at the beginning.\nExample: If you see "PAIN, pressing - evening", output: "${detectedChapter} - PAIN, pressing - evening"\n`
      : `\n\n⚠️ CHAPTER AUTO-DETECT REQUIRED:\nThe chapter header could not be read from the page scan. You MUST infer the chapter name from the rubric content (e.g. ABSCESS, CHOLERA, CONSTIPATION → "RECTUM"; PAIN, NOISES, DISCHARGE → context-dependent).\nSet chapter_en to the correct Kent's Repertory chapter name (e.g. "RECTUM", "ABDOMEN", "EAR", etc.).\nPrefix ALL rubric_en paths with that detected chapter name + " - ".\nNEVER output "UNKNOWN" as the chapter.\n`;

    const prompt = `You are a medical data extraction & spell-correction expert structuring raw Kent's Repertory OCR text from the ${columnSide.toUpperCase()} column.
${contextInstruction}${chapterInstruction}

--- CRITICAL REPERTORY TYPOGRAPHY & GRADING RULES ---
1. RUBRIC vs MEDICINE SEPARATION (CRITICAL):
   - Rubrics end at the colon (:)
   - Everything AFTER the colon is medicines, NOT part of the rubric
   - Example: "bed, in: Tod." → rubric = "bed, in" | medicine = "Tod."
   - Example: "sitting, while: Cale, Chin." → rubric = "sitting, while" | medicines = "Cale", "Chin"
   - NEVER include medicine names in rubric_en field!

2. CAPITALIZATION = GRADE 3 (BOLD):
   - In Kent's Repertory text OCR, if a medicine abbreviation STARTS WITH A CAPITAL LETTER (e.g., Mag-s, Mang, Lob, Bell, Lach, Cupr, Bor, Cann-i, Aloe, Acon, Spig, Sars, Am-c, Teucr, Calc, Bar-c, Nux-v, Benz-ac, Chin, Lyc, Ferr, All-c, Mez, Kreos, Act-sp, Puls), it is printed in BOLD font in the book. Assign grading = 3.
   - For lowercase medicine abbreviations:
     - Assign grading = 2 (Italic) if it is a major italicized remedy (e.g. acon, agar, alum, bell, calc, caust, chin, con, cupr, dros, dulc, graph, hep, kali-c, lach, laur, mag-c, mag-m, mang, meny, merc, nat-m, nit-ac, petr, phos-ac, plat, puls, rhodo, sabad, sep, sil, sulph).
     - Assign grading = 1 (Normal) for plain remedies (e.g. ant-t, aur, bar-c, bor, carl, cocc, mosch, rheum, selen, spong, stann, zinc).

3. MEDICINE NAMES:
   - Everything after the colon (:) on a rubric line is medicines. Extract them accurately.
   - Fix obvious OCR typos (e.g. Cale→Calc, Lye→Lyc, Sulpli→Sulph, WUX-V→Nux-v).
   - Clean trailing punctuation from medicine names.
   - Single lowercase abbreviations before a colon (berb, ina, calc) are medicines, NOT rubric qualifiers.

3B. JSON STRING ESCAPING:
   - Replace all double quotes (") inside string values with single quotes (').

4. CONTINUATION AT TOP OF COLUMN:
   - If the column text starts with a list of medicines (e.g., "mag-m., med., nat-s...") without any rubric heading, it is the CONTINUATION of the last rubric from the previous column ("${lastRubricContext}"). Group these medicines under "${lastRubricContext}"!

5. HIERARCHY & RUBRIC FORMAT:
   - "CHAPTER - MAIN RUBRIC, qualifier - sub-rubric"
   - Strip everything after colon (:) from rubric name
   - Example raw: "bed, in: Tod." → rubric_en = "${detectedChapter || 'EAR'} - PAIN - bed, in"
   - Example raw: "sitting, while: Cale, Chin." → rubric_en = "${detectedChapter || 'EAR'} - PAIN - sitting, while"

6. OUTPUT SCHEMA: Return ONLY valid JSON matching format:
{
  "chapter_en": "${detectedChapter || 'EAR'}",
  "data": [
    {
      "rubric_en": "${detectedChapter || 'EAR'} - NOISES, hissing",
      "medicines": [
        {"name": "Acon", "grading": 3},
        {"name": "agar", "grading": 2},
        {"name": "ant-t", "grading": 1}
      ]
    }
  ]
}

RAW OCR TEXT TO PARSE:
${rawText}`;

    // Multi-key × multi-model rotation across Groq keys.
    // Tries every (key, model) combination before giving up.
    // Add GROQ_API_KEY_2, GROQ_API_KEY_3 … in .env to multiply your effective quota.
    const models = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant'
    ];

    let completion = null;
    let lastErr = null;

    // ── Phase 1: Try all Groq keys ─────────────────────────────────────────
    outer:
    for (const apiKey of apiKeys) {
      const groq = new Groq({ apiKey });
      for (const model of models) {
        try {
          completion = await groq.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 3500,
            response_format: { type: 'json_object' }
          });
          break outer; // success
        } catch (e) {
          lastErr = e;
          const isRetryable = e.message.includes('413') || e.message.includes('429')
            || e.message.includes('rate_limit') || e.message.includes('too large')
            || e.message.includes('decommissioned') || e.message.includes('not supported')
            || e.message.includes('does not exist') || e.message.includes('model_not_found');
          if (isRetryable) {
            const keyLabel = `key${apiKeys.indexOf(apiKey) + 1}`;
            console.warn(`[Groq Structurer] ${model} (${keyLabel}) unavailable (${e.message.slice(0, 80)}), trying next...`);
            await new Promise(r => setTimeout(r, 500));
          } else {
            throw e;
          }
        }
      }
    }

    // ── Phase 2: Cerebras AI fallback (free tier, generous limits) ─────────
    // Sign up at cloud.cerebras.ai → add CEREBRAS_API_KEY to .env
    if (!completion && process.env.CEREBRAS_API_KEY) {
      console.warn('[Groq Structurer] All Groq keys exhausted — trying Cerebras AI fallback...');
      const cerebrasModels = ['llama3.1-70b', 'llama3.1-8b'];
      for (const cModel of cerebrasModels) {
        try {
          const https = require('https');
          const body = JSON.stringify({
            model: cModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 3500,
            response_format: { type: 'json_object' }
          });
          const cerebrasResp = await new Promise((resolve, reject) => {
            const req = https.request({
              hostname: 'api.cerebras.ai',
              path: '/v1/chat/completions',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
                'Content-Length': Buffer.byteLength(body)
              }
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Cerebras parse error: ' + data.slice(0, 100))); }
              });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
          });
          if (cerebrasResp.choices?.[0]?.message?.content) {
            console.log(`[Groq Structurer] ✅ Cerebras ${cModel} succeeded.`);
            const text = completion?.choices?.[0]?.message?.content || cerebrasResp.choices[0].message.content;
            return JSON.parse(cerebrasResp.choices[0].message.content);
          }
        } catch (ce) {
          const isRetryable = ce.message.includes('429') || ce.message.includes('rate_limit');
          console.warn(`[Cerebras] ${cModel} failed: ${ce.message.slice(0, 80)}${isRetryable ? ', trying next...' : ''}`);
          if (!isRetryable) break;
        }
      }
    }

    if (!completion) throw lastErr || new Error('All AI providers exhausted (Groq + Cerebras)');

    const text = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[Groq Structurer] Column pass (${columnSide}) error:`, err.message);
    return null;
  }
};

// Deterministic OCR spell correction map — applied as final safety net after Groq
const MEDICINE_CORRECTIONS = {
  // NUX variants
  'NWX-PL': 'Nux-pl', 'WUX-V': 'Nux-v', 'nuzx-v': 'Nux-v', 'Nuw-v': 'Nux-v',
  'nuv-x': 'Nux-v', 'nxv': 'Nux-v', 'nux-pl': 'Nux-pl',
  // SULPH variants
  'Sulpli': 'Sulph', 'sulpli': 'Sulph', 'Suiph': 'Sulph', 'suiph': 'Sulph', 'Sul-ph': 'Sulph',
  // CALC variants
  'Cale': 'Calc', 'cale': 'Calc', 'Cale-s': 'Calc-s', 'cale-s': 'Calc-s', 'Cale-p': 'Calc-p',
  // LYC
  'Lye': 'Lyc', 'lye': 'Lyc',
  // CON
  'Corn': 'Con', 'corn': 'Con',
  // ZINC
  'Zine': 'Zinc', 'zine': 'Zinc',
  // IGN
  'Igz': 'Ign', 'igz': 'Ign',
  // CAUST
  'Caus': 'Caust', 'caus': 'Caust', 'cautl': 'Caust', 'Cautl': 'Caust',
  // NAT-M variants
  'Unal-m': 'Nat-m', 'unal-m': 'Nat-m', 'nat-nt': 'Nat-m', 'Nat-nt': 'Nat-m',
  // KALI-BI variants
  'Kali-6i': 'Kali-bi', 'kali-6i': 'Kali-bi', 'Kali-br': 'Kali-bi',
  // LIL-T variants
  'Lil-L': 'Lil-t', 'lil-L': 'Lil-t', 'lilt': 'Lil-t', 'Lil-l': 'Lil-t',
  // ANT-C variants
  'Aut-c': 'Ant-c', 'aut-c': 'Ant-c', 'antc': 'Ant-c',
  // RHUS-T variants
  'rhust': 'Rhus-t', 'rkus-L': 'Rhus-t', 'Rhus-L': 'Rhus-t', 'Rhus-l': 'Rhus-t',
  // NIT-AC
  'Nil-ac': 'Nit-ac', 'nil-ac': 'Nit-ac',
  // MISC
  'Amme': 'Am-m', 'amme': 'Am-m', 'Asm-m': 'Am-m', 'asm-m': 'Am-m',
  'wmbr': 'Ambr', 'pals': 'Puls', 'Ran-sc': 'Ran-s', 'Staun': 'Stann', 'staun': 'Stann',
  'cerb-an': 'Carb-an', 'Cerb-an': 'Carb-an', 'gral': 'Grat', 'Gral': 'Grat',
  'azs': 'Ars', 'Azs': 'Ars', 'vil-ac': 'Bil-ac', 'pl-ac': 'Ph-ac',
  'Peon': 'Paeon', 'sol-t-=': 'Sol-t', 'Sol-t-=': 'Sol-t',
  'am.c': 'Am-c', 'amam': 'Am-m', 'eup-per': 'Eup-per',
  'rkus-l': 'Rhus-t', 'Lye-c': 'Lyc', 'cauth': 'Canth', 'Cauth': 'Canth',
  // CANTH
  'cauth': 'Canth', 'unal': 'Nat-m',
  // Zsc / Asc
  'Zsc': 'Asc', 'zsc': 'Asc',
  // ina / Ina (OCR misread of "ign" or start of medicine list)
  'ina': 'Ign',
};

/**
 * Apply deterministic spell correction to a medicine name.
 * @param {string} name - Raw medicine name
 * @returns {string} - Corrected medicine name
 */
const correctMedicineName = (name) => {
  if (!name) return name;
  // Strip trailing garbage characters first
  const cleaned = name.replace(/[.,;:=\-]+$/, '').trim();
  return MEDICINE_CORRECTIONS[cleaned] || MEDICINE_CORRECTIONS[cleaned.toLowerCase()] || cleaned;
};

/**
 * Convert structured Groq JSON output into flat database rows.
 */
const convertGroqJsonToRows = (parsedJson, fallbackChapter = '') => {
  if (!parsedJson) return [];
  const rows = [];
  const chapter = (parsedJson.chapter_en || fallbackChapter || 'UNKNOWN').toUpperCase();
  const data = Array.isArray(parsedJson.data) ? parsedJson.data : (Array.isArray(parsedJson) ? parsedJson : []);

  for (const item of data) {
    const rubric_en = item.rubric_en || item.rubric || '';
    if (!rubric_en) continue;

    const medicines = item.medicines || [];
    for (const medObj of medicines) {
      const medName = typeof medObj === 'string' ? medObj : (medObj.name || '');
      const cleanMed = correctMedicineName(medName.replace(/\.$/, '').trim());
      if (!cleanMed) continue;

      rows.push({
        chapter_en: chapter,
        chapter_hi: '',
        rubric_en: rubric_en,
        rubric_hi: '',
        medicine: cleanMed,
        grading: typeof medObj === 'object' ? (medObj.grading || 1) : 1
      });
    }
  }
  return rows;
};

/**
 * Main export: Process Kent Repertory image using Physical Multi-Column Crop + Groq LLM Structuring.
 * Uses deterministic rule-based fallback if Groq API is unavailable.
 *
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<Array>} - Structured medicine-rubric rows
 */
const parseImageWithTesseract = async (imagePath) => {
  const tempDir = path.dirname(imagePath);
  console.log(`[Kent Multi-Column Parser] Processing: ${path.basename(imagePath)}`);

  // Step 0: OCR the top strip of the ORIGINAL image first — the chapter running
  // header (e.g. "RECTUM.") is CENTERED on the full page. Column splitting cuts
  // it in half, so we must read it before the split.
  let detectedChapter = 'UNKNOWN';
  try {
    const stripText = await extractTopStripText(imagePath, tempDir);
    console.log(`[Kent Multi-Column Parser] Top-strip OCR: "${stripText.replace(/\n/g, ' ').trim().slice(0, 80)}"`);
    detectedChapter = extractChapterFromHeader(stripText);
  } catch (stripErr) {
    console.warn('[Kent Multi-Column Parser] Top-strip OCR failed:', stripErr.message);
  }

  // Step 1: Physical image split + Tesseract OCR on Left & Right columns
  let leftText = '', rightText = '', leftPath = '', rightPath = '';
  try {
    const columnOcr = await extractColumnTextsFromImage(imagePath, tempDir);
    leftText = columnOcr.leftText;
    rightText = columnOcr.rightText;
    leftPath = columnOcr.leftPath;
    rightPath = columnOcr.rightPath;
  } catch (err) {
    console.warn('[Kent Multi-Column Parser] Column split failed, falling back to full-page OCR:', err.message);
    const fullOcr = await extractTextFromImage(imagePath, tempDir);
    leftText = fullOcr.ocrText;
  }

  // Step 1.5: If top-strip didn't find the chapter, fall back to column OCR text
  if (detectedChapter === 'UNKNOWN') {
    const fromLeft  = extractChapterFromHeader(leftText);
    const fromRight = extractChapterFromHeader(rightText);
    detectedChapter = fromLeft !== 'UNKNOWN' ? fromLeft : fromRight;
  }

  console.log(`[Kent Multi-Column Parser] Page chapter: ${detectedChapter}`);
  const allResults = [];
  const seenKeys = new Set();

  const addRows = (rows) => {
    for (const row of rows) {
      const key = `${row.rubric_en}|||${row.medicine}`.toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allResults.push(row);
      }
    }
  };

  // Step 2: Process LEFT then RIGHT column sequentially to halve API rate-limit pressure.
  // Concurrent calls double the simultaneous requests and exhaust quota faster.
  let groqSuccess = false;
  if ((process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY) &&
      (leftText.trim().length > 30 || rightText.trim().length > 30)) {
    console.log('[Kent Multi-Column Parser] Structuring columns sequentially with AI...');

    const leftJson  = leftText.trim().length  > 30
      ? await parseColumnTextWithGroq(leftText,  'left',  '',             detectedChapter)
      : null;

    // Brief pause between API calls to stay within per-minute token limits
    if (leftJson && rightText.trim().length > 30) {
      await new Promise(r => setTimeout(r, 1200));
    }

    const rightJson = rightText.trim().length > 30
      ? await parseColumnTextWithGroq(rightText, 'right', '', detectedChapter)
      : null;

    const leftRows = convertGroqJsonToRows(leftJson);
    const rightRows = convertGroqJsonToRows(rightJson);

    if (leftRows.length > 0) {
      addRows(leftRows);
      groqSuccess = true;
      console.log(`[Kent Multi-Column Parser] Left column: ${leftRows.length} rows extracted via Groq.`);

      // Attach overflow from right column if right column started with continuation under last left rubric
      const lastLeftRubric = leftRows[leftRows.length - 1]?.rubric_en || '';
      if (rightRows.length > 0 && lastLeftRubric) {
        for (const rRow of rightRows) {
          if (rRow.rubric_en && (rRow.rubric_en.includes('CONTINUATION') || rRow.rubric_en === 'UNKNOWN')) {
            rRow.rubric_en = lastLeftRubric;
          }
        }
      }
    }

    if (rightRows.length > 0) {
      addRows(rightRows);
      groqSuccess = true;
      console.log(`[Kent Multi-Column Parser] Right column: ${rightRows.length} rows extracted via Groq.`);
    } else if (leftRows.length > 0 && rightText.trim().length > 30) {
      // FALLBACK: Left succeeded but right failed (Groq quota exhausted)
      console.warn('[Kent Multi-Column Parser] ⚠️ Right column Groq failed, using rule-based parser as fallback...');
      const rightRuleResults = parseKentOcrTextAdvanced(rightText);
      if (rightRuleResults.length > 0) {
        // Force detected chapter on rule-based results
        rightRuleResults.forEach(row => {
          if (detectedChapter && detectedChapter !== 'UNKNOWN') {
            row.chapter_en = detectedChapter;
            if (row.rubric_en && !row.rubric_en.toUpperCase().startsWith(detectedChapter + ' - ')) {
              const rubricWithoutChapter = row.rubric_en.replace(/^[A-Z]+\s*-\s*/, '');
              row.rubric_en = `${detectedChapter} - ${rubricWithoutChapter}`;
            }
          }
        });
        addRows(rightRuleResults);
        console.log(`[Kent Multi-Column Parser] Right column: ${rightRuleResults.length} rows extracted via fallback parser.`);
      }
    }
  }

  // Step 4: Fallback to deterministic rule-based parsing if Groq is unavailable or returned 0 rows
  if (allResults.length === 0) {
    console.log('[Kent Multi-Column Parser] Groq unavailable/empty. Falling back to deterministic rule parser...');
    const combinedOcrText = `${leftText}\n${rightText}`;
    const ruleResults = parseKentOcrTextAdvanced(combinedOcrText);
    addRows(ruleResults);
  }

  // Cleanup temporary column crop images IMMEDIATELY to free memory
  try {
    if (leftPath && fs.existsSync(leftPath)) fs.unlinkSync(leftPath);
    if (rightPath && fs.existsSync(rightPath)) fs.unlinkSync(rightPath);
  } catch (err) {
    console.warn('[Kent Multi-Column Parser] Failed to cleanup temp files:', err.message);
  }
  
  // Force garbage collection hint
  if (global.gc) global.gc();

  if (allResults.length === 0) {
    throw new Error('Could not extract any valid medicine rubrics from the image.');
  }

  // Step 5: CRITICAL - ABSOLUTE CHAPTER ENFORCEMENT
  // Force detected chapter on ALL rows, regardless of what AI extracted
  // This prevents mid-page chapter changes (e.g., THROAT → JAW bug)
  if (detectedChapter && detectedChapter !== 'UNKNOWN') {
    console.log(`[Kent Multi-Column Parser] Enforcing chapter consistency: ${detectedChapter}`);
    
    for (const row of allResults) {
      // Force the detected chapter (override AI's guess)
      row.chapter_en = detectedChapter;
      
      // Ensure rubric starts with the chapter
      if (row.rubric_en && !row.rubric_en.toUpperCase().startsWith(detectedChapter + ' - ')) {
        // Remove any incorrect chapter prefix the AI might have added
        let rubricWithoutChapter = row.rubric_en;
        
        // Strip common incorrect chapter patterns (e.g., "JAW - HAWK" → "HAWK")
        const incorrectPrefixPattern = /^[A-Z]+\s*-\s*/;
        rubricWithoutChapter = rubricWithoutChapter.replace(incorrectPrefixPattern, '');
        
        // Add correct chapter prefix
        row.rubric_en = `${detectedChapter} - ${rubricWithoutChapter}`;
      }
    }
  }

  console.log(`[Kent Multi-Column Parser] ✅ Success: ${allResults.length} unique medicine-rubric rows extracted!`);
  return allResults;
};

module.exports = {
  parseImageWithTesseract,
  parseTesseractOcrWithRules: parseImageWithTesseract
};

