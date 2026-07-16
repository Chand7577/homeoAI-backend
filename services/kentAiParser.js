'use strict';

const { initAI, getVisionModel, isAIReady } = require('../config/aiConfig');

/**
 * Initialize AI specifically for Kent OCR extraction
 */
const initKentAI = () => {
  if (!isAIReady()) {
    return initAI();
  }
  return true;
};

const fs = require('fs');
const path = require('path');

/**
 * Generate content using the Unified AI Model for Kent OCR
 */
const generateKentContent = async (prompt, imagePath) => {
  if (!isAIReady()) {
    const success = initKentAI();
    if (!success) {
      throw new Error('AI is not configured. Please set API keys in your .env file.');
    }
  }

  try {
    const model = getVisionModel();
    const parts = [{ text: prompt }];

    if (imagePath) {
      const ext = path.extname(imagePath).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.pdf') mimeType = 'application/pdf';

      const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8000,
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
 * Prompts the AI (Gemini Vision) to parse an image from Kent's Repertory
 * directly into a structured JSON array, extracting gradings from bold/italics.
 *
 * @param {string} imagePath The absolute path to the uploaded image/pdf
 * @returns {Promise<Array>} Parsed rows
 */
const parseImageToStructuredJson = async (imagePath) => {
  initKentAI();
  console.log(`[Kent AI Parser] Processing image visually: ${imagePath}...`);
  
  const prompt = `Extract ALL medicines from this Kent's Repertory page image.
You are equipped with advanced vision. Read the text directly from the image.

CRITICAL: ONE page = ONE chapter. CHAPTER is ONLY at the very top.
Example: If "VERTIGO." is at the top, then ALL rubrics below use VERTIGO as the chapter.

STRUCTURE:
- CHAPTER (top of page only): VERTIGO, MIND, HEAD
- RUBRICS (everything else): ALL CAPS words like ROCKING, SITTING, SLEEP, STANDING
- Sub-rubrics: indented words like while:, from:, amel.:, during:
- Medicines: comma-separated
- GRADING: You MUST assign grades based on the font style in the image:
  - BOLD text = Grade 3 (e.g. Nux-v)
  - ITALIC text = Grade 2 (e.g. coff)
  - NORMAL text = Grade 1 (e.g. merc)

RULES:
1. Find the chapter at the top ONCE, use it for ALL rows.
2. ALL BOLD CAPS words below = rubrics under that chapter.
3. ONE ROW per medicine.
4. Remove periods from medicine names.
5. Accurately assign the grading (1, 2, or 3) by visually inspecting the font weight in the image!
6. DO NOT include any explanations or conversational text. Return ONLY the JSON object.

OUTPUT FORMAT:
{
  "data": [
    {"chapter_en": "VERTIGO", "chapter_hi": "", "rubric_en": "VERTIGO - SLEEP - during", "rubric_hi": "", "medicine": "Nux-v", "grading": 3}
  ]
}
`;

  try {
    const textResponse = await generateKentContent(prompt, imagePath);
    let text = textResponse.trim();
  
    // Robustly extract JSON object using regex in case AI adds conversational text
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else if (text.startsWith('```')) {
      jsonStr = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }

    const parsedJson = JSON.parse(jsonStr);
    if (!parsedJson.data || !Array.isArray(parsedJson.data)) {
      throw new Error('AI did not return a valid "data" array as expected.');
    }

    console.log(`[Kent AI Parser] Vision extracted ${parsedJson.data.length} rows directly from image!`);
    
    // POST-PROCESSING: Expand any rows where medicine field contains multiple medicines
    const expandedData = [];
    for (const row of parsedJson.data) {
      const medicineField = (row.medicine || '').trim();
      if (medicineField.includes(',')) {
        const medicines = medicineField.split(',').map(m => m.trim()).filter(m => m.length > 0);
        for (const med of medicines) {
          expandedData.push({ ...row, medicine: med.replace(/\.$/, '') });
        }
      } else if (medicineField.length > 0) {
        expandedData.push({ ...row, medicine: medicineField.replace(/\.$/, '') });
      }
    }
    
    return expandedData;
  } catch (error) {
    console.error(`❌ Vision parsing failed:`, error.message);
    throw error;
  }
};

module.exports = { initKentAI, generateKentContent, parseImageToStructuredJson, parseOcrToStructuredJson: parseImageToStructuredJson };
