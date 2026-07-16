'use strict';

const { initAI, getVisionModel, isAIReady } = require('../config/aiConfig');
const fs = require('fs');
const path = require('path');

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
 * Handles cases where the model cuts off mid-array due to token limits.
 */
const repairAndParseJson = (rawText) => {
  let text = rawText.trim();

  // Strip markdown code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?/i, '').replace(/```[\s]*$/m, '').trim();
  }

  // Extract the outermost JSON object using greedy regex
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  // Attempt 1: clean parse
  try {
    return JSON.parse(text);
  } catch (_) {
    // Attempt 2: repair truncated JSON by cutting to last complete object
    try {
      let repaired = text;

      // Find the last '},' which marks the end of a complete array element
      const lastGoodClose = repaired.lastIndexOf('},');
      const lastBraceClose = repaired.lastIndexOf('}');

      let cutPos = -1;
      if (lastGoodClose > 0) {
        cutPos = lastGoodClose + 1; // include the '}'
      } else if (lastBraceClose > 0) {
        cutPos = lastBraceClose + 1;
      }

      if (cutPos > 0) {
        repaired = repaired.substring(0, cutPos);

        // Count unclosed brackets/braces and close them
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
    } catch (repairErr) {
      // Repair also failed — fall through to throw
    }

    throw new SyntaxError(`Could not parse AI response. Snippet: ${text.substring(0, 300)}`);
  }
};

/**
 * Generate content using Gemini Vision for Kent OCR
 */
const generateKentContent = async (prompt, imagePath) => {
  if (!isAIReady()) {
    const success = initKentAI();
    if (!success) {
      throw new Error('AI is not configured. Please set API keys in your .env file.');
    }
  }

  const model = getVisionModel();
  const parts = [{ text: prompt }];

  if (imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });
    parts.push({ inlineData: { data: base64Data, mimeType } });
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16000,        // Large enough for dense pages
        responseMimeType: 'application/json'
      }
    });
    return await result.response.text();
  } catch (error) {
    console.error('❌ AI generation failed:', error.message);
    throw error;
  }
};

/**
 * Prompts Gemini Vision to parse a Kent's Repertory image into structured JSON.
 * Extracts chapter, rubric, sub-rubric, medicine, and grading (from bold/italic/normal).
 *
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<Array>} - Parsed and expanded rows
 */
const parseImageToStructuredJson = async (imagePath) => {
  initKentAI();
  console.log(`[Kent AI Parser] Processing image: ${path.basename(imagePath)}...`);

  const prompt = `You are a medical data extraction expert. Extract ALL medicines from this Kent's Repertory page image.

CRITICAL RULES:
1. ONE page = ONE chapter. The CHAPTER is at the very top (e.g., "VERTIGO.", "MIND.", "HEAD."). Use it for EVERY row.
2. RUBRICS are ALL-CAPS words below the chapter (e.g., ROCKING, SLEEP, STANDING).
3. Sub-rubrics are indented modifiers (e.g., while:, from:, amel.:, during:).
4. ONE ROW per medicine. If 5 medicines are listed under a rubric, output 5 objects.
5. Remove trailing periods from medicine names.
6. GRADING by font weight visible in image:
   - BOLD font -> grading: 3
   - Italic font -> grading: 2
   - Normal font -> grading: 1

OUTPUT: Return a JSON object with a "data" array. Each element:
  { "chapter_en": string, "chapter_hi": string, "rubric_en": string, "rubric_hi": string, "medicine": string, "grading": 1|2|3 }`;

  const textResponse = await generateKentContent(prompt, imagePath);
  console.log(`[Kent AI Parser] Raw AI response: ${textResponse.length} chars`);

  const parsedJson = repairAndParseJson(textResponse);

  if (!parsedJson.data || !Array.isArray(parsedJson.data)) {
    throw new Error('AI did not return a valid "data" array.');
  }

  console.log(`[Kent AI Parser] ✅ Extracted ${parsedJson.data.length} rows from image!`);

  // Expand any rows where medicine accidentally has multiple comma-separated values
  const expandedData = [];
  for (const row of parsedJson.data) {
    const medField = (row.medicine || '').trim();
    if (medField.includes(',')) {
      medField.split(',').map(m => m.trim()).filter(Boolean).forEach(med => {
        expandedData.push({ ...row, medicine: med.replace(/\.$/, '') });
      });
    } else if (medField) {
      expandedData.push({ ...row, medicine: medField.replace(/\.$/, '') });
    }
  }

  return expandedData;
};

module.exports = {
  initKentAI,
  generateKentContent,
  parseImageToStructuredJson,
  parseOcrToStructuredJson: parseImageToStructuredJson   // backward compat alias
};
