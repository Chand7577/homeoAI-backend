'use strict';

const { extractColumnTextsFromImage, extractTextFromImage } = require('./kentOcrService');
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

  // STRICT: Only check the FIRST line (the actual page header)
  const firstLine = lines[0].toUpperCase().trim();
  
  // Try exact match first
  if (knownChapters.includes(firstLine)) {
    return cleanChapterName(firstLine);
  }
  
  // Try fuzzy match (for OCR errors like "VERTIGO." or "EAR 123")
  // Check longest chapters first to avoid substring issues
  for (const chapter of knownChapters) {
    // Must be at the START of the line (not in the middle)
    if (firstLine.startsWith(chapter)) {
      return cleanChapterName(chapter);
    }
  }
  
  // If still no match, try finding chapter name within first line
  // (only if it's clearly isolated, not part of a longer word)
  for (const chapter of knownChapters) {
    const pattern = new RegExp(`\\b${chapter}\\b`, 'i');
    if (pattern.test(firstLine)) {
      return cleanChapterName(chapter);
    }
  }
  
  // Last resort: Try to clean the first line itself and check if it matches
  const cleanedFirstLine = cleanChapterName(firstLine);
  if (knownChapters.includes(cleanedFirstLine)) {
    return cleanedFirstLine;
  }

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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !rawText || rawText.trim().length < 20) {
    return null;
  }

  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey });

    const contextInstruction = lastRubricContext
      ? `CONTEXT FROM PREVIOUS (LEFT) COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a list of medicines or a comma-separated continuation header (e.g. "COLOR, redness, inside."), reconstruct the parent path from this context and use it for all sub-rubrics beneath it.`
      : '';
    
    const chapterInstruction = detectedChapter && detectedChapter !== 'UNKNOWN'
      ? `\n\n⚠️ CRITICAL CHAPTER ENFORCEMENT:\nThe page header indicates this is the "${detectedChapter}" chapter.\nYou MUST prefix ALL rubric paths with "${detectedChapter} - " at the beginning.\nExample: If you see "PAIN, pressing - evening", output: "${detectedChapter} - PAIN, pressing - evening"\n`
      : '';

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

3. MEDICINE SPELL CORRECTION & CLEANING:
   - Correct OCR typos in medicine names using standard homeopathic abbreviations:
     Common fixes: "Cale" -> "Calc", "ina" -> "ign", "nil-ac" -> "Nit-ac", "nuzx-v" -> "Nux-v", "NWX" -> "Nux", "WUX" -> "Nux", "igz" -> "Ign", "Aut-c" -> "Ant-c", "unal-m" -> "Nat-m", "cauth" -> "Canth", "Manec" -> "Manc"
   - Clean trailing dots or commas from medicine names.
   - Standardize capitalization: "SULPH" -> "Sulph", "CALC" -> "Calc"

3B. JSON STRING ESCAPING:
   - CRITICAL: All rubric text MUST escape double quotes with backslash.
   - Replace all double quotes (") inside rubric_en values with single quotes (').
   - Example: CORRECT: "Summer, (See 'hot weather')" | WRONG: "Summer, (See \"hot weather\")"

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

    let completion = null;
    try {
      completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });
    } catch (e) {
      console.warn(`[Groq Structurer] llama-3.1-8b-instant failed, trying 70b: ${e.message}`);
      completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });
    }

    const text = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[Groq Structurer] Column pass (${columnSide}) error:`, err.message);
    return null;
  }
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
      const cleanMed = medName.replace(/\.$/, '').trim();
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

  // Step 1.5: CRITICAL - Extract chapter from page header (ABSOLUTE SOURCE OF TRUTH)
  const detectedChapter = extractChapterFromHeader(leftText) !== 'UNKNOWN' 
    ? extractChapterFromHeader(leftText)
    : extractChapterFromHeader(rightText);
  
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

  // Step 2: Pass Left & Right column text to Groq AI concurrently
  let groqSuccess = false;
  if (process.env.GROQ_API_KEY && (leftText.trim().length > 30 || rightText.trim().length > 30)) {
    console.log('[Kent Multi-Column Parser] Structuring LEFT & RIGHT columns concurrently with Groq AI...');

    const [leftJson, rightJson] = await Promise.all([
      leftText.trim().length > 30 ? parseColumnTextWithGroq(leftText, 'left', '', detectedChapter).catch(e => {
        console.warn(`[Kent Multi-Column Parser] Left Groq error: ${e.message}`);
        return null;
      }) : Promise.resolve(null),
      rightText.trim().length > 30 ? parseColumnTextWithGroq(rightText, 'right', '', detectedChapter).catch(e => {
        console.warn(`[Kent Multi-Column Parser] Right Groq error: ${e.message}`);
        return null;
      }) : Promise.resolve(null)
    ]);

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

