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

    // Keep track of candidates added for THIS specific symptom
    const symptomCandidates = new Map();

    // Stage 1: Find rubrics matching ALL active terms (intersection)
    const andQuery = {
      repertoryId,
      $and: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
    };

    try {
      const matches = await Rubric.find(andQuery).limit(40).lean();
      matches.forEach(m => {
        symptomCandidates.set(m._id.toString(), m);
      });
    } catch (e) {
      console.error('AND query failed, fallback to OR:', e.message);
    }

    // Stage 2: If we have fewer than 30 candidates for this specific symptom, pull in rubrics matching ANY active term (union)
    if (symptomCandidates.size < 30) {
      const orQuery = {
        repertoryId,
        $or: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
      };
      try {
        const orMatches = await Rubric.find(orQuery).limit(50).lean();
        orMatches.forEach(m => {
          if (symptomCandidates.size < 60) {
            symptomCandidates.set(m._id.toString(), m);
          }
        });
      } catch (e) {
        console.error('OR query failed:', e.message);
      }
    }

    // Merge this symptom's candidates into the global candidate map
    symptomCandidates.forEach((m, id) => {
      candidateMap.set(id, m);
    });
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
 * Merges duplicate rubrics that share the same Chapter, Rubric, and Subrubric path.
 * Combines their medicines (taking the maximum grade) and modalities/synonyms.
 */
const mergeDuplicateRubrics = (rubrics) => {
  const mergedMap = new Map();

  rubrics.forEach(r => {
    const chapter = r.chapter?.en || '';
    const rubric = r.rubric?.en || '';
    const subrubric = r.subrubric?.en || '';
    const key = `${chapter}::${rubric}::${subrubric}`.toLowerCase().trim();

    if (!mergedMap.has(key)) {
      // Clone the rubric object so we don't mutate DB instances or other references
      const clone = {
        _id: r._id,
        chapter: { ...r.chapter },
        rubric: { ...r.rubric },
        subrubric: { ...r.subrubric },
        modalities: {
          aggravation: [...(r.modalities?.aggravation || [])],
          amelioration: [...(r.modalities?.amelioration || [])]
        },
        synonyms: {
          en: [...(r.synonyms?.en || [])],
          hi: [...(r.synonyms?.hi || [])]
        },
        searchText: r.searchText || '',
        // Make medicines a normal plain JS object
        medicines: r.medicines instanceof Map 
          ? Object.fromEntries(r.medicines) 
          : { ...(r.medicines || {}) }
      };
      mergedMap.set(key, clone);
    } else {
      const existing = mergedMap.get(key);

      // Merge medicines (taking the maximum grade)
      const meds = r.medicines instanceof Map 
        ? Object.fromEntries(r.medicines) 
        : (r.medicines || {});
      
      Object.entries(meds).forEach(([medName, grade]) => {
        existing.medicines[medName] = Math.max(existing.medicines[medName] || 0, grade);
      });

      // Merge modalities
      const aggSet = new Set(existing.modalities.aggravation);
      (r.modalities?.aggravation || []).forEach(x => aggSet.add(x));
      existing.modalities.aggravation = Array.from(aggSet);

      const amelSet = new Set(existing.modalities.amelioration);
      (r.modalities?.amelioration || []).forEach(x => amelSet.add(x));
      existing.modalities.amelioration = Array.from(amelSet);

      // Merge synonyms
      const synEnSet = new Set(existing.synonyms.en);
      (r.synonyms?.en || []).forEach(x => synEnSet.add(x));
      existing.synonyms.en = Array.from(synEnSet);

      const synHiSet = new Set(existing.synonyms.hi);
      (r.synonyms?.hi || []).forEach(x => synHiSet.add(x));
      existing.synonyms.hi = Array.from(synHiSet);
    }
  });

  return Array.from(mergedMap.values());
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
      rubrics = mergeDuplicateRubrics(rubrics);
      
      if (rubrics.length > 0) {
        aiMatches = await matchWithAI(symptoms, rubrics, repertoryName);
        aiUsed = true;
      } else {
        // Fallback if no matching candidates exist
        rubrics = await Rubric.find({ repertoryId }).limit(300).lean();
        rubrics = mergeDuplicateRubrics(rubrics);
        aiMatches = matchWithKeywords(symptoms, rubrics);
      }
    } catch (err) {
      console.error('Gemini AI error, falling back to keyword logic:', err.message);
      rubrics = await Rubric.find({ repertoryId }).lean();
      rubrics = mergeDuplicateRubrics(rubrics);
      aiMatches = matchWithKeywords(symptoms, rubrics);
    }
  } else {
    rubrics = await Rubric.find({ repertoryId }).lean();
    rubrics = mergeDuplicateRubrics(rubrics);
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
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'NEW_GEMINI_KEY_HERE') {
    console.warn('⚠️ GEMINI_API_KEY not configured. Skipping AI extraction.');
    console.log('💡 Users can manually map medicine names in the UI, which is accurate and reliable.');
    return {};
  }

  console.log('📄 Parsing PDF structure...');
  
  const pdfParse = require('pdf-parse');
  const pdfBuffer = fs.readFileSync(filePath);
  
  // Get full PDF data with proper options
  const pdfData = await pdfParse(pdfBuffer, {
    // No max limit - parse entire PDF
    max: 0
  });
  const totalPages = pdfData.numpages;
  const fullText = pdfData.text;
  
  console.log(`📚 PDF has ${totalPages} pages, ${fullText.length} characters`);
  
  // If text extraction failed (very small text), warn and skip
  if (fullText.length < 10000) {
    console.warn('⚠️ PDF text extraction yielded very little text. PDF may be image-based or encrypted.');
    console.log('💡 Manual mapping recommended for accuracy.');
    return {};
  }
  
  // Split text into lines and identify page breaks
  // pdf-parse doesn't give us page-by-page, so we'll use form feeds and heuristics
  const lines = fullText.split('\n');
  
  // Build a simplified representation: find medicine names (ALL CAPS lines) and their approximate positions
  const medicineMatches = [];
  const medicinePattern = /^[A-Z][A-Z\s\-\.]{3,50}$/; // Match ALL CAPS words 4-50 chars
  
  let currentLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and page headers/footers
    if (!line || line.length < 4) continue;
    
    // Check if this looks like a medicine name (ALL CAPS, reasonable length)
    if (medicinePattern.test(line)) {
      // Look at surrounding context to confirm it's a medicine heading
      const nextLines = lines.slice(i + 1, i + 5).join(' ').toLowerCase();
      const prevLines = lines.slice(Math.max(0, i - 3), i).join(' ').toLowerCase();
      
      // Medicine headings are typically followed by descriptive text or sections like "mind", "head"
      const hasMedicalContext = nextLines.includes('mind') || nextLines.includes('head') || 
                                 nextLines.includes('dose') || nextLines.includes('fever') ||
                                 nextLines.includes('common') || nextLines.includes('syno');
      
      // Skip if it's likely a section heading we want to filter out
      const isRepertorySection = ['MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 
                                   'THROAT', 'STOMACH', 'ABDOMEN', 'CHEST', 'BACK', 
                                   'EXTREMITIES', 'SKIN', 'SLEEP', 'FEVER'].includes(line);
      
      if (!isRepertorySection && (hasMedicalContext || line.length > 10)) {
        medicineMatches.push({
          name: line,
          lineNumber: i,
          context: nextLines.substring(0, 100)
        });
      }
    }
  }
  
  console.log(`🔍 Found ${medicineMatches.length} potential medicine headings`);
  
  if (medicineMatches.length === 0) {
    console.warn('⚠️ No medicine names detected in PDF text');
    return {};
  }
  
  // Now use Gemini File API to get accurate page numbers
  const { GoogleAIFileManager } = require("@google/generative-ai/server");
  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
  
  console.log(`📤 Uploading PDF to Gemini File API: ${fileName}...`);
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: "application/pdf",
    displayName: fileName,
  });

  console.log(`Uploaded file: ${uploadResult.file.uri}`);

  // Wait for the uploaded file to become active
  let fileState = await fileManager.getFile(uploadResult.file.name);
  let pollAttempts = 0;
  while (fileState.state === "PROCESSING" && pollAttempts < 30) {
    console.log(`⏳ PDF processing... (${pollAttempts + 1}/30)`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    fileState = await fileManager.getFile(uploadResult.file.name);
    pollAttempts++;
  }

  if (fileState.state !== "ACTIVE") {
    throw new Error(`PDF processing failed with state: ${fileState.state}`);
  }
  console.log("✅ PDF ready for analysis");

  const { getModel } = require('../config/aiConfig');
  const model = getModel();

  // Give AI the list of medicine names we found, ask it to find their EXACT page numbers
  const medicineNames = medicineMatches.map(m => m.name);
  
  const prompt = `
You are analyzing a Homeopathic Materia Medica PDF to find EXACT page numbers for medicine names.

I have identified ${medicineNames.length} medicine names in this PDF:
${medicineNames.slice(0, 100).map((name, i) => `${i + 1}. ${name}`).join('\n')}

YOUR TASK:
For EACH medicine name above, find the FIRST page number where that medicine's main description begins.

IDENTIFICATION RULES:
1. The medicine name appears as a MAIN HEADING (usually ALL CAPS or bold)
2. It's the START of that medicine's section, not a page continuation
3. Following text describes that medicine's symptoms (sections like MIND, HEAD, STOMACH, etc.)
4. Page headers/footers may repeat the name - IGNORE those, find the FIRST occurrence as main heading

CRITICAL: Use the ACTUAL page numbers visible in the PDF (bottom of pages or PDF reader pagination)

OUTPUT FORMAT (JSON only, no explanations, no markdown):
{
  "ABIES CANADENSIS": 15,
  "ABROTANUM": 19,
  "ACONITUM NAPELLUS": 34,
  "ACTAEA RACEMOSA": 45,
  ...
}

Rules:
- Return ONLY the JSON object
- NO markdown code blocks
- NO explanations or comments
- Use exact medicine names from my list
- Include ONLY medicines you can locate with confidence
- Skip any medicine if you cannot find its page number with certainty

Return the JSON now:
`;

  try {
    console.log("🤖 Running Gemini to find exact page numbers...");
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
    console.log("Raw AI Response (first 500 chars):", text.substring(0, 500));

    // Extract JSON, handling markdown code blocks
    let jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        jsonMatch = [codeBlockMatch[1]];
      } else {
        throw new Error('AI did not return valid JSON');
      }
    }

    const mappings = JSON.parse(jsonMatch[0]);
    
    console.log(`✅ Successfully mapped ${Object.keys(mappings).length} medicines to page numbers`);
    console.log('Sample mappings:', Object.entries(mappings).slice(0, 5));

    // Clean up Gemini file
    try {
      await fileManager.deleteFile(uploadResult.file.name);
    } catch (e) {
      console.warn('Could not delete Gemini file:', e.message);
    }
    
    return mappings;
  } catch (err) {
    // Clean up on error
    try {
      await fileManager.deleteFile(uploadResult.file.name);
    } catch (e) {}
    
    console.error('❌ AI extraction failed:', err.message);
    throw err;
  }
};

module.exports = { 
  runAnalysis, 
  computeMedicineDistribution, 
  extractChaptersFromPdf 
};
