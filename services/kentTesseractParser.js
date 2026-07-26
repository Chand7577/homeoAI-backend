'use strict';

const { extractColumnTextsFromImage, extractTextFromImage } = require('./kentOcrService');
const { parseKentOcrTextAdvanced } = require('./kentTextParser');
const fs = require('fs-extra');
const path = require('path');

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
      ? `CONTEXT FROM PREVIOUS (LEFT) COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a comma-separated continuation header (e.g. "COLOR, redness, inside."), reconstruct the parent path from this context and use it for all sub-rubrics beneath it.`
      : '';

    const prompt = `You are a medical data extraction expert structuring raw OCR text from the ${columnSide.toUpperCase()} column of Kent's Repertory.
${contextInstruction}

--- PAGE LAYOUT & HIERARCHY RULES ---
1. EXHAUSTIVE EXTRACTION: Capture EVERY SINGLE rubric and medicine abbreviation. Do NOT skip any lines.
2. HIERARCHY & INDENTATION:
   - ALL CAPS (e.g. "NOSE", "HEARING", "COLOR"): Main Chapter or Top-Level Rubric.
   - Sub-rubrics (e.g. "redness", "inside", "septum"): Modifiers under the top rubric.
   - Line with colon (e.g. "septum: Alum., bov."): Rubric key is before colon, medicines after.
3. CONTINUATION HEADERS:
   - If column starts with e.g. "COLOR, redness, inside.", all sub-rubrics below inherit that parent path: "NOSE - COLOR, redness - inside".
4. RUBRIC PATH FORMAT: "CHAPTER - MAIN RUBRIC, qualifier - sub-rubric - sub-sub-rubric"
   e.g. "NOSE - COLOR, redness - inside - septum"
5. MEDICINES & GRADING:
   - Split comma-separated medicine abbreviations.
   - Grading rules: ALL CAPS medicine = 3, Italic/mostly lowercase = 2, Normal = 1.
6. OUTPUT SCHEMA: Return ONLY valid JSON matching this format:

{
  "chapter_en": "NOSE",
  "data": [
    {
      "rubric_en": "NOSE - COLOR, redness - inside - septum",
      "medicines": [
        {"name": "Alum", "grading": 1},
        {"name": "bov", "grading": 1}
      ]
    }
  ]
}

RAW OCR TEXT TO PARSE:
${rawText}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    });

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

  // Step 2: Pass Left column text to Groq AI
  let groqSuccess = false;
  if (process.env.GROQ_API_KEY && leftText.trim().length > 30) {
    console.log('[Kent Multi-Column Parser] Step 2a: Structuring LEFT column with Groq AI...');
    const leftJson = await parseColumnTextWithGroq(leftText, 'left');
    const leftRows = convertGroqJsonToRows(leftJson);

    if (leftRows.length > 0) {
      addRows(leftRows);
      groqSuccess = true;
      console.log(`[Kent Multi-Column Parser] Left column: ${leftRows.length} rows extracted via Groq.`);

      // Step 3: Pass Right column text to Groq AI using last rubric from Left column as context
      if (rightText && rightText.trim().length > 30) {
        const lastLeftRubric = leftRows[leftRows.length - 1]?.rubric_en || '';
        console.log(`[Kent Multi-Column Parser] Step 2b: Structuring RIGHT column with Groq AI (Context: "${lastLeftRubric}")...`);
        const rightJson = await parseColumnTextWithGroq(rightText, 'right', lastLeftRubric);
        const rightRows = convertGroqJsonToRows(rightJson);
        addRows(rightRows);
        console.log(`[Kent Multi-Column Parser] Right column: ${rightRows.length} rows extracted via Groq.`);
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

  // Cleanup temporary column crop images
  if (leftPath && fs.existsSync(leftPath)) fs.unlinkSync(leftPath);
  if (rightPath && fs.existsSync(rightPath)) fs.unlinkSync(rightPath);

  if (allResults.length === 0) {
    throw new Error('Could not extract any valid medicine rubrics from the image.');
  }

  console.log(`[Kent Multi-Column Parser] ✅ Success: ${allResults.length} unique medicine-rubric rows extracted!`);
  return allResults;
};

module.exports = {
  parseImageWithTesseract,
  parseTesseractOcrWithRules: parseImageWithTesseract
};

