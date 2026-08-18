const { getAnalysisModel, isAIReady, getProvider } = require('../config/aiConfig');
const Rubric = require('../models/Rubric');
const fs = require('fs');
const HINDI_TO_ENGLISH = {
  // Body parts
  'सिर': ['head', 'cephalalgia'],
  'माथा': ['forehead', 'front head'],
  'आंख': ['eye', 'eyes', 'vision'],
  'आँख': ['eye', 'eyes', 'vision'],
  'कान': ['ear', 'ears', 'hearing'],
  'नाक': ['nose', 'nasal'],
  'मुंह': ['mouth', 'oral'],
  'गला': ['throat', 'pharynx'],
  'छाती': ['chest', 'thorax'],
  'पेट': ['abdomen', 'stomach', 'belly'],
  'उदर': ['abdomen', 'belly'],
  'जांघ': ['thigh', 'femur', 'hip'],
  'घुटना': ['knee'],
  'पैर': ['foot', 'feet', 'leg'],
  'हाथ': ['hand', 'arm'],
  'उंगली': ['finger', 'digit'],
  'त्वचा': ['skin', 'cutaneous'],
  'बाल': ['hair'],
  
  // Symptoms
  'दर्द': ['pain', 'ache', 'aching'],
  'सिरदर्द': ['headache', 'cephalalgia'],
  'बुखार': ['fever', 'pyrexia', 'febris'],
  'खांसी': ['cough', 'tussis'],
  'जुकाम': ['cold', 'coryza'],
  'उल्टी': ['vomiting', 'emesis', 'nausea'],
  'दस्त': ['diarrhea', 'loose stool', 'dysentery'],
  'कब्ज': ['constipation', 'obstipation'],
  'चक्कर': ['dizziness', 'vertigo', 'giddiness'],
  'कमजोरी': ['weakness', 'debility', 'prostration'],
  'थकान': ['fatigue', 'tiredness', 'exhaustion'],
  'फोड़ा': ['boil', 'abscess', 'furuncle', 'pustule'],
  'सूजन': ['swelling', 'inflammation', 'edema'],
  'खुजली': ['itching', 'pruritus'],
  'जलन': ['burning', 'smarting'],
  
  // Mental symptoms
  'क्रोध': ['anger', 'irritability', 'rage'],
  'चिंता': ['anxiety', 'worry', 'apprehension'],
  'भय': ['fear', 'fright', 'afraid'],
  'उदास': ['sad', 'sadness', 'melancholy', 'depression'],
  'चिड़चिड़ा': ['irritable', 'irritability', 'peevish'],
  'कामुक': ['sexual', 'lascivious', 'amorous', 'lustful'],
  'कामेच्छा': ['sexual desire', 'libido', 'erotic', 'lascivious'],
  'नींद': ['sleep', 'sleepiness', 'somnolence'],
  
  // Modalities
  'बढ़ना': ['worse', 'aggravation', 'increased'],
  'घटना': ['better', 'amelioration', 'decreased'],
  'ठंडा': ['cold', 'chilly'],
  'गर्म': ['hot', 'warm', 'heat'],
  'रात': ['night', 'evening'],
  'रात्रि': ['night', 'evening', 'nocturnal'],
  'सुबह': ['morning'],
  'दोपहर': ['noon', 'afternoon'],
  
  // Locations
  'जोड़': ['joint', 'articulation'],
  'हड्डी': ['bone', 'osseous'],
  'मांसपेशी': ['muscle', 'muscular'],
  'नस': ['nerve', 'nervous'],
  
  // Qualities
  'तेज': ['sharp', 'acute', 'severe'],
  'हल्का': ['mild', 'slight'],
  'अधिक': ['increased', 'excessive', 'more'],
  'कम': ['less', 'decreased', 'reduced']
};

/**
 * Translate Hindi words to English search terms
 */
const translateHindiTerms = (text) => {
  const englishTerms = new Set();
  
  Object.entries(HINDI_TO_ENGLISH).forEach(([hindiWord, englishWords]) => {
    if (text.includes(hindiWord)) {
      englishWords.forEach(ew => englishTerms.add(ew));
    }
  });
  
  return Array.from(englishTerms);
};

/**
 * Build a compact rubric summary for the AI prompt.
 * Avoids sending entire DB docs to keep token count low.
 */
const buildRubricSummary = (rubrics) => {
  return rubrics.map(r => ({
    id: r._id.toString(),
    chapter: (r.chapter?.en || '').slice(0, 50),
    rubric: (r.rubric?.en || '').slice(0, 150),
    subrubric: (r.subrubric?.en || '').slice(0, 100),
    agg: (r.modalities?.aggravation || []).slice(0, 3).join(', ').slice(0, 80),
    amel: (r.modalities?.amelioration || []).slice(0, 3).join(', ').slice(0, 80),
    synonyms: (r.synonyms?.en || []).slice(0, 4).join(', ').slice(0, 100)
  }));
};

/**
 * Translates Hindi symptoms to English using built-in dictionary (no API needed)
 */
const translateSymptomToEnglish = async (symptom) => {
  // Use dictionary translation (free, instant)
  const englishTerms = translateHindiTerms(symptom);
  return englishTerms.join(' ');
};

/**
 * Pre-filter rubrics from MongoDB based on keywords in symptoms.
 * Keeps prompt size small, ensuring lightning-fast Gemini execution.
 */
const getCandidateRubrics = async (symptoms, repertoryId) => {
  const candidateMap = new Map();
  const stopWords = new Set([
    'and', 'the', 'for', 'with', 'worse', 'better', 'from', 'after', 'before', 'without', 'about', 'feels',
    'में', 'से', 'का', 'की', 'के', 'को', 'पर', 'है', 'हैं', 'हो', 'होता', 'होती', 'और', 'तथा', 'ने', 'भी', 'ही', 'तो', 'कर', 'करने', 'किया'
  ]);
  const extractSearchTerms = (text) => {
    return text.toLowerCase()
      .replace(/[^\w\s\u0900-\u097F]/g, ' ')  // strip semicolons, punctuation
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 1 && !stopWords.has(w));
  };

  // Each symptom produces at most one indexed lookup. Splitting every tab or
  // semicolon segment used to fan one request out into dozens of DB queries.
  const candidateGroups = await Promise.all(symptoms.map(async (symptom) => {
    if (!symptom.trim()) return [];
    const terms = extractSearchTerms(symptom);
    if (/[\u0900-\u097F]/.test(symptom)) {
      terms.push(...extractSearchTerms(await translateSymptomToEnglish(symptom)));
    }
    const textQuery = [...new Set(terms)].join(' ');
    if (!textQuery) return [];

    // Dynamic limit per symptom based on total symptom count
    // More symptoms = fewer rubrics per query to prevent AI token overflow
    const limitPerQuery = symptoms.length <= 6 ? 22 : 
                          symptoms.length <= 9 ? 15 : 
                          symptoms.length <= 12 ? 10 : 8;

    try {
      return await Rubric.find(
        { repertoryId, $text: { $search: textQuery } },
        { score: { $meta: 'textScore' } }
      )
        .select('_id chapter rubric subrubric modalities synonyms searchText medicines')
        .sort({ score: { $meta: 'textScore' } })
        .limit(limitPerQuery)
        .lean();
    } catch (e) {
      console.error('Text query failed:', e.message);
      return [];
    }
  }));

  // Dynamic candidate limit based on symptom count to prevent token overflow
  // More symptoms = fewer rubrics per symptom to stay within AI token limits
  const MAX_TOTAL_RUBRICS = symptoms.length <= 6 ? 120 : 
                            symptoms.length <= 9 ? 90 : 
                            symptoms.length <= 12 ? 72 : 60;
  
  const maxPerSymptom = Math.ceil(MAX_TOTAL_RUBRICS / symptoms.length);
  
  console.log(`📊 Managing ${symptoms.length} symptoms: ${maxPerSymptom} rubrics/symptom, ${MAX_TOTAL_RUBRICS} total max`);
  
  candidateGroups.forEach((group, idx) => {
    let added = 0;
    group.forEach(m => {
      const key = m._id.toString();
      if (!candidateMap.has(key) && candidateMap.size < MAX_TOTAL_RUBRICS && added < maxPerSymptom) {
        candidateMap.set(key, m);
        added++;
      }
    });
  });


  
  // Fallback: If no candidate matched, try hierarchical matching
if (candidateMap.size === 0) {
  try {
    // Collect all cleaned terms from symptoms
    const allTerms = symptoms
      .flatMap(s => extractSearchTerms(s))
      .filter(Boolean);

    const uniqueTerms = [...new Set(allTerms)];

    if (uniqueTerms.length > 0) {
      const termRegex = uniqueTerms.map(term => new RegExp(term, 'i'));

      // 1. First try matching by Chapter (en + hi)
      let fallback = await Rubric.find({
        repertoryId,
        $or: [
          { 'chapter.en': { $in: termRegex } },
          { 'chapter.hi': { $in: termRegex } }
        ]
      })
        .select('_id chapter rubric subrubric modalities synonyms searchText medicines')
        .limit(20)
        .lean();

      // 2. If still empty, try matching by Rubric (en + hi)
      if (fallback.length === 0) {
        fallback = await Rubric.find({
          repertoryId,
          $or: [
            { 'rubric.en': { $in: termRegex } },
            { 'rubric.hi': { $in: termRegex } }
          ]
        })
          .select('_id chapter rubric subrubric modalities synonyms searchText medicines')
          .limit(20)
          .lean();
      }

      // 3. If still empty, try matching by Subrubric (en + hi)
      if (fallback.length === 0) {
        fallback = await Rubric.find({
          repertoryId,
          $or: [
            { 'subrubric.en': { $in: termRegex } },
            { 'subrubric.hi': { $in: termRegex } }
          ]
        })
          .select('_id chapter rubric subrubric modalities synonyms searchText medicines')
          .limit(20)
          .lean();
      }

      // 4. Last resort: just take any 20 rubrics
      if (fallback.length === 0) {
        fallback = await Rubric.find({ repertoryId })
          .select('_id chapter rubric subrubric modalities synonyms searchText medicines')
          .limit(20)
          .lean();
      }

      fallback.forEach(m => {
        candidateMap.set(m._id.toString(), m);
      });
    }
  } catch (e) {
    console.error('Fallback query failed:', e.message);
  }
}

  return Array.from(candidateMap.values());
};

/**
 * Call Gemini (via Vertex AI) to match symptoms → rubrics.
 * Returns array of matched rubric objects.
 */
const matchWithAI = async (symptoms, rubrics, repertoryName) => {
  const model = getAnalysisModel();
  const rubricSummaries = buildRubricSummary(rubrics);

  const prompt = `You are an expert homeopathic physician and repertory specialist.
Match patient symptoms to the most relevant rubrics from "${repertoryName}".

Consider: chapter, rubric name, subrubric, synonyms, aggravation, and amelioration.
Be clinically precise.

PATIENT SYMPTOMS:
${symptoms.map((s, i) => `${i + 1}. ${s}`).join('\n')}

AVAILABLE RUBRICS:
${JSON.stringify(rubricSummaries)}

IMPORTANT: You MUST provide a match for EVERY symptom listed above (all ${symptoms.length} symptoms).
Even if confidence is low, always return a matched_rubric_id (never null unless truly no match exists).

Return ONLY a valid JSON object with this structure:
{ "matches": [
  {
    "symptom": "exact patient symptom text",
    "matched_rubric_id": "rubric_id or null",
    "confidence": 0-100,
    "reasoning": "brief clinical reason"
  }
] }

Ensure the "matches" array contains exactly ${symptoms.length} entries.`;

  // Groq is primary and responds in ~300-500ms, so 15s timeout is plenty
  // If using Gemini (when key is fixed), it may take up to 10s
  
  // Dynamic token limit based on symptom count
  // Each symptom needs ~250-400 tokens for response
  const outputTokens = Math.min(8000, symptoms.length * 400 + 1000);
  
  console.log(`🎯 AI config: ${symptoms.length} symptoms, ${outputTokens} max output tokens`);
  
  const aiCall = model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      maxOutputTokens: outputTokens
    }
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI timeout after 15s')), 15000)
  );

  const result = await Promise.race([aiCall, timeout]);

  const response = result.response;
  const responseText = response.candidates[0].content.parts[0].text;
  
  console.log(`🤖 AI response length: ${responseText.length} characters`);
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // If response_format JSON gave us an object, try to extract array
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.matches || parsed.results) {
        console.log(`✅ AI returned ${(parsed.matches || parsed.results).length} matches`);
        return parsed.matches || parsed.results;
      }
    } catch (parseError) {
      console.error('❌ AI response parsing failed:', parseError.message);
      console.error('Response text:', responseText.substring(0, 500));
      throw new Error('AI returned invalid JSON format');
    }
    throw new Error('AI returned invalid JSON format');
  }

  const matches = JSON.parse(jsonMatch[0]);
  console.log(`✅ AI returned ${matches.length} matches`);
  return matches;
};

/**
 * Keyword fallback when Gemini API key is not configured.
 * Basic string matching against searchText field.
 * Handles tab-separated compound input (chapter\trubric\thindi) and strips punctuation.
 */
const matchWithKeywords = (symptoms, rubrics) => {
  return symptoms.map(symptom => {
    // Flatten tab-separated input into one space-joined string
    const flatSymptom = symptom.includes('\t')
      ? symptom.split('\t').join(' ')
      : symptom;

    // Strip punctuation (semicolons, commas, etc.) before tokenizing
    const terms = flatSymptom
      .toLowerCase()
      .replace(/[^\w\s\u0900-\u097F]/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 2);

    // Also expand any Hindi terms we know about
    const expandedTerms = new Set(terms);
    Object.entries(HINDI_TO_ENGLISH).forEach(([hindi, englishArr]) => {
      if (flatSymptom.includes(hindi)) {
        englishArr.forEach(e => expandedTerms.add(e.toLowerCase()));
      }
    });
    const allTerms = Array.from(expandedTerms);

    let bestMatch = null;
    let bestScore = 0;

    rubrics.forEach(rubric => {
      const text = rubric.searchText || '';
      let score = allTerms.filter(t => t.length > 2 && text.includes(t)).length;
      
      // Boost score if chapter matches (gives priority to correct chapter)
      const chapterEn = (rubric.chapter?.en || '').toLowerCase();
      const chapterHi = (rubric.chapter?.hi || '').toLowerCase();
      const symptomLower = flatSymptom.toLowerCase();
      
      if (chapterEn && symptomLower.includes(chapterEn)) {
        score += 5; // Big boost for chapter match
      }
      if (chapterHi && symptomLower.includes(chapterHi)) {
        score += 5;
      }
      
      // Also boost if rubric name closely matches
      const rubricEn = (rubric.rubric?.en || '').toLowerCase();
      if (rubricEn && symptomLower.includes(rubricEn)) {
        score += 3;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rubric;
      }
    });

    return {
      symptom,
      matched_rubric_id: bestMatch ? bestMatch._id.toString() : null,
      confidence: bestMatch ? Math.min(bestScore * 15, 80) : 0,
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
  const startedAt = Date.now();
  let candidateFinishedAt;
  let matchingFinishedAt;
  let rubrics;
  let aiMatches;
  let aiUsed = false;
  let warnings = [];

  // Validate symptom count and add warnings
  if (symptoms.length > 15) {
    warnings.push({
      type: 'too_many_symptoms',
      message: `⚠️ ${symptoms.length} symptoms provided. For best AI analysis, consider limiting to 12-15 symptoms.`,
      recommendation: 'Focus on the most prominent and characteristic symptoms for better results.'
    });
    console.warn(`⚠️ Warning: ${symptoms.length} symptoms may strain AI token limits`);
  }

  if (symptoms.length === 0) {
    throw new Error('No symptoms provided for analysis');
  }

  try {
    // Always use the fast $text index to get best candidates first, 
    // regardless of whether we use AI or fallback keyword matching.
    console.log('🔍 [PERF] Starting candidate rubric search...');
    rubrics = await getCandidateRubrics(symptoms, repertoryId);
    rubrics = mergeDuplicateRubrics(rubrics);
    candidateFinishedAt = Date.now();
    console.log(`✅ [PERF] Found ${rubrics.length} candidates in ${candidateFinishedAt - startedAt}ms`);
    
    if (isAIReady() && rubrics.length > 0) {
      try {
        console.log(`🤖 [PERF] Starting AI matching with ${getProvider() || 'AI'}...`);
        console.log(`📋 Analyzing ${symptoms.length} symptoms...`);
        aiMatches = await matchWithAI(symptoms, rubrics, repertoryName);
        aiUsed = true;
        console.log(`✅ [PERF] AI matching completed in ${Date.now() - candidateFinishedAt}ms`);
        console.log(`📊 AI returned ${aiMatches.length} matches for ${symptoms.length} symptoms`);
        
        // Validate: AI should return one match per symptom
        if (aiMatches.length !== symptoms.length) {
          console.warn(`⚠️ AI returned ${aiMatches.length} matches but expected ${symptoms.length}!`);
        }
      } catch (err) {
        console.error('AI error, falling back to keyword logic:', err.message);
        aiMatches = matchWithKeywords(symptoms, rubrics);
      }
    } else {
      aiMatches = matchWithKeywords(symptoms, rubrics);
    }
    matchingFinishedAt = Date.now();
  } catch (err) {
    console.error('Fatal analysis error, using extreme fallback:', err.message);
    rubrics = await Rubric.find({ repertoryId }).limit(500).lean();
    rubrics = mergeDuplicateRubrics(rubrics);
    aiMatches = matchWithKeywords(symptoms, rubrics);
    candidateFinishedAt = Date.now();
    matchingFinishedAt = candidateFinishedAt;
  }

  // Enrich AI matches with full rubric data (medicines already included from first query)
  const rubricMap = {};
  rubrics.forEach(r => { rubricMap[r._id.toString()] = r; });

  console.log(`🗺️ [ENRICHMENT] Rubric map contains ${Object.keys(rubricMap).length} rubrics`);
  console.log(`🔍 [ENRICHMENT] AI returned ${aiMatches.length} matches to process`);
  
  // Check for null matches BEFORE filtering
  const nullMatches = aiMatches.filter(m => !m.matched_rubric_id);
  if (nullMatches.length > 0) {
    console.warn(`⚠️ [ENRICHMENT] AI returned ${nullMatches.length} NULL matches:`);
    nullMatches.forEach(m => {
      console.warn(`   - Symptom: "${m.symptom}" → No rubric ID (confidence: ${m.confidence}%)`);
    });
  }
  
  let droppedCount = 0;

  const matchedRubrics = aiMatches
    .filter(m => m.matched_rubric_id)
    .map(m => {
      const rubric = rubricMap[m.matched_rubric_id];
      if (!rubric) {
        droppedCount++;
        console.error(`❌ [ENRICHMENT] Rubric ${m.matched_rubric_id} NOT FOUND for symptom: "${m.symptom}"`);
        return null;
      }
      return {
        symptom: m.symptom,
        rubricId: rubric._id,
        chapter:   rubric.chapter,
        rubric:    rubric.rubric,
        subrubric: rubric.subrubric,
        modalities: rubric.modalities,
        medicines: rubric.medicines || {},
        confidence: m.confidence,
        reasoning:  m.reasoning,
      };
    })
    .filter(Boolean);
  
  console.log(`✅ [ENRICHMENT] Successfully enriched ${matchedRubrics.length} rubrics`);
  console.log(`❌ [ENRICHMENT] Dropped ${droppedCount} rubrics (not in candidate set)`);

  

  // Compute medicine distribution
  const medicineDistribution = computeMedicineDistribution(matchedRubrics);

  // Count rubrics with and without medicines for debugging
  const rubricsWithMedicines = matchedRubrics.filter(r => r.medicines && Object.keys(r.medicines).length > 0).length;
  const rubricsWithoutMedicines = matchedRubrics.length - rubricsWithMedicines;

  return { 
    matchedRubrics, 
    medicineDistribution, 
    aiUsed,
    warnings, // Include warnings in response
    stats: {
      totalMatched: matchedRubrics.length,
      withMedicines: rubricsWithMedicines,
      withoutMedicines: rubricsWithoutMedicines,
      symptomCount: symptoms.length,
      rubricsPerSymptom: (matchedRubrics.length / symptoms.length).toFixed(1),
      timingsMs: {
        candidates: candidateFinishedAt - startedAt,
        matching: matchingFinishedAt - candidateFinishedAt,
        enrichmentAndScoring: Date.now() - matchingFinishedAt,
        total: Date.now() - startedAt,
      }
    }
  };
};

const extractChaptersFromPdf = async (filePath, fileName) => {
  if (!isAIReady()) {
    console.warn('⚠️ Vertex AI not configured. Skipping AI extraction.');
    console.log('💡 Users can manually map medicine names in the UI, which is accurate and reliable.');
    return {};
  }

  // ── STRATEGY 1: Extract bookmarks/outline from the PDF (fast, zero RAM, works on any size) ──
  try {
    const { PDFDocument, PDFName, PDFDict, PDFRef, PDFArray } = require('pdf-lib');
    console.log('🔖 Attempting to extract bookmarks from PDF outline...');
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const numPages = pdfDoc.getPageCount();
    const pages = pdfDoc.getPages();
    const pageRefsMap = new Map();
    for (let i = 0; i < numPages; i++) {
      const page = pages[i];
      if (page.ref) pageRefsMap.set(page.ref.toString(), i);
    }

    const catalog = pdfDoc.catalog;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));

    if (outlinesRef) {
      const outlines = pdfDoc.context.lookup(outlinesRef);
      if (outlines instanceof PDFDict) {
        const bookmarks = [];
        const bodySystemSections = new Set([
          'mind', 'head', 'eyes', 'ears', 'nose', 'face', 'mouth', 'throat',
          'stomach', 'abdomen', 'rectum', 'chest', 'back', 'extremities',
          'skin', 'sleep', 'fever', 'generalities', 'modalities', 'relationship', 'dose',
          'common names', 'urinary system', 'male sexual system', 'female sexual system',
          'locomotor system', 'respiratory system', 'circulatory system', 'nervous system',
          'digestive system', 'materia medica', 'repertory', 'index', 'contents', 'preface'
        ]);

        function traverseOutlineItem(itemRef) {
          if (!itemRef) return;
          const item = pdfDoc.context.lookup(itemRef);
          if (!(item instanceof PDFDict)) return;

          const titleObj = item.get(PDFName.of('Title'));
          let title = '';
          if (titleObj) {
            title = titleObj.decodeText ? titleObj.decodeText() : titleObj.toString();
          }

          let destRef = null;
          const dest = item.get(PDFName.of('Dest'));
          const a = item.get(PDFName.of('A'));

          if (dest) {
            const resolvedDest = pdfDoc.context.lookup(dest);
            if (resolvedDest instanceof PDFArray) destRef = resolvedDest.get(0);
          } else if (a) {
            const action = pdfDoc.context.lookup(a);
            if (action instanceof PDFDict) {
              const sObj = action.get(PDFName.of('S'));
              if (sObj && sObj.toString() === '/GoTo') {
                const dObj = action.get(PDFName.of('D'));
                if (dObj) {
                  const resolvedD = pdfDoc.context.lookup(dObj);
                  if (resolvedD instanceof PDFArray) destRef = resolvedD.get(0);
                }
              }
            }
          }

          if (destRef instanceof PDFRef) {
            const pageIdx = pageRefsMap.get(destRef.toString());
            const titleTrimmed = title.trim();
            const titleLower = titleTrimmed.toLowerCase();
            if (pageIdx !== undefined && titleTrimmed && !bodySystemSections.has(titleLower)) {
              bookmarks.push({ name: titleTrimmed, page: pageIdx + 1 });
            }
          }

          const firstRef = item.get(PDFName.of('First'));
          if (firstRef) traverseOutlineItem(firstRef);
          const nextRef = item.get(PDFName.of('Next'));
          if (nextRef) traverseOutlineItem(nextRef);
        }

        const firstRef = outlines.get(PDFName.of('First'));
        if (firstRef) traverseOutlineItem(firstRef);

        if (bookmarks.length > 10) {
          const mapping = {};
          bookmarks.forEach(b => { mapping[b.name] = b.page; });
          console.log(`✅ Extracted ${bookmarks.length} medicine bookmarks from PDF outline. Skipping AI.`);
          return mapping;
        } else {
          console.log(`⚠️ Only ${bookmarks.length} bookmarks found in outline. Falling back to AI text parsing.`);
        }
      }
    } else {
      console.log('ℹ️ No outline/bookmarks in PDF. Falling back to AI text parsing.');
    }
  } catch (bookmarkErr) {
    console.warn('⚠️ PDF bookmark extraction failed, falling back to AI:', bookmarkErr.message);
  }

  // ── STRATEGY 2: AI text-based extraction (requires text-based PDF, uses more memory) ──
  // Skip if PDF is larger than 10MB to avoid OOM on memory-restricted servers like Render free tier
  try {
    const stats = fs.statSync(filePath);
    const sizeInMB = stats.size / (1024 * 1024);
    if (sizeInMB > 10) {
      console.warn(`⚠️ PDF is large (${sizeInMB.toFixed(2)} MB). AI text parsing skipped to prevent server memory crash.`);
      console.log('💡 Doctors can manually map medicine names using the UI.');
      return {};
    }
  } catch (err) {
    console.warn('⚠️ Could not check PDF file size:', err.message);
  }

  try {
    console.log('📄 Parsing PDF text for AI extraction...');
    const pdfParse = require('pdf-parse');
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer, { max: 0 });
    const totalPages = pdfData.numpages;
    const fullText = pdfData.text;

    console.log(`📚 PDF has ${totalPages} pages, ${fullText.length} characters`);

    if (fullText.length < 10000) {
      console.warn('⚠️ PDF text extraction yielded very little text. PDF may be image-based or encrypted.');
      console.log('💡 Manual mapping recommended for accuracy.');
      return {};
    }

    const lines = fullText.split('\n');

    // Build a simplified representation: find medicine names (ALL CAPS lines) and their approximate positions
    const medicineMatches = [];
    const medicinePattern = /^[A-Z][A-Z\s\-\.]{3,50}$/; // Match ALL CAPS words 4-50 chars
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and page headers/footers
      if (!line || line.length < 4) continue;
      
      // Check if this looks like a medicine name (ALL CAPS, reasonable length)
      if (medicinePattern.test(line)) {
        // Look at surrounding context to confirm it's a medicine heading
        const nextLines = lines.slice(i + 1, i + 5).join(' ').toLowerCase();
        
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
    
    const model = getAnalysisModel();
    
    // Convert PDF to base64
    const base64Data = pdfBuffer.toString('base64');
    
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

    console.log("🤖 Running Vertex AI Gemini to find exact page numbers...");
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }]
    });

    const response = result.response;
    const text = response.candidates[0].content.parts[0].text.trim();
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

    return mappings;
  } catch (err) {
    console.warn('⚠️ AI text extraction failed or skipped due to memory limit:', err.message);
    return {};
  }
};

/**
 * Scans a PDF file page-by-page to detect exact physical page numbers for medicine headings.
 * Works fast on any size PDF, without high RAM or AI token limits.
 */
const scanMedicinePagesFromPdf = async (filePathOrUrl) => {
  const pdfParse = require('pdf-parse');
  let pdfBuffer;

  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    console.log(`🌐 Downloading PDF from URL for AI page scanning: ${filePathOrUrl}`);
    pdfBuffer = await new Promise((resolve, reject) => {
      const protocol = filePathOrUrl.startsWith('https://') ? require('https') : require('http');
      const chunks = [];
      const request = protocol.get(filePathOrUrl, { timeout: 45000 }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirect = res.headers.location;
          console.log(`↪️  Redirect to: ${redirect}`);
          const redirectProto = redirect.startsWith('https://') ? require('https') : require('http');
          redirectProto.get(redirect, { timeout: 45000 }, (res2) => {
            res2.on('data', chunk => chunks.push(chunk));
            res2.on('end', () => resolve(Buffer.concat(chunks)));
            res2.on('error', reject);
          }).on('error', reject);
          return;
        }
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('PDF download timed out')); });
    });
  } else {
    if (!fs.existsSync(filePathOrUrl)) {
      throw new Error(`PDF file not found at ${filePathOrUrl}`);
    }
    pdfBuffer = fs.readFileSync(filePathOrUrl);
  }

  console.log(`📄 Scanning PDF pages for medicine headers... (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  
  const pdfData = await pdfParse(pdfBuffer, { max: 0 });
  const fullText = pdfData.text || '';
  const pageChunks = fullText.split('\f');
  
  console.log(`📚 Total physical PDF pages detected: ${pageChunks.length}`);

  const detectedMappings = {};
  
  const ignoreSections = new Set([
    'MATERIA MEDICA', 'REPERTORY', 'MIND', 'HEAD', 'EYES', 'EARS', 
    'NOSE', 'FACE', 'MOUTH', 'THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM',
    'URINARY ORGANS', 'MALE SEXUAL ORGANS', 'FEMALE SEXUAL ORGANS',
    'RESPIRATORY ORGANS', 'CIRCULATORY ORGANS', 'BACK', 'EXTREMITIES',
    'SLEEP', 'FEVER', 'SKIN', 'GENERALITIES', 'MODALITIES', 'PREFACE',
    'CONTENTS', 'INDEX', 'INTRODUCTION'
  ]);

  const knownRemedies = new Set([
    "ABIES CANADENSIS", "ABIES NIGER", "ABROTANUM", "ABSINTHIUM", "ACETANILIDUM", "ACETICUM ACIDUM",
    "ACONITUM NAPELLUS", "ACTAEA SPICATA", "ADONIS VERNALLIS", "AESCULUS HIPPOCASTANUM", "AETHUSA CYNAPIUM",
    "AGARICUS MUSCARIUS", "AGNUS CASTUS", "ALLIUM CEPA", "ALLIUM SATIVUM", "ALOE SOCOTRINA",
    "ALSTONIA SCHOLARIS", "ALUMINA", "AMBRA GRISEA", "AMMONIACUM DOREMA", "AMMONIUM CARBONICUM",
    "AMMONIUM CAUSTICUM", "AMMONIUM MURIATICUM", "AMMONIUM PHOSPHORICUM", "AMYLIS NITRIS",
    "ANACARDIUM ORIENTALE", "ANAGALLIS ARVENSIS", "ANHALONIUM LEWINII", "ANTHRACINUM",
    "ANTIMONIUM CRUDUM", "ANTIMONIUM TARTARICUM", "ANTIPYRINUM", "APIS MELLIFICA", "APIUM GRAVEOLENS",
    "APOCYNUM CANNABINUM", "ARGENTUM METALLICUM", "ARGENTUM NITRICUM", "ARNICA MONTANA", "ARSENICUM ALBUM",
    "ARSENICUM IODATUM", "ARTEMISIA VULGARIS", "ARUM TRIPHYLLUM", "ASAFOETIDA", "ASARUM EUROPAEUM",
    "ASCLEPIAS TUBEROSA", "ASTERIAS RUBENS", "AURUM METALLICUM", "AURUM MURIATICUM NATRONATUM",
    "AVENA SATIVA", "AZADIRACHTA INDICA", "BAPTISIA TINCTORIA", "BARYTA CARBONICA", "BARYTA MURIATICA",
    "BELLADONNA", "BELLIS PERENNIS", "BENZOICUM ACIDUM", "BERBERIS VULGARIS", "BISMUTHUM", "BORAX VENETA",
    "BOVISTA LYCOPERDON", "BROMIUM", "BRYONIA ALBA", "BUFO RANA", "CACTUS GRANDIFLORUS",
    "CADMIUM SULPHURICUM", "CALADIUM SEGUINUM", "CALCAREA CARBONICA", "CALCAREA FLUORICA",
    "CALCAREA PHOSPHORICA", "CALCAREA SULPHURICA", "CALENDULA OFFICINALIS", "CAMPHORA",
    "CANNABIS INDICA", "CANNABIS SATIVA", "CANTHARIS VESICATORIA", "CAPSICUM ANNUUM", "CARBO ANIMALIS",
    "CARBO VEGETABILIS", "CARBOLICUM ACIDUM", "CARCINOSINUM", "CARDUUS MARIANUS", "CAULOPHYLLUM THALICTROIDES",
    "CAUSTICUM", "CEANOTHUS AMERICANUS", "CEDRON", "CHAMOMILLA", "CHELIDONIUM MAJUS", "CHELONE GLABRA",
    "CHENOPODIUM ANTHELMINTICUM", "CHIMAPHILA UMBELLATA", "CHINA OFFICINALIS", "CHININUM ARSENICOSUM",
    "CHININUM SULPHURICUM", "CHIONANTHUS VIRGINICA", "CHLORALUM HYDRATUM", "CHOLESTERINUM",
    "CICUTA VIROSA", "CINA MARITIMA", "CINCHONA OFFICINALIS", "CINERARIA MARITIMA", "CINNAMOMUM",
    "CISTUS CANADENSIS", "CLEMATIS ERECTA", "COCA (ERYTHROXYLON COCA)", "COCCULUS INDICUS",
    "COCCUS CACTI", "CODEINUM", "COFFEA CRUDA", "COLCHICUM AUTUMNALE", "COLLINSONIA CANADENSIS",
    "COLOCYNTHIS", "CONDURANGO", "CONIUM MACULATUM", "CONVALLARIA MAJALIS", "COPAIVA OFFICINALIS",
    "CORALLIUM RUBRUM", "CRATAEGUS OXACANTHA", "CROCUS SATIVUS", "CROTON TIGLIUM", "CUPRUM ARSENICOSUM",
    "CUPRUM METALLICUM", "CURARE", "CYCLAMEN EUROPAEUM", "DAPHNE INDICA", "DIGITALIS PURPUREA",
    "DIOSCOREA VILLOSA", "DOLICHOS PRURIENS", "DROSERA ROTUNDIFOLIA", "DULCAMARA", "ECHINACEA ANGUSTIFOLIA",
    "ELATERIUM", "EQUISETUM HYEMALE", "ERIGERON CANADENSE", "EUCALYPTUS GLOBULUS", "EUPATORIUM PERFOLIATUM",
    "EUPHORBIUM OFFICINARUM", "EUPHRASIA OFFICINALIS", "EUPIONUM", "FERRUM IODATUM", "FERRUM METALLICUM",
    "FERRUM PHOSPHORICUM", "FERRUM PICRICUM", "FILIX MAS", "FORMICA RUFA", "FRAXINUS AMERICANA",
    "FUCUS VESICULOSUS", "GAMBOGIA", "GAULTHERIA PROCUMBENS", "GELSEMIUM SEMPERVIRENS", "GENTIANA LUTEA",
    "GERANIUM MACULATUM", "GINSENG", "GLONOINUM", "GNAPHILIUM POLYCEPHALUM", "GOSSYPIUM HERBACEUM",
    "GRAPHITES", "GRATIOLA OFFICINALIS", "GRINDELIA ROBUSTA", "GUAEACUM OFFICINALE", "HAMAMELIS VIRGINICA",
    "HECLA LAVA", "HEDEOMA PULEGIOIDES", "HELLEBORUS NIGER", "HELONIAS DIOICA", "HEPAR SULPHURIS CALCAREUM",
    "HISTAMINUM", "HYDRASTIS CANADENSIS", "HYDROCOTYLE ASIATICA", "HYDROCYANICUM ACIDUM",
    "HYOSCYAMUS NIGER", "HYPERICUM PERFORATUM", "IGNATIA AMARA", "INDIUM METALLICUM", "IODIUM",
    "IPECACUANHA", "IRIS VERSICOLOR", "JABORANDI", "JATROPHA CURCAS", "JUGLANS CINEREA",
    "JUGLANS REGIA", "JUSTICIA ADHATODA", "KALIUM ARSENICOSUM", "KALIUM BICHROMICUM", "KALIUM BROMATUM",
    "KALIUM CARBONICUM", "KALIUM CHLORICUM", "KALIUM CYANATUM", "KALIUM IODATUM", "KALIUM MURIATICUM",
    "KALIUM NITRICUM", "KALIUM PHOSPHORICUM", "KALIUM PERMANGANATUM", "KALIUM SILICICUM",
    "KALIUM SULPHURICUM", "KALMIA LATIFOLIA", "KREOSOTUM", "LAC CANINUM", "LAC DEFLORATUM",
    "LACHESIS MUTUS", "LACHNANTHES TINCTORIA", "LACTICUM ACIDUM", "LAPIS ALBUS", "LAPPA ARCTIUM",
    "LATHYRUS SATIVUS", "LATRODECTUS MACTANS", "LAUROCERASUS", "LECITHINUM", "LEDUM PALUSTRE",
    "LEMNA MINOR", "LEPTANDRA VIRGINICA", "LILIUM TIGRINUM", "LITHIUM CARBONICUM", "LOBELIA INFLATA",
    "LYCOPODIUM CLAVATUM", "LYCOPERSICUM ESCULENTUM", "LYCOPUS VIRGINICUS", "LYSINUM (HYDROPHOBINUM)",
    "MAGNESIA CARBONICA", "MAGNESIA MURIATICA", "MAGNESIA PHOSPHORICA", "MAGNESIA SULPHURICA",
    "MANGANUM ACETICUM", "MANGIFERA INDICA", "MEDORRHINUM", "MELILOTUS OFFICINALIS", "MENYANTHES TRIFOLIATA",
    "MEPHITIS MEPHITICA", "MERCURIUS SOLUBILIS", "MERCURIUS CORROSIVUS", "MERCURIUS CYANATUS",
    "MERCURIUS DULCIS", "MERCURIUS IODATUS FLAVUS", "MERCURIUS IODATUS RUBER", "MERCURIUS VIVUS",
    "MEZEREUM", "MILLEFOLIUM", "MORPHINUM", "MOSCHUS", "MUREX PURPUREA", "MURIATICUM ACIDUM",
    "MYGALE LASIODORA", "MYRICA CERIFERA", "MYRISTICA SEBIFERA", "NAJA TRIPUDIANS", "NAPHTHALINUM",
    "NATRUM ARSENICICUM", "NATRUM CARBONICUM", "NATRUM MURIATICUM", "NATRUM PHOSPHORICUM",
    "NATRUM SALICYLICUM", "NATRUM SULPHURICUM", "NITRICUM ACIDUM", "NUX MOSCHATA", "NUX VOMICA",
    "NYCTANTHES ARBOR-TRISTIS", "OCIMUM CANUM", "OENANTHE CROCATA", "OLEANDER (NERIUM OLEANDER)",
    "OLEUM JECORIS ASELLI", "OLEUM SANTALI", "ONOSMODIUM VIRGINIANUM", "OPIUM (PAPAVER SOMNIFERUM)",
    "ORIGANUM MAJORANA", "ORNITHOGALUM UMBELLATUM", "OXALICUM ACIDUM", "OXYTROPIS LAMBERTI",
    "PAEONIA OFFICINALIS", "PALLADIUM METALLICUM", "PAREIRA BRAVA", "PARIS QUADRIFOLIA",
    "PASSIFLORA INCARNATA", "PETROLEUM", "PETROSELINUM SATIVUM", "PHOSPHORICUM ACIDUM", "PHOSPHORUS",
    "PHYSOSTIGMA VENENOSUM", "PHYTOLACCA DECANDRA", "PICRICUM ACIDUM", "PILOCARPINUM HYDROCHLORICUM",
    "PLANTAGO MAJOR", "PLATINUM METALLICUM", "PLUMBUM METALLICUM", "PODOPHYLLUM PELTATUM",
    "POPULUS TREMULOIDES", "PSORINUM", "PTELEA TRIFOLIATA", "PULSATILLA NIGRICANS", "PYROGENIUM",
    "RADIUM BROMATUM", "RANUNCULUS BULBOSUS", "RANUNCULUS SCELERATUS", "RAPHANUS SATIVUS",
    "RATANHIA PERUVIANA", "RHEUM PALMATUM", "RHODODENDRON CHRYSANTHUM", "RHUS TOXICODENDRON",
    "RHUS VENENATA", "RICINUS COMMUNIS", "ROBINIA PSEUDACACIA", "RUTA GRAVEOLENS", "SABADILLA",
    "SABAL SERRULATA", "SABINA", "SALICYLICUM ACIDUM", "SALVIA OFFICINALIS", "SAMBUCUS NIGER",
    "SANGUINARIA CANADENSIS", "SANICULA AQUA", "SANTONINUM", "SARSAPARILLA OFFICINALIS",
    "SCROPHULARIA NODOSA", "SECALE CORNUTUM", "SELENIUM METALLICUM", "SENECIO AUREUS", "SENEGA",
    "SENNA", "SEPIA OFFICINALIS", "SILICEA TERRA", "SPIGELIA ANTHELMIA", "SPONGIA TOSTA",
    "STANNUM METALLICUM", "STAPHYSAGRIA", "STELLARIA MEDIA", "STICTA PULMONARIA", "STRAMONIUM",
    "STRONTIUM CARBONICUM", "STROPHANTHUS HISPIDUS", "STRYCHNINUM PURUM", "SULPHUR",
    "SULPHURICUM ACIDUM", "SYMPHYTUM OFFICINALE", "SYPHILINUM", "TABACUM", "TARANTULA HISPANA",
    "TARAXACUM OFFICINALE", "TELLURIUM METALLICUM", "TEREBINTHINA", "TEUCRIUM MARUM VERUM",
    "THALLIUM METALLICUM", "THERIDION CURASSAVICUM", "THLASPI BURSA PASTORIS", "THUJA OCCIDENTALIS",
    "THYROIDINUM", "TRILLIUM PENDULUM", "TUBERCULINUM BOVINUM", "URANIUM NITRICUM", "UREA PURA",
    "URTICA URENS", "USTILAGO MAYDIS", "UVA URSI", "VALERIANA OFFICINALIS", "VARIOLINUM",
    "VERATRUM ALBUM", "VERATRUM VIRIDE", "VERBASCUM THAPSUS", "VIBURNUM OPULUS", "VINCA MINOR",
    "VIOLA TRICOLOR", "VISCUM ALBUM", "WYETHIA HELENIOIDES", "XANTHOXYLUM FRAXINEUM", "YOHIMBINUM",
    "ZINCUM METALLICUM", "ZINCUM VALERIANICUM", "ZINGIBER OFFICINALE"
  ]);

  for (let idx = 0; idx < pageChunks.length; idx++) {
    const physicalPage = idx + 1;
    const pageContent = pageChunks[idx] || '';
    const lines = pageContent.split('\n').map(l => l.trim()).filter(Boolean);
    const topLines = lines.slice(0, 20);

    for (let line of topLines) {
      const upperLine = line.toUpperCase().replace(/[^A-Z\s\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!upperLine || upperLine.length < 3 || ignoreSections.has(upperLine)) continue;

      if (knownRemedies.has(upperLine)) {
        if (!detectedMappings[upperLine]) {
          detectedMappings[upperLine] = physicalPage;
        }
      } else {
        for (let remedy of knownRemedies) {
          if (!detectedMappings[remedy] && upperLine.startsWith(remedy)) {
            detectedMappings[remedy] = physicalPage;
          }
        }
      }

      if (/^[A-Z][A-Z\s\-\.]{3,40}$/.test(upperLine)) {
        if (!ignoreSections.has(upperLine) && !detectedMappings[upperLine]) {
          const words = upperLine.split(' ');
          if (words.length <= 5 && !upperLine.includes('CHAPTER') && !upperLine.includes('PAGE')) {
            detectedMappings[upperLine] = physicalPage;
          }
        }
      }
    }
  }

  console.log(`✅ AI scan complete: mapped ${Object.keys(detectedMappings).length} medicines to physical PDF pages!`);
  return detectedMappings;
};

module.exports = { 
  runAnalysis, 
  computeMedicineDistribution, 
  extractChaptersFromPdf,
  scanMedicinePagesFromPdf
};
