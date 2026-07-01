const { getModel, isAIReady } = require('../config/aiConfig');
const Rubric = require('../models/Rubric');

/**
 * Build a compact rubric summary for the AI prompt.
 * Avoids sending entire DB docs to keep token count low.
 */
const buildRubricSummary = (rubrics) => {
  return rubrics.map(r => ({
    id: r._id.toString(),
    chapter: r.chapter?.en || '',
    chapter_hi: r.chapter?.hi || '',
    rubric: r.rubric?.en || '',
    rubric_hi: r.rubric?.hi || '',
    subrubric: r.subrubric?.en || '',
    agg: (r.modalities?.aggravation || []).join(', '),
    amel: (r.modalities?.amelioration || []).join(', '),
    synonyms: (r.synonyms?.en || []).join(', '),
    medicines: r.medicines instanceof Map ? Object.fromEntries(r.medicines) : (r.medicines || {}),
  }));
};

/**
 * Pre-filter rubrics from MongoDB based on keywords in symptoms.
 * Keeps prompt size small, ensuring lightning-fast Gemini execution.
 */
const getCandidateRubrics = async (symptoms, repertoryId) => {
  const candidateMap = new Map();
  const stopWords = new Set(['and', 'the', 'for', 'with', 'worse', 'better', 'from', 'after', 'before', 'without', 'about', 'feels']);
  const chapterStopWords = new Set(['mind', 'head', 'eye', 'eyes', 'ear', 'ears', 'nose', 'face', 'mouth', 'throat', 'stomach', 'abdomen', 'stool', 'urine', 'cough', 'fever', 'chill', 'sleep', 'skin', 'chest', 'back', 'extremities']);

  for (const symptom of symptoms) {
    if (!symptom.trim()) continue;

    // Clean punctuation and split into terms (supporting English and Hindi/Devenagari characters)
    const allTerms = symptom.toLowerCase()
      .replace(/[^\w\s\u0900-\u097F]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !stopWords.has(w));

    if (allTerms.length === 0) continue;

    // Separate specific words from generic chapter names
    const specificTerms = allTerms.filter(t => !chapterStopWords.has(t));
    const activeTerms = specificTerms.length > 0 ? specificTerms : allTerms;

    // Stage 1: Find rubrics matching ALL active terms (intersection)
    const andQuery = {
      repertoryId,
      $and: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
    };

    try {
      const matches = await Rubric.find(andQuery).limit(40).lean();
      matches.forEach(m => {
        candidateMap.set(m._id.toString(), m);
      });
    } catch (e) {
      console.error('AND query failed, fallback to OR:', e.message);
    }

    // Stage 2: If we have fewer than 30 candidates, pull in rubrics matching ANY active term (union)
    if (candidateMap.size < 30) {
      const orQuery = {
        repertoryId,
        $or: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
      };
      try {
        const orMatches = await Rubric.find(orQuery).limit(50).lean();
        orMatches.forEach(m => {
          if (candidateMap.size < 60) {
            candidateMap.set(m._id.toString(), m);
          }
        });
      } catch (e) {
        console.error('OR query failed:', e.message);
      }
    }
  }

  // Fallback: If no candidate matched, get first 150 rubrics so AI has options
  if (candidateMap.size === 0) {
    const fallback = await Rubric.find({ repertoryId }).limit(150).lean();
    fallback.forEach(m => {
      candidateMap.set(m._id.toString(), m);
    });
  }

  return Array.from(candidateMap.values());
};

/**
 * Call Gemini 1.5 Flash to match symptoms → rubrics.
 * Returns array of matched rubric objects.
 */
const matchWithAI = async (symptoms, rubrics, repertoryName) => {
  const model = getModel();
  const rubricSummaries = buildRubricSummary(rubrics);

  const prompt = `
You are an expert homeopathic physician and repertory specialist.
I will provide you with a patient's symptoms and a list of rubric records from "${repertoryName}".

Your job is to match each patient symptom to the MOST RELEVANT rubric in the list.

PATIENT SYMPTOMS:
${symptoms.map((s, i) => `${i + 1}. ${s}`).join('\n')}

AVAILABLE RUBRICS (JSON):
${JSON.stringify(rubricSummaries, null, 2)}

INSTRUCTIONS:
- For each patient symptom, find the single best matching rubric from the list above.
- Consider chapter, rubric name, subrubric, synonyms, aggravation, and amelioration.
- If no good match exists, set "matched_rubric_id" to null.
- Be clinically precise. "irritable" should map to "Anger" rubrics, "worse cold" to aggravation cold, etc.

Return ONLY a valid JSON array with this exact structure (no other text):
[
  {
    "symptom": "exact patient symptom text",
    "matched_rubric_id": "rubric_id or null",
    "confidence": 0-100,
    "reasoning": "brief clinical reason for the match in 1 sentence"
  }
]
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI returned invalid JSON format');

  return JSON.parse(jsonMatch[0]);
};

/**
 * Keyword fallback when Gemini API key is not configured.
 * Basic string matching against searchText field.
 */
const matchWithKeywords = (symptoms, rubrics) => {
  return symptoms.map(symptom => {
    const terms = symptom.toLowerCase().split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    rubrics.forEach(rubric => {
      const text = rubric.searchText || '';
      const score = terms.filter(t => t.length > 2 && text.includes(t)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rubric;
      }
    });

    return {
      symptom,
      matched_rubric_id: bestMatch ? bestMatch._id.toString() : null,
      confidence: bestMatch ? Math.min(bestScore * 20, 80) : 0,
      reasoning: bestMatch ? 'Keyword match (AI not configured)' : 'No match found',
    };
  });
};

/**
 * Compute medicine distribution from matched rubrics.
 * Sums grades per medicine and ranks by total score.
 */
const computeMedicineDistribution = (matchedRubrics) => {
  const medicineMap = {};

  matchedRubrics.forEach(mr => {
    if (!mr.medicines) return;
    const meds = mr.medicines instanceof Map
      ? Object.fromEntries(mr.medicines)
      : mr.medicines;

    Object.entries(meds).forEach(([medName, grade]) => {
      if (!medicineMap[medName]) {
        medicineMap[medName] = { totalScore: 0, rubricsCount: 0, grades: [] };
      }
      medicineMap[medName].totalScore += grade;
      medicineMap[medName].rubricsCount += 1;
      medicineMap[medName].grades.push(grade);
    });
  });

  return Object.entries(medicineMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalScore - a.totalScore || b.rubricsCount - a.rubricsCount)
    .map((m, idx) => ({ ...m, rank: idx + 1 }));
};

/**
 * Main analysis function — orchestrates AI matching + medicine distribution.
 */
const runAnalysis = async ({ symptoms, repertoryId, repertoryName }) => {
  let rubrics;
  let aiMatches;
  let aiUsed = false;

  if (isAIReady()) {
    try {
      // 1. Get filtered candidate rubrics for fast semantic processing
      rubrics = await getCandidateRubrics(symptoms, repertoryId);
      
      if (rubrics.length > 0) {
        aiMatches = await matchWithAI(symptoms, rubrics, repertoryName);
        aiUsed = true;
      } else {
        // Fallback if no matching candidates exist
        rubrics = await Rubric.find({ repertoryId }).limit(300).lean();
        aiMatches = matchWithKeywords(symptoms, rubrics);
      }
    } catch (err) {
      console.error('Gemini AI error, falling back to keyword logic:', err.message);
      rubrics = await Rubric.find({ repertoryId }).lean();
      aiMatches = matchWithKeywords(symptoms, rubrics);
    }
  } else {
    rubrics = await Rubric.find({ repertoryId }).lean();
    aiMatches = matchWithKeywords(symptoms, rubrics);
  }

  // Enrich AI matches with full rubric data
  const rubricMap = {};
  rubrics.forEach(r => { rubricMap[r._id.toString()] = r; });

  const matchedRubrics = aiMatches
    .filter(m => m.matched_rubric_id)
    .map(m => {
      const rubric = rubricMap[m.matched_rubric_id];
      if (!rubric) return null;
      return {
        symptom: m.symptom,
        rubricId: rubric._id,
        chapter:   rubric.chapter,
        rubric:    rubric.rubric,
        subrubric: rubric.subrubric,
        modalities: rubric.modalities,
        medicines:  rubric.medicines instanceof Map
          ? Object.fromEntries(rubric.medicines)
          : rubric.medicines,
        confidence: m.confidence,
        reasoning:  m.reasoning,
      };
    })
    .filter(Boolean);

  // Compute medicine distribution
  const medicineDistribution = computeMedicineDistribution(matchedRubrics);

  // Count rubrics with and without medicines for debugging
  const rubricsWithMedicines = matchedRubrics.filter(r => r.medicines && Object.keys(r.medicines).length > 0).length;
  const rubricsWithoutMedicines = matchedRubrics.length - rubricsWithMedicines;

  return { 
    matchedRubrics, 
    medicineDistribution, 
    aiUsed,
    stats: {
      totalMatched: matchedRubrics.length,
      withMedicines: rubricsWithMedicines,
      withoutMedicines: rubricsWithoutMedicines
    }
  };
};

const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { extractPageRanges } = require('./pdfService');
const path = require('path');
const fs = require('fs');

const extractChaptersFromPdf = async (filePath, fileName) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Cannot run LLM parsing.');
  }

  let uploadPath = filePath;
  let tempOutputPath = null;

  let originalTotalPages = 0;
  let sliceEndStart = 0;

  try {
    const { PDFDocument } = require('pdf-lib');
    const sourceBytes = fs.readFileSync(filePath);
    const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    originalTotalPages = sourceDoc.getPageCount();

    if (originalTotalPages > 950) {
      console.log(`✂️ PDF has ${originalTotalPages} pages (exceeds Gemini limit). Slicing PDF to fit...`);
      tempOutputPath = path.join(__dirname, '../uploads', `temp-index-${Date.now()}.pdf`);
      
      // Keep first 50 pages (TOC/Index) and the last ~900 pages (Repertory section)
      sliceEndStart = Math.max(50, originalTotalPages - 900);
      await extractPageRanges(filePath, tempOutputPath, [
        { start: 0, end: 49 },
        { start: sliceEndStart, end: originalTotalPages - 1 }
      ]);
      uploadPath = tempOutputPath;
    }
  } catch (err) {
    console.error('Error while checking/slicing PDF pages:', err);
    // Proceed with original file if slicing fails, but it might hit the 1000 page limit
  }

  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
  
  console.log(`📤 Uploading PDF to Gemini File API: ${fileName}...`);
  const uploadResult = await fileManager.uploadFile(uploadPath, {
    mimeType: "application/pdf",
    displayName: fileName,
  });

  console.log(`Uploaded file: ${uploadResult.file.uri}`);

  // Wait for the uploaded file to become active (important for large PDFs)
  let fileState = await fileManager.getFile(uploadResult.file.name);
  let pollAttempts = 0;
  while (fileState.state === "PROCESSING" && pollAttempts < 30) {
    console.log(`⏳ PDF is still processing... waiting 3 seconds... (Attempt ${pollAttempts + 1}/30)`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    fileState = await fileManager.getFile(uploadResult.file.name);
    pollAttempts++;
  }

  if (fileState.state !== "ACTIVE") {
    throw new Error(`Uploaded PDF processing failed or timed out with state: ${fileState.state}`);
  }
  console.log("✅ PDF processing complete! Sending request to Gemini...");

  const { getModel } = require('../config/aiConfig');
  const model = getModel();

  const prompt = `
You are analyzing a pocket manual of Homeopathic Materia Medica & Repertory (e.g. Boericke's manual).
Based on the table of contents, index of remedies, and the repertory section intro pages in the PDF:

1. Identify the two main parts of this book:
   - Part 1: Materia Medica (contains alphabetical remedies starting from page 15-30 onwards).
   - Part 2: Repertory (contains anatomical/system chapters like Mind, Head, Eye, Ear, Nose, Face, Throat, Stomach, Abdomen, Rectum, Urinary, Male, Female, Respiratory, Back, Extremities, Sleep, Fever, Skin, Generalities, etc.).
   
2. Extract the start page numbers for the major chapters. Specifically, look for:
   - "Materia Medica" start page
   - "Repertory" start page
   - Major Repertory Chapters: "MIND", "HEAD", "EYES", "EARS", "NOSE", "FACE", "MOUTH", "THROAT", "STOMACH", "ABDOMEN", "RECTUM", "URINARY ORGANS", "MALE SEXUAL ORGANS", "FEMALE SEXUAL ORGANS", "RESPIRATORY ORGANS", "CIRCULATORY ORGANS", "BACK", "EXTREMITIES", "SLEEP", "FEVER", "SKIN", "GENERALITIES", "MODALITIES".
   - Alphabetical Materia Medica remedies (e.g., Aconite, Belladonna, Bryonia, Calcarea Carb, Lachesis, Lycopodium, Nux Vomica, Pulsatilla, Sulphur, etc.) and their starting page numbers.

3. DO NOT rely blindly on the Table of Contents. You MUST locate the actual headings in the document text and return the ABSOLUTE PDF PAGE NUMBERS (from 1 to the end of the PDF file) where the actual chapter/remedy text begins.

Your output MUST be a valid JSON object mapping each chapter/section/remedy name to its starting page number in the PDF (adjusting for PDF reader page numbering if there is an offset).
For example:
{
  "Materia Medica": 15,
  "Repertory": 640,
  "MIND": 642,
  "HEAD": 680,
  "EYES": 710,
  "ACONITUM NAPELLUS": 16,
  "BELLADONNA": 115
}

Return ONLY a valid JSON object. Do not wrap it in markdown block tags (no \`\`\`json, no \`\`\`), and do not write any introductory or concluding text. Just raw JSON.
`;

  try {
    console.log("🤖 Running Gemini Analysis to extract chapters...");
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri
        }
      },
      prompt
    ]);

    const text = result.response.text().trim();
    console.log("Raw LLM Chapters Response:", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini did not return a valid JSON object');

    let mappings = JSON.parse(jsonMatch[0]);

    // If the PDF was sliced, we must remap the page numbers back to the original PDF's absolute page numbers
    if (originalTotalPages > 950 && sliceEndStart > 0) {
      const adjustedMappings = {};
      Object.keys(mappings).forEach(key => {
        let page = mappings[key];
        if (page > 50) {
          page = page - 50 + sliceEndStart;
        }
        adjustedMappings[key] = page;
      });
      mappings = adjustedMappings;
    }

    // Clean up temporary Gemini File API file
    try {
      await fileManager.deleteFile(uploadResult.file.name);
      console.log("Temporary Gemini file deleted successfully");
    } catch (e) {
      console.warn("Could not delete temporary Gemini file:", e.message);
    }

    if (tempOutputPath && fs.existsSync(tempOutputPath)) {
      try { fs.unlinkSync(tempOutputPath); } catch(e) {}
    }

    return mappings;
  } catch (err) {
    // Cleanup on error
    try {
      await fileManager.deleteFile(uploadResult.file.name);
    } catch (e) {}
    
    if (tempOutputPath && fs.existsSync(tempOutputPath)) {
      try { fs.unlinkSync(tempOutputPath); } catch(e) {}
    }
    
    throw err;
  }
};

module.exports = { 
  runAnalysis, 
  computeMedicineDistribution, 
  extractChaptersFromPdf 
};
