'use strict';

const { extractColumnTextsFromImage, extractTextFromImage, extractTopStripText, runOCRWithLineLayout } = require('./kentOcrService');
const { parseKentOcrTextAdvanced } = require('./kentTextParser');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

// Vision is excellent at preserving the remedy spelling/case, but it is not
// dependable at emitting the grading number consistently for every item in a
// 60+ remedy list.  Kent's printed edition encodes the grade in that case:
// initial capital = bold (3); the known lowercase italic remedies = 2; the
// remaining lowercase remedies are normal (1).  Apply this in one place to
// every AI path rather than trusting a model to classify a whole list at once.
const KENT_ITALIC_REMEDIES = new Set([
  'acon', 'agar', 'alum', 'all-c', 'am-c', 'am-m', 'anac', 'apis', 'arn',
  'bell', 'berb', 'bry', 'calc', 'caust', 'chel', 'chin', 'con', 'cupr',
  'dulc', 'graph', 'hep', 'ign', 'kali-c', 'kali-bi', 'lach', 'laur', 'lyc',
  'mag-c', 'mag-m', 'mang', 'merc', 'nat-c', 'nat-m', 'nat-s', 'nit-ac',
  'nux-v', 'nux-m', 'phos', 'phos-ac', 'plat', 'puls', 'rhodo', 'ruta',
  'sabad', 'sep', 'sil', 'sulph', 'thuj', 'valer', 'verat'
]);

const inferKentGrading = (medicineName, aiGrading = null) => {
  if (typeof aiGrading === 'number' && aiGrading >= 1 && aiGrading <= 3) {
    return aiGrading;
  }
  const name = (medicineName || '').trim().replace(/^[^A-Za-zÆŒæœ]+/, '');
  if (!name) return 1;

  return KENT_ITALIC_REMEDIES.has(name.toLowerCase()) ? 2 : 1;
};

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

    // Kent Structure Knowledge Base - Common patterns to guide AI
    const kentStructureKnowledge = detectedChapter === 'HEAD' 
      ? `\n\n🧠 KENT HEAD CHAPTER STRUCTURE KNOWLEDGE:
The HEAD chapter has specific main rubrics that are ALWAYS present in the hierarchy:

CRITICAL: "PAIN" is the LARGEST and MOST COMMON main rubric in HEAD chapter.
Almost ALL modality sub-rubrics (weather, cold, damp, heat, touch, pressure, motion, etc.) belong under "HEAD - PAIN".

Common HEAD - PAIN sub-rubrics you WILL encounter:
- HEAD - PAIN - sudden (with nested: go/decreasing/micturition/summer/sun/swallowing/talking/tea)
- HEAD - PAIN - weather, from changes of (with nested: cloudy/cold/damp, cold/dry, cold/warm/wet)
- HEAD - PAIN - touch agg. (with nested: on vertex/amel.)
- HEAD - PAIN - walking (with nested: in open air/rapidly/while/after)
- HEAD - PAIN - temperature (with nested: changes of)
- HEAD - PAIN - stooping
- HEAD - PAIN - turning body/eyes/head
- HEAD - PAIN - twilight
- HEAD - PAIN - twitching

⚠️ IF YOU SEE RUBRICS LIKE:
- "weather, from changes of" / "cloudy" / "cold" / "damp" / "dry" / "warm"
- "touch" / "pressure" / "stooping" / "walking" / "turning"
- "temperature" / "twilight" / "twitching"

WITHOUT a clear parent rubric, they are ALWAYS sub-rubrics of "PAIN"!

CORRECT PATH CONSTRUCTION:
❌ Wrong: "HEAD - weather, from changes of"
✅ Right: "HEAD - PAIN - weather, from changes of"

❌ Wrong: "HEAD - cloudy"  
✅ Right: "HEAD - PAIN - weather, from changes of - cloudy"

❌ Wrong: "HEAD - cold"
✅ Right: "HEAD - PAIN - weather, from changes of - cold"

❌ Wrong: "HEAD - touch"
✅ Right: "HEAD - PAIN - touch agg."

Other HEAD main rubrics (less common): HEAVINESS, HEAT, ITCHING, CONGESTION, ERUPTIONS, PULSATING, SWELLING
`
      : detectedChapter === 'ABDOMEN'
      ? `\n\n🧠 KENT ABDOMEN CHAPTER STRUCTURE KNOWLEDGE:
Main rubrics in ABDOMEN: PAIN (most common), DISTENTION, FLATULENCE, FULLNESS, RUMBLING, TENSION
If you see modality rubrics (motion, pressure, eating, etc.) without a parent, they belong under "PAIN".
`
      : detectedChapter === 'CHEST'
      ? `\n\n🧠 KENT CHEST CHAPTER STRUCTURE KNOWLEDGE:
Main rubrics in CHEST: PAIN (most common), OPPRESSION, PALPITATION, CONSTRICTION, ANXIETY
Modality sub-rubrics (coughing, breathing, motion, etc.) belong under appropriate main rubric.
`
      : detectedChapter === 'EXTREMITIES'
      ? `\n\n🧠 KENT EXTREMITIES CHAPTER STRUCTURE KNOWLEDGE:
Main rubrics in EXTREMITIES: PAIN (most common), COLDNESS, HEAT, HEAVINESS, NUMBNESS, STIFFNESS, WEAKNESS
Location sub-rubrics specify body parts (fingers, knee, ankle, etc.) under the main rubric.
`
      : ''; // No special knowledge for other chapters

    const prompt = `You are a medical data extraction & spell-correction expert structuring raw Kent's Repertory OCR text from the ${columnSide.toUpperCase()} column.
${contextInstruction}${chapterInstruction}${kentStructureKnowledge}

--- CRITICAL REPERTORY TYPOGRAPHY & GRADING RULES ---
1. RUBRIC vs MEDICINE SEPARATION (CRITICAL):
   - Rubrics end at the colon (:)
   - Everything AFTER the colon is medicines, NOT part of the rubric
   - Example: "bed, in: Tod." → rubric = "bed, in" | medicine = "Tod."
   - Example: "sitting, while: Cale, Chin." → rubric = "sitting, while" | medicines = "Cale", "Chin"
   - NEVER include medicine names in rubric_en field!

1B. MULTI-LINE RUBRICS & MEDICINES (CRITICAL):
   - Kent rubrics often span MULTIPLE LINES with medicines continuing on subsequent lines
   - Example:
     "menses, before: Ant-c., bry., graph., Kali-c.,
      lach., mag-c., nat-s., nux-v., Sil., sulph."
   - Collect ALL medicines from continuation lines (indented lines following the rubric)
   - Continue until you see a NEW rubric (line with colon) or blank line

1C. CROSS-REFERENCES (MUST INCLUDE):
   - Lines like "difficult stool (see 'Inactivity')" are VALID rubrics
   - Extract the rubric part before the cross-reference
   - Example: "difficult stool (see 'Inactivity'): Æsc., agar., ..." → rubric = "difficult stool"
   - DO NOT skip these - they are important rubric entries!

1D. STANDALONE RUBRIC LINES:
   - Some rubrics appear on their own line with medicines on the NEXT line
   - Example:
     "painful:"
     "  Aloe, alum., ang., apis, ..."
   - These are VALID rubrics - collect them with their medicines

1E. COMPLETE EXTRACTION REQUIREMENT:
   - You MUST extract EVERY rubric you see in the text
   - Do NOT skip rubrics that have cross-references like "(See 'xyz')"
   - Do NOT skip rubrics with medicines on multiple lines
   - Do NOT skip rubrics with special characters or formatting
   - GOAL: Extract 100% of rubrics, not just the easy ones!

2. CAPITALIZATION = GRADE 3 (BOLD):
   - In Kent's Repertory text OCR, if a medicine abbreviation STARTS WITH A CAPITAL LETTER (e.g., Mag-s, Mang, Lob, Bell, Lach, Cupr, Bor, Cann-i, Aloe, Acon, Spig, Sars, Am-c, Teucr, Calc, Bar-c, Nux-v, Benz-ac, Chin, Lyc, Ferr, All-c, Mez, Kreos, Act-sp, Puls), it is printed in BOLD font in the book. Assign grading = 3.
   - For lowercase medicine abbreviations:
     - Assign grading = 2 (Italic) if it is a major italicized remedy (e.g. acon, agar, alum, bell, calc, caust, chin, con, cupr, dros, dulc, graph, hep, kali-c, lach, laur, mag-c, mag-m, mang, meny, merc, nat-m, nit-ac, petr, phos-ac, plat, puls, rhodo, sabad, sep, sil, sulph).
     - Assign grading = 1 (Normal) for plain remedies (e.g. ant-t, aur, bar-c, bor, carl, cocc, mosch, rheum, selen, spong, stann, zinc).

3. MEDICINE NAMES:
   - Everything after the colon (:) on a rubric line is medicines. Extract them accurately.
   - Collect ALL medicines from ALL continuation lines below the rubric
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
   - Remove cross-references like "(See 'xyz')" from rubric name, but keep the base rubric
   - Example raw: "bed, in: Tod." → rubric_en = "${detectedChapter || 'HEAD'} - PAIN - bed, in"
   - Example raw: "sitting, while: Cale, Chin." → rubric_en = "${detectedChapter || 'HEAD'} - PAIN - sitting, while"
   - Example raw: "difficult stool (see 'Inactivity'): Æsc., ..." → rubric_en = "${detectedChapter || 'HEAD'} - CONSTIPATION - difficult stool"

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

    // ── Phase 1: OpenAI Primary (gpt-4o-mini) ─────────────────────────────
    // Strong hierarchy reasoning needed for Kent Repertory extraction
    if (process.env.OPENAI_API_KEY) {
      try {
        const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        console.log(`[Groq Structurer] Trying OpenAI ${modelName} as primary...`);
        const https = require('https');
        const body = JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 3500,
          response_format: { type: 'json_object' }
        });
        const openAIResp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Length': Buffer.byteLength(body)
            }
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); }
              catch (e) { reject(new Error('OpenAI parse error: ' + data.slice(0, 100))); }
            });
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
        
        if (openAIResp.choices?.[0]?.message?.content) {
          console.log(`[Groq Structurer] ✅ OpenAI gpt-4o succeeded.`);
          const parsedData = JSON.parse(openAIResp.choices[0].message.content);
          return validateAndFixKentPaths(parsedData, detectedChapter);
        } else if (openAIResp.error) {
          console.warn(`[OpenAI] Failed: ${openAIResp.error.message}`);
        }
      } catch (oe) {
        console.warn(`[OpenAI] Failed: ${oe.message.slice(0, 80)}`);
      }
    }

    // ── Phase 2: Try all Groq keys (Fallback) ─────────────────────────────────────────
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

    // ── Phase 3: Cerebras AI fallback (free tier, generous limits) ─────────
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
            const parsedData = JSON.parse(cerebrasResp.choices[0].message.content);
            return validateAndFixKentPaths(parsedData, detectedChapter);
          }
        } catch (ce) {
          const isRetryable = ce.message.includes('429') || ce.message.includes('rate_limit');
          console.warn(`[Cerebras] ${cModel} failed: ${ce.message.slice(0, 80)}${isRetryable ? ', trying next...' : ''}`);
          if (!isRetryable) break;
        }
      }
    }

    if (!completion) throw lastErr || new Error('All AI providers exhausted (OpenAI + Groq + Cerebras)');
    const text = completion.choices[0]?.message?.content || '{}';
    const parsedData = JSON.parse(text);
    
    // Post-validation: Fix common path errors
    return validateAndFixKentPaths(parsedData, detectedChapter);
  } catch (err) {
    console.warn(`[Groq Structurer] Column pass (${columnSide}) error:`, err.message);
    return null;
  }
};

/**
 * Post-validation: Automatically fix common Kent path construction errors
 * This catches issues where AI drops intermediate sections like "PAIN"
 */
const validateAndFixKentPaths = (data, chapter) => {
  if (!data || !data.data || !Array.isArray(data.data)) {
    return data;
  }

  // Valid Kent chapters - any chapter not in this list is suspicious
  const VALID_KENT_CHAPTERS = new Set([
    'MIND', 'VERTIGO', 'HEAD', 'EYE', 'VISION', 'EAR', 'HEARING', 'NOSE', 'FACE',
    'MOUTH', 'TEETH', 'THROAT', 'EXTERNAL THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM',
    'STOOL', 'BLADDER', 'KIDNEY', 'PROSTATE GLAND', 'URETHRA', 'URINE',
    'MALE GENITALIA', 'FEMALE GENITALIA', 'LARYNX AND TRACHEA', 'RESPIRATION',
    'COUGH', 'EXPECTORATION', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'CHILL',
    'FEVER', 'PERSPIRATION', 'SKIN', 'GENERALITIES'
  ]);

  // Validate chapter
  if (data.chapter_en && !VALID_KENT_CHAPTERS.has(data.chapter_en.toUpperCase())) {
    console.warn(`[Path Validation] ⚠️ Invalid chapter detected: "${data.chapter_en}" (not in Kent's 37 chapters)`);
    
    // If we have a detected chapter from page header, use it
    if (chapter && VALID_KENT_CHAPTERS.has(chapter.toUpperCase())) {
      console.log(`[Path Validation] Correcting chapter from "${data.chapter_en}" to "${chapter}"`);
      data.chapter_en = chapter;
    }
  }

  let fixedCount = 0;
  
  data.data.forEach(entry => {
    if (!entry.rubric_en) return;
    
    const originalPath = entry.rubric_en;
    let fixedPath = originalPath;
    
    // ═══ HEAD CHAPTER VALIDATION ═══
    if (chapter === 'HEAD') {
      // Fix 1: Weather modalities missing PAIN
      // Pattern: "HEAD - weather|cloudy|cold|damp|dry|warm|heat" → Add "PAIN -"
      if (/^HEAD\s*-\s*(weather|cloudy|cold|damp|dry|warm|heat|sun|shade|temperature)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(HEAD\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Weather modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      
      // Fix 1b: Nested weather sub-rubrics missing "weather, from changes of" parent
      // Pattern: "HEAD - cloudy|cold" alone → Should be "HEAD - PAIN - weather, from changes of - cloudy|cold"
      if (/^HEAD\s*-\s*(cloudy)$/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^HEAD\s*-\s*cloudy$/i, 'HEAD - PAIN - weather, from changes of - cloudy');
        console.log(`[Path Fix] Cloudy weather: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      if (/^HEAD\s*-\s*cold$/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^HEAD\s*-\s*cold$/i, 'HEAD - PAIN - weather, from changes of - cold');
        console.log(`[Path Fix] Cold weather: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      if (/^HEAD\s*-\s*damp,\s*cold$/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^HEAD\s*-\s*damp,\s*cold$/i, 'HEAD - PAIN - weather, from changes of - cold - damp, cold');
        console.log(`[Path Fix] Damp cold weather: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      if (/^HEAD\s*-\s*dry,\s*cold$/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^HEAD\s*-\s*dry,\s*cold$/i, 'HEAD - PAIN - weather, from changes of - cold - dry, cold');
        console.log(`[Path Fix] Dry cold weather: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      
      // Fix 2: Motion/position modalities missing PAIN
      // Pattern: "HEAD - stooping|walking|turning|lying|sitting|standing|rising" → Add "PAIN -"
      if (/^HEAD\s*-\s*(stooping|walking|turning|lying|sitting|standing|rising|bending|moving)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(HEAD\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Motion modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      
      // Fix 3: Touch/pressure modalities missing PAIN
      // Pattern: "HEAD - touch|pressure|rubbing|scratching" → Add "PAIN -"
      if (/^HEAD\s*-\s*(touch|pressure|rubbing|scratching|binding|combing)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(HEAD\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Touch modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      
      // Fix 4: Time modalities missing PAIN
      // Pattern: "HEAD - morning|evening|night|afternoon|twilight" → Add "PAIN -"  
      if (/^HEAD\s*-\s*(morning|evening|night|afternoon|twilight|midnight|noon)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(HEAD\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Time modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
      
      // Fix 5: "sudden" sub-rubrics missing PAIN
      // Pattern: "HEAD - sudden" or "HEAD - talking|swallowing|thinking" alone → Add "PAIN -"
      if (/^HEAD\s*-\s*(sudden|talking|swallowing|thinking|twitching)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(HEAD\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Sudden/misc modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
    }
    
    // ═══ ABDOMEN CHAPTER VALIDATION ═══
    if (chapter === 'ABDOMEN') {
      // Fix: Modalities without PAIN parent
      if (/^ABDOMEN\s*-\s*(motion|pressure|eating|drinking|stool|menses)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(ABDOMEN\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Abdomen modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
    }
    
    // ═══ CHEST CHAPTER VALIDATION ═══
    if (chapter === 'CHEST') {
      // Fix: Modalities without PAIN parent
      if (/^CHEST\s*-\s*(coughing|breathing|motion|inspiration|expiration)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(CHEST\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Chest modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
    }
    
    // ═══ EXTREMITIES CHAPTER VALIDATION ═══
    if (chapter === 'EXTREMITIES') {
      // Fix: Modalities without PAIN parent
      if (/^EXTREMITIES\s*-\s*(motion|touch|walking|ascending|descending)/i.test(fixedPath) &&
          !/PAIN/i.test(fixedPath)) {
        fixedPath = fixedPath.replace(/^(EXTREMITIES\s*-\s*)/, '$1PAIN - ');
        console.log(`[Path Fix] Extremities modality: "${originalPath}" → "${fixedPath}"`);
        fixedCount++;
      }
    }
    
    // Update the entry if path was fixed
    if (fixedPath !== originalPath) {
      entry.rubric_en = fixedPath;
    }
  });
  
  if (fixedCount > 0) {
    console.log(`[Path Validation] ✅ Fixed ${fixedCount} path(s) automatically`);
  }
  
  return data;
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
  // ── Additions from RECTUM chapter OCR review ──────────────────────────
  // Camph variants
  'Qamph': 'Camph', 'qamph': 'Camph', 'Qamb': 'Camph',
  // Ipecac (italic "i" misread as "7" or similar)
  '7p': 'ip', '7P': 'ip',
  // Kreos
  '£7eos': 'Kreos', '£7e0s': 'Kreos', 'kreos': 'Kreos',
  // Mosch
  'M0Sch': 'Mosch', 'M0sch': 'Mosch', 'MOSch': 'Mosch',
  // Meny
  'wmeny': 'Meny', 'wmcny': 'Meny',
  // Stann
  'Sstann': 'Stann', 'sstann': 'Stann',
  // Tarent
  'larent': 'Tarent', 'Larent': 'Tarent',
  // Tuberc
  'fuberc': 'Tuberc', 'Fuberc': 'Tuberc',
  // Sul-ac
  'sw/-ac': 'Sul-ac', 'Sw/-ac': 'Sul-ac', 'sul-ac': 'Sul-ac',
  // Cimic
  'c¢imic': 'Cimic', 'C¢imic': 'Cimic',
  // Iod
  'Zod': 'Iod', 'zod': 'Iod', 'tod': 'Iod',
  // Merc-i-f
  '#nerc-i-f': 'Merc-i-f', '#Nerc-i-f': 'Merc-i-f',
  // Bry
  '67y': 'Bry', '67Y': 'Bry',
  // Dig
  'dsg': 'Dig', 'dSg': 'Dig',
  // Nat-m
  'natn': 'Nat-m', 'Natn': 'Nat-m', '#ua-m': 'Nat-m',
  // Sulph (more)
  'Sw/ph': 'Sulph', 'sw/ph': 'Sulph',
  // Mur-ac
  'MQ@uc': 'Mur-ac', 'mq@uc': 'Mur-ac',
  // Nux-m
  '#ax-m2': 'Nux-m', '#Ax-m2': 'Nux-m',
  // Abrot
  'Aérof': 'Abrot', 'aérof': 'Abrot',
  // Crot-l
  'crol-L': 'Crot-l', 'Crol-L': 'Crot-l', 'crol-l': 'Crot-l',
  // Elat
  'elal': 'Elat', 'Elal': 'Elat',
  // Ass (arsen)
  'ass': 'Ars',
  // Laur
  'lanr': 'Laur', 'Lanr': 'Laur',
  // Guaj
  'g»aj': 'Guaj', 'G»aj': 'Guaj',
  // Plb
  'pib': 'Plb', 'Pib': 'Plb',
  // Ptel
  'plel': 'Ptel', 'Plel': 'Ptel',
  // Am-c
  'aw': 'Am-c',
  // Hydr
  'hydre': 'Hydr',
  // Cupr-ac
  'cupr-ac': 'Cupr-ac',
  // Labac (tabac)
  'labac': 'Tabac', 'Labac': 'Tabac',
  // Anr (aur)
  'anr': 'Aur',
  // Sfaph (staph)
  'sfaph': 'Staph', 'Sfaph': 'Staph',
  // Calc-ph (calc-p)
  'caleph': 'Calc-p', 'Caleph': 'Calc-p',
  // Murx
  'Murx': 'Murx',
  // New OCR Typos from RECTUM & HEAD
  'ann-m': 'Am-m', 'Ann-m': 'Am-m',
  'nice': 'Nicc', 'Nice': 'Nicc',
  'coc-t': 'Coc-c', 'Coc-t': 'Coc-c',
  'anbr': 'Ambr', 'Anbr': 'Ambr',
  'ani-c': 'Am-c', 'Ani-c': 'Am-c',
  'clan': 'Chin-s', 'Clan': 'Chin-s',
  'mercy-c': 'Merc-cy', 'Mercy-c': 'Merc-cy',
  'sol-tæ': 'Sol-t-ae', 'Sol-tæ': 'Sol-t-ae',
  'poïo': 'Podo', 'poio': 'Podo', 'Poïo': 'Podo',
  'muac': 'Manc', 'Muac': 'Manc',
  'acou': 'Acon', 'Acou': 'Acon',
  'alumnu': 'Alumn', 'Alumnu': 'Alumn',
  // Audited Kent Repertory OCR spell corrections
  'ziuc': 'Zinc', 'ziinc': 'Zinc', 'Ziuc': 'Zinc', 'Ziinc': 'Zinc',
  'curl': 'Carl', 'Curl': 'Carl',
  'chain': 'Chin', 'Chain': 'Chin',
  'kalin': 'Kalm', 'Kalin': 'Kalm',
  'iudg': 'Indg', 'Iudg': 'Indg',
  'oslin': 'Osm', 'Oslin': 'Osm',
  'ann-c': 'Am-c', 'Ann-c': 'Am-c',
  'arumd': 'Arum-t', 'Arumd': 'Arum-t',
  'nal-m': 'Nat-m', 'Nal-m': 'Nat-m',
  'lyos': 'Hyos', 'Lyos': 'Hyos',
  'cami-i': 'Cann-i', 'Cami-i': 'Cann-i',
  'stamn': 'Stann', 'Stamn': 'Stann',
  'lach n': 'Lach', 'Lach n': 'Lach',
  'calc-ac': 'Calc-a', 'Calc-ac': 'Calc-a',
  'ipl': 'Ip', 'Ipl': 'Ip',
  'kal-i': 'Kali-i', 'Kal-i': 'Kali-i',
  'kal-c': 'Kali-c', 'Kal-c': 'Kali-c'
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

  const knownChapters = [
    'FEMALE GENITALIA', 'MALE GENITALIA', 'PROSTATE GLAND', 'EXPECTORATION', 'PERSPIRATION',
    'GENERALITIES', 'EXTREMITIES', 'CONSTIPATION', 'RESPIRATION', 'GENITALIA', 'DIARRHOEA',
    'DIARRHEA', 'PROSTATE', 'HEARING', 'KIDNEYS', 'BLADDER', 'ABDOMEN', 'STOMACH', 'VERTIGO',
    'LARYNX', 'URETHRA', 'THROAT', 'RECTUM', 'KIDNEY', 'VISION', 'CHEST', 'FEVER', 'SLEEP',
    'STOOL', 'URINE', 'MOUTH', 'TEETH', 'CHILL', 'MIND', 'HEAD', 'EYES', 'EARS', 'NOSE',
    'FACE', 'BACK', 'SKIN', 'COUGH'
  ];

  for (const item of data) {
    let rawRubric = (item.rubric_en || item.rubric || '').trim();
    if (!rawRubric) continue;

    // Enforce chapter prefix integrity: strip any hallucinated chapter prefix and replace with active page chapter
    if (chapter && chapter !== 'UNKNOWN') {
      for (const ch of knownChapters) {
        if (rawRubric.toUpperCase().startsWith(ch + ' - ')) {
          rawRubric = rawRubric.substring(ch.length + 3).trim();
          break;
        }
      }
      rawRubric = `${chapter} - ${rawRubric}`;
    }

    const medicines = item.medicines || [];
    for (const medObj of medicines) {
      const medName = typeof medObj === 'string' ? medObj : (medObj.name || '');
      const medicineNames = medName.split(',').map(name => name.trim()).filter(Boolean);

      for (const medicineName of medicineNames) {
        const cleanMed = correctMedicineName(medicineName.replace(/\.$/, '').trim());
        if (!cleanMed) continue;

        rows.push({
          chapter_en: chapter,
          chapter_hi: '',
          rubric_en: rawRubric,
          rubric_hi: '',
          medicine: cleanMed,
          grading: inferKentGrading(medicineName, typeof medObj === 'object' ? medObj.grading : null)
        });
      }
    }
  }
  return rows;
};

/**
 * Turn Tesseract line boxes into an explicit Kent rubric skeleton.  The Vision
 * model still reads the medicines from the image, but it no longer has to
 * invent the parent/child hierarchy from visual indentation alone.
 */
const buildKentHierarchyManifest = (lines) => {
  if (!lines?.length) return { transcript: '', beginsWithRoot: false };

  const leftMost = Math.min(...lines.map(line => line.x));
  const normalisedLines = lines.map((line, index) => ({
    ...line,
    index,
    indent: Math.max(0, line.x - leftMost),
  }));

  const isRootHeading = (line) =>
    line.indent <= 36 && /^[A-ZÆŒ]{3,}(?=[\s,.:;-])/.test(line.text);

  const headingText = (line) => {
    const beforeColon = line.text.split(':', 1)[0];
    return beforeColon
      .replace(/\s*\(\s*see[^)]*\)/i, '')
      .replace(/[.\s]+$/, '')
      .trim();
  };

  // A colon introduces a rubric/qualifier. An all-caps word at the baseline
  // also introduces a root, even when Kent prints a period instead of a colon.
  const candidates = normalisedLines
    .filter(line => isRootHeading(line) || line.text.includes(':'))
    .map(line => ({
      ...line,
      root: isRootHeading(line),
      label: headingText(line),
    }))
    .filter(line => line.label.length > 0);

  if (!candidates.length) {
    return {
      transcript: normalisedLines
        .map(line => `[RAW indent=${line.indent}px; y=${line.y}] ${line.text}`)
        .join('\n'),
      beginsWithRoot: false,
    };
  }

  // Cluster only heading positions. Wrapped remedy rows never enter this
  // calculation, so their hanging indent cannot create a false child level.
  const headingIndents = [...new Set(candidates.filter(line => !line.root).map(line => line.indent))]
    .sort((a, b) => a - b);
  const indentAnchors = [];
  for (const indent of headingIndents) {
    if (!indentAnchors.length || indent - indentAnchors[indentAnchors.length - 1] >= 24) {
      indentAnchors.push(indent);
    }
  }

  const levelFor = (line) => {
    if (line.root) return 0;
    const closest = indentAnchors.reduce((best, anchor, index) =>
      Math.abs(anchor - line.indent) < Math.abs(indentAnchors[best] - line.indent) ? index : best, 0);
    // The first non-root indent is level 1. Cap depth at 3 because Kent pages
    // use a shallow hierarchy and OCR x-coordinates are not pixel-perfect.
    return Math.min(3, closest + 1);
  };

  const stack = [];
  const manifest = [];
  for (const candidate of candidates) {
    let level = levelFor(candidate);
    // A page/crop may begin just below a root heading. Keep this as a pending
    // child rather than pretending it is an unrelated main rubric.
    if (stack.length === 0 && level > 0) level = 0;

    stack.length = level;
    stack[level] = candidate.label;
    const path = stack.filter(Boolean).join(' > ');
    manifest.push({ ...candidate, level, path, type: level === 0 ? 'ROOT' : 'CHILD' });
  }

  const manifestText = manifest
    .map(item => `[${item.type} L${item.level}; indent=${item.indent}px; y=${item.y}] ${item.path}`)
    .join('\n');
  return {
    // Do not include the full OCR transcript here. It is long and makes the
    // model fall back to its old habit of merging child medicines into the
    // nearest main heading. The image supplies the medicine text; this compact
    // manifest supplies the non-negotiable structure.
    transcript: `LOCAL HIERARCHY MANIFEST (authoritative for rubric paths):\n${manifestText}`,
    expectedPaths: manifest
      .filter(item => item.text.includes(':'))
      .map(item => item.path),
    beginsWithRoot: manifest[0]?.type === 'ROOT',
  };
};

/**
 * Parse an image directly using OpenAI's gpt-4o-mini Vision API.
 * Bypasses Tesseract entirely to perfectly preserve indentation and formatting.
 */
const parseImageWithOpenAIVision = async (imagePath, columnSide = 'full', lastRubricContext = '', layoutManifest = {}, recoveryOnly = false) => {
  const fs = require('fs-extra');
  const https = require('https');
  const base64Image = fs.readFileSync(imagePath).toString('base64');
  
const scopeInstruction = columnSide === 'full'
  ? 'This page contains TWO columns. Extract the left column from top to bottom, then the right column from top to bottom.'
  : `This image is the ${columnSide.toUpperCase()} column crop only. Extract every rubric and medicine visible in this one column; do not attempt to infer or extract the other column.`;
const continuationInstruction = lastRubricContext
  ? `The previous column ended at "${lastRubricContext}". If this crop begins with a continuation medicine list, attach it to that exact rubric until a new flush-left main rubric starts.`
  : '';
const layoutInstruction = layoutManifest.transcript
  ? `\n${layoutManifest.transcript}\n\nThe LOCAL HIERARCHY MANIFEST is authoritative for rubric paths. Output a separate rubric_en for every listed ROOT or CHILD that has medicines. Do not merge a CHILD's medicines into its parent. The source image remains authoritative only for exact medicine spelling and typography.\n`
  : '';
const recoveryInstruction = recoveryOnly
  ? '\nRECOVERY MODE: Extract medicines ONLY for the manifest paths supplied above that were missing from the first pass. Do not return broad parent rubrics or any path not explicitly listed in the manifest.\n'
  : '';

const prompt = `You are a medical data extraction expert structuring a raw page from Kent's Repertory.
${scopeInstruction}
${continuationInstruction}
${layoutInstruction}
${recoveryInstruction}

CRITICAL INSTRUCTIONS:
1. CHAPTER IDENTIFICATION: Look at the very top of the page for the chapter name in large capitals (e.g., "HEAD" or "ABDOMEN"). You must prefix ALL extracted rubrics with this chapter name.
2. RIGID HIERARCHY TRACKING (VITAL): Kent's Repertory relies entirely on visual hanging indents. You MUST track the "current path" logically based on indentation depth.
   - Level 0 (Absolute left margin): Main Rubric (e.g., "PAIN, tearing.", "CONSTIPATION.") -> Path: "[CHAPTER] - [MAIN RUBRIC]"
   - Level 1 (Slight indent): Sub-rubric (e.g., "morning:", "afternoon:", "evening:") -> Path: "[CHAPTER] - [MAIN RUBRIC] - morning"
   - Level 2 (Deeper indent): Sub-sub-rubric (e.g., "rising, after:", "menses, before:") -> Path: "[CHAPTER] - [MAIN RUBRIC] - morning - rising, after"
   - Level 3 (Deepest indent): e.g., "during:" under menses -> Path: "[CHAPTER] - [MAIN RUBRIC] - menses, during"

    WARNING (CRITICAL FOR SEPARATE MAIN RUBRICS - DO NOT MERGE):
    - Independent main rubrics flush with the left margin MUST reset the path.
    - When a new flush-left rubric appears, start a clean new rubric path.

   WARNING (CRITICAL FOR FIRST SUB-RUBRIC):
   - Never skip the first indented sub-rubric under a main rubric!
   - Strip parenthetical cross-references like "(see 'Inactivity')", but NEVER drop the sub-rubric name itself!

   WARNING: Never skip a parent! If you see "after:" indented under "stitching, stool", the path MUST include "stitching, stool".
   WARNING: Pay close attention to words like "extending to" or "extending into". The locations below them are subrubrics OF "extending to".
   WARNING: Never merge medicines from a child line into its main rubric. Every colon-bearing child line must produce its own rubric_en path.
3. RUBRICS vs MEDICINES: A rubric ends with a colon (:). Everything AFTER the colon is a list of medicines. Do NOT put medicines in the rubric name.
4. GRADING (CRITICAL - LOOK AT TYPOGRAPHY): Look very closely at the font style of EACH medicine abbreviation in the image. DO NOT rely on capitalization!
   - BOLD FONT = Grade 3 (e.g., thick, dark letters)
   - ITALIC FONT = Grade 2 (e.g., slanted letters)
   - PLAIN FONT = Grade 1 (e.g., normal, unslanted, unbolded letters)
   Many plain medicines start with capital letters (e.g., Alum., Ars.). Only assign Grade 3 if the text is physically printed in BOLD.
5. EXHAUSTIVE ANTI-TRUNCATION RULE: You MUST extract EVERY SINGLE rubric and EVERY SINGLE medicine in this image. DO NOT SUMMARIZE. DO NOT SKIP. Some medicine lists are very long (e.g., "difficult stool: Æsc., agar., all-c., ..."). You must transcribe the ENTIRE list. If you skip any data, this extraction is considered a failure.
6. COMPACT OUTPUT: Group all medicines of the same grading within a rubric into one comma-separated "name" value. This is required so the response completes the entire column. Never emit one object per medicine.
7. JSON OUTPUT: Output ONLY a valid JSON object matching this schema:
{
  "chapter_en": "DETECTED_CHAPTER",
  "data": [
    {
      "rubric_en": "DETECTED_CHAPTER - MAIN - sub1 - sub2",
      "medicines": [
        {"name": "MedName1,MedName2,MedName3", "grading": 3},
        {"name": "MedName4,MedName5", "grading": 1}
      ]
    }
  ]
}`;

  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const body = JSON.stringify({
    model: modelName,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 16000,
    response_format: { type: 'json_object' }
  });

  const openAIResp = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('OpenAI parse error: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (openAIResp.error) {
    throw new Error(openAIResp.error.message);
  }

  if (openAIResp.choices?.[0]?.message?.content) {
    if (openAIResp.choices[0].finish_reason === 'length') {
      throw new Error(`OpenAI Vision output was truncated for the ${columnSide} column`);
    }
    const parsedJson = JSON.parse(openAIResp.choices[0].message.content);
    return convertGroqJsonToRows(parsedJson, parsedJson.chapter_en);
  }
  
  return [];
};

/**
 * Send the two printed columns to Vision independently.  A single full-page
 * request has two failure modes: the model sees the gutter as a reading-order
 * boundary, and a dense left column consumes the response budget before all
 * of its remedies are emitted.  Each crop receives the same 55%/45% overlap
 * that fixed the known good Kent extraction.
 */
const parsePageWithOpenAIVision = async (imagePath) => {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error('Could not read Kent page dimensions');

  const directory = path.dirname(imagePath);
  const extension = path.extname(imagePath) || '.jpg';
  const baseName = path.basename(imagePath, extension);
  const cropId = `${baseName}_vision_quads_${Date.now()}`;
  const tlPath = path.join(directory, `${cropId}_tl${extension}`);
  const blPath = path.join(directory, `${cropId}_bl${extension}`);
  const trPath = path.join(directory, `${cropId}_tr${extension}`);
  const brPath = path.join(directory, `${cropId}_br${extension}`);

  try {
    const halfWidth = Math.floor(width * 0.55);
    const rightStart = Math.floor(width * 0.45);
    const halfHeight = Math.floor(height * 0.55);
    const bottomStart = Math.floor(height * 0.45);

    await sharp(imagePath)
      .extract({ left: 0, top: 0, width: halfWidth, height: halfHeight })
      .jpeg({ quality: 95 })
      .toFile(tlPath);

    await sharp(imagePath)
      .extract({ left: 0, top: bottomStart, width: halfWidth, height: height - bottomStart })
      .jpeg({ quality: 95 })
      .toFile(blPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height: halfHeight })
      .jpeg({ quality: 95 })
      .toFile(trPath);

    await sharp(imagePath)
      .extract({ left: rightStart, top: bottomStart, width: width - rightStart, height: height - bottomStart })
      .jpeg({ quality: 95 })
      .toFile(brPath);

    console.log('[Kent Parser] Vision 4-Quadrant Pass 1/4: TOP-LEFT quadrant...');
    let tlRows = await parseImageWithOpenAIVision(tlPath, 'top-left', '', {});
    const lastTlRubric = tlRows.length ? tlRows[tlRows.length - 1].rubric_en : '';

    console.log('[Kent Parser] Vision 4-Quadrant Pass 2/4: BOTTOM-LEFT quadrant...');
    let blRows = await parseImageWithOpenAIVision(blPath, 'bottom-left', lastTlRubric, {});
    const lastBlRubric = blRows.length ? blRows[blRows.length - 1].rubric_en : lastTlRubric;

    console.log('[Kent Parser] Vision 4-Quadrant Pass 3/4: TOP-RIGHT quadrant...');
    let trRows = await parseImageWithOpenAIVision(trPath, 'top-right', lastBlRubric, {});
    const lastTrRubric = trRows.length ? trRows[trRows.length - 1].rubric_en : lastBlRubric;

    console.log('[Kent Parser] Vision 4-Quadrant Pass 4/4: BOTTOM-RIGHT quadrant...');
    let brRows = await parseImageWithOpenAIVision(brPath, 'bottom-right', lastTrRubric, {});

    const uniqueRows = [];
    const seen = new Set();
    for (const row of [...tlRows, ...blRows, ...trRows, ...brRows]) {
      const key = `${row.rubric_en}|||${row.medicine}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    }
    console.log(`[Kent Parser] 4-Quadrant Vision complete: TL=${tlRows.length}, BL=${blRows.length}, TR=${trRows.length}, BR=${brRows.length}, total=${uniqueRows.length}`);
    return uniqueRows;
  } finally {
    await Promise.all([
      fs.remove(tlPath).catch(() => {}),
      fs.remove(blPath).catch(() => {}),
      fs.remove(trPath).catch(() => {}),
      fs.remove(brPath).catch(() => {})
    ]);
  }
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

  // Step 0: Direct OpenAI Vision Extraction (Primary Pipeline)
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('[Kent Parser] Attempting two-pass OpenAI Vision extraction...');
      const visionRows = await parsePageWithOpenAIVision(imagePath);
      if (visionRows && visionRows.length > 0) {
        console.log(`[Kent Parser] ✅ Vision extraction successful! Extracted ${visionRows.length} rubrics.`);
        return visionRows;
      }
    } catch (e) {
      console.warn(`[Kent Parser] Vision extraction failed (${e.message}). Falling back to Tesseract OCR pipeline...`);
    }
  }

  // Step 0.5: OCR the top strip of the ORIGINAL image first — the chapter running
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

    // Pass the last rubric from the left column as context to the right column.
    // This prevents Groq from inventing a new rubric name (e.g. "JONSTIPATION")
    // when the right column is a continuation of the left column's last rubric.
    const leftRows = convertGroqJsonToRows(leftJson);
    const lastLeftRubric = leftRows.length > 0
      ? (leftRows[leftRows.length - 1]?.rubric_en || '')
      : '';

    // Brief pause between API calls to stay within per-minute token limits
    if (leftJson && rightText.trim().length > 30) {
      await new Promise(r => setTimeout(r, 1200));
    }

    const rightJson = rightText.trim().length > 30
      ? await parseColumnTextWithGroq(rightText, 'right', lastLeftRubric, detectedChapter)
      : null;

    const rightRows = convertGroqJsonToRows(rightJson);

    if (leftRows.length > 0) {
      addRows(leftRows);
      groqSuccess = true;
      console.log(`[Kent Multi-Column Parser] Left column: ${leftRows.length} rows extracted via Groq.`);

      // Fix CONTINUATION/UNKNOWN rubrics in right column that should inherit last left rubric
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
