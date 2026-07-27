'use strict';

const { extractColumnTextsFromImage, extractTextFromImage } = require('./kentOcrService');
const { parseKentOcrTextAdvanced } = require('./kentTextParser');
const fs = require('fs-extra');
const path = require('path');

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

  // Known Kent Repertory chapters (complete list from your Kent book)
  const knownChapters = [
    'MIND', 'VERTIGO', 'HEAD', 'EYE', 'VISION', 'EAR', 'HEARING', 'NOSE', 'FACE',
    'MOUTH', 'TEETH', 'THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL',
    'BLADDER', 'KIDNEYS', 'PROSTATE', 'PROSTRATE', 'URETHRA', 'URINE', 
    'GENITALIA', 'FEMALE GENITAL', 'MALE GENITAL',
    'LARYNX', 'RESPIRATION', 'COUGH', 'EXPECTORATION', 'CHEST', 'BACK',
    'EXTREMITIES', 'SLEEP', 'CHILL', 'FEVER', 'PERSPIRATION', 'SKIN',
    'GENERALITIES'
  ];

  // Check first 5 lines for chapter name (header is always at top)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].toUpperCase().trim();
    
    // Exact match
    if (knownChapters.includes(line)) {
      return line;
    }
    
    // Fuzzy match (OCR errors like "EAR." or "EAR 123")
    for (const chapter of knownChapters) {
      if (line.startsWith(chapter) || line.includes(chapter)) {
        return chapter;
      }
    }
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
 * @returns {Promise<Object|null>}   Parsed JSON object or null if unavailable
 */
const parseColumnTextWithGroq = async (rawText, columnSide = 'left', lastRubricContext = '') => {
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

    const prompt = `You are a medical data extraction & spell-correction expert structuring raw Kent's Repertory OCR text from the ${columnSide.toUpperCase()} column.
${contextInstruction}

--- CRITICAL REPERTORY TYPOGRAPHY & GRADING RULES ---
1. CAPITALIZATION = GRADE 3 (BOLD):
   - In Kent's Repertory text OCR, if a medicine abbreviation STARTS WITH A CAPITAL LETTER (e.g., Mag-s, Mang, Lob, Bell, Lach, Cupr, Bor, Cann-i, Aloe, Acon, Spig, Sars, Am-c, Teucr, Calc, Bar-c, Nux-v, Benz-ac, Chin, Lyc, Ferr, All-c, Mez, Kreos, Act-sp, Puls), it is printed in BOLD font in the book. Assign grading = 3.
   - For lowercase medicine abbreviations:
     - Assign grading = 2 (Italic) if it is a major italicized remedy (e.g. acon, agar, alum, bell, calc, caust, chin, con, cupr, dros, dulc, graph, hep, kali-c, lach, laur, mag-c, mag-m, mang, meny, merc, nat-m, nit-ac, petr, phos-ac, plat, puls, rhodo, sabad, sep, sil, sulph).
     - Assign grading = 1 (Normal) for plain remedies (e.g. ant-t, aur, bar-c, bor, carl, cocc, mosch, rheum, selen, spong, stann, zinc).

2. MEDICINE SPELL CORRECTION & CLEANING:
   - Correct OCR typos in medicine names using standard homeopathic abbreviations:
     e.g., "cauth" -> "canth", "Manec" -> "manc", "drnmming" -> "drumming", "sunfling" -> "snuffing", "morniug" -> "morning", "ou" -> "on", "11 a. m." / "IT a. m." -> "10 a. m.", "47s" -> "amel.".
   - Clean trailing dots or commas from medicine names.

3. CONTINUATION AT TOP OF COLUMN:
   - If the column text starts with a list of medicines (e.g., "mag-m., med., nat-s...") without any rubric heading, it is the CONTINUATION of the last rubric from the previous column ("${lastRubricContext}"). Group these medicines under "${lastRubricContext}"!

4. HIERARCHY & RUBRIC FORMAT:
   - "CHAPTER - MAIN RUBRIC, qualifier - sub-rubric"
   e.g. "EAR - NOISES, hissing - humming"

5. OUTPUT SCHEMA: Return ONLY valid JSON matching format:
{
  "chapter_en": "EAR",
  "data": [
    {
      "rubric_en": "EAR - NOISES, hissing",
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
      leftText.trim().length > 30 ? parseColumnTextWithGroq(leftText, 'left') : Promise.resolve(null),
      rightText.trim().length > 30 ? parseColumnTextWithGroq(rightText, 'right') : Promise.resolve(null)
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
    }
  }

  // Step 4: Fallback to deterministic rule-based parsing if Groq is unavailable or returned 0 rows
  if (allResults.length === 0) {
    console.log('[Kent Multi-Column Parser] Groq unavailable/empty. Falling back to deterministic rule parser...');
    const combinedOcrText = `${leftText}\n${rightText}`;
    const ruleResults = parseKentOcrTextAdvanced(combinedOcrText);
    addRows(ruleResults);
  }

  // Cleanup temporary column crop images
  if (leftPath && fs.existsSync(leftPath)) fs.unlinkSync(leftPath);
  if (rightPath && fs.existsSync(rightPath)) fs.unlinkSync(rightPath);

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

