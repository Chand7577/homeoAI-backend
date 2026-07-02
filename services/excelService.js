const XLSX = require('xlsx');

/**
 * AUTO-DETECTING EXCEL PARSER
 * 
 * Supports layouts:
 * 
 * LAYOUT A — Named columns (our standard format):
 *   chapter_en | chapter_hi | rubric_en | rubric_hi | subrubric_en | subrubric_hi |
 *   aggravation | amelioration | synonyms_en | synonyms_hi | [Medicine1] | [Medicine2] ...
 *
 * LAYOUT B — Positional / Mastersheet format (auto-detected):
 *   Col A: Chapter
 *   Col B: Rubric
 *   Col C: SubRubric
 *   Col D onwards: Medicine columns (header = medicine name, value = grade 1/2/3)
 *
 * LAYOUT C — Single Column Medicines List format (NEW):
 *   Columns contain rubric metadata (Aggravation, Amelioration, Synonyms, etc.)
 *   One column named something like "Medicines (Full Name – 3)" containing list:
 *   "Stramonium; Calcarea carbonica; Pulsatilla nigricans"
 */

const KNOWN_META_COLS = new Set([
  'chapter_en','chapter_hi','rubric_en','rubric_hi',
  'subrubric_en','subrubric_hi','subrubric',
  'aggravation','amelioration','synonyms_en','synonyms_hi',
  'chapter','rubric','section','sub rubric','sub-rubric',
  'chapter (english)','chapter (hindi)','rubric (english)','rubric (hindi)',
  'synonyms (en + hi)', 'aggravation (en + hi)', 'amelioration (en + hi)',
  'sub-rubric (en + hi)', 'rubric (english – verb + action)', 'rubric (hindi – क्रिया आधारित)'
]);

const looksLikeGrade = (val) => {
  if (val === null || val === undefined || val === '') return true; // empty = no grade
  const n = Number(val);
  return !isNaN(n) && n >= 0 && n <= 3;
};

const isMetaHeader = (h) => {
  const lower = String(h).toLowerCase().trim();
  if (lower.includes('medicine') || lower.includes('remedy') || lower.includes('remedies')) {
    return false; // Definitely medicine column
  }
  return KNOWN_META_COLS.has(lower) ||
    lower.startsWith('chapter') ||
    lower.startsWith('rubric') ||
    lower.startsWith('sub') ||
    lower.startsWith('synon') ||
    lower.startsWith('aggrav') ||
    lower.startsWith('amelior') ||
    lower.startsWith('section');
};

/**
 * Helper to split bilingual fields (e.g. "When alone / अकेले में" -> { en: "When alone", hi: "अकेले में" })
 */
const parseBilingualField = (val) => {
  if (!val) return { en: '', hi: '' };
  const str = String(val).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    return {
      en: parts[0].trim(),
      hi: parts[1] ? parts[1].trim() : ''
    };
  }
  // Check for en-dash or hyphen with Hindi text on the right
  const parts = str.split(/[–\-]/);
  if (parts.length >= 2) {
    const left = parts[0].trim();
    const right = parts.slice(1).join('-').trim();
    // Simple check if right part contains Hindi characters
    const hasHindi = /[\u0900-\u097F]/.test(right);
    if (hasHindi) {
      return { en: left, hi: right };
    }
  }
  return { en: str, hi: '' };
};

/**
 * Helper to parse lists containing bilingual items (e.g. "Dread – भीति; Terror – आतंक")
 */
const parseBilingualList = (rawStr) => {
  const enList = [];
  const hiList = [];
  if (!rawStr) return { en: enList, hi: hiList };

  // Split by semicolon
  const parts = String(rawStr).split(/[;]/).map(s => s.trim()).filter(Boolean);
  parts.forEach(part => {
    const { en, hi } = parseBilingualField(part);
    if (en) enList.push(en);
    if (hi) hiList.push(hi);
  });

  return { en: enList, hi: hiList };
};

/**
 * Detect medicine columns
 */
const detectMedicineColumns = (headers, rows) => {
  const medicineHeaders = [];
  const metaHeaders = [];

  headers.forEach(h => {
    if (isMetaHeader(h)) {
      metaHeaders.push(h);
      return;
    }
    // Check if this column contains a single medicine list or grade numbers
    const lower = h.toLowerCase();
    if (lower.includes('medicine') || lower.includes('remedy') || lower.includes('remedies')) {
      medicineHeaders.push(h);
      return;
    }

    const sample = rows.slice(0, 20).map(r => r[h]);
    const gradeCount = sample.filter(v => looksLikeGrade(v)).length;
    if (gradeCount >= sample.length * 0.7) {
      medicineHeaders.push(h);
    } else {
      metaHeaders.push(h);
    }
  });

  return { medicineHeaders, metaHeaders };
};

/**
 * Resolve fields case-insensitively with partial match support
 */
const resolveFields = (row, headers, metaHeaders) => {
  const get = (...keys) => {
    for (const k of keys) {
      const found = headers.find(h => {
        const lowerH = String(h).toLowerCase().trim();
        const lowerK = String(k).toLowerCase().trim();
        return lowerH === lowerK || lowerH.includes(lowerK);
      });
      if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
    }
    return '';
  };

  // Named / smart matching
  const chapterEnRaw = get('chapter (english)', 'chapter_en', 'chapter') || get('section');
  const chapterHiRaw = get('chapter (hindi)', 'chapter_hi');
  
  const rubricEnRaw  = get('rubric (english – verb + action)', 'rubric (english)', 'rubric_en', 'rubric');
  const rubricHiRaw  = get('rubric (hindi – क्रिया आधारित)', 'rubric (hindi)', 'rubric_hi');

  const subrubricRaw = get('sub-rubric', 'sub rubric', 'subrubric_en', 'subrubric');

  const aggRaw       = get('aggravation', 'agg', 'worse');
  const amelRaw      = get('amelioration', 'amel', 'better');
  const synRaw       = get('synonyms', 'synonym', 'syn');

  // Parse bilingual fields
  const chapterSplit = parseBilingualField(chapterEnRaw);
  const chapterEn = chapterSplit.en || chapterEnRaw;
  const chapterHi = chapterHiRaw || chapterSplit.hi;

  const rubricSplit = parseBilingualField(rubricEnRaw);
  const rubricEn = rubricSplit.en || rubricEnRaw;
  const rubricHi = rubricHiRaw || rubricSplit.hi;

  const subrubricSplit = parseBilingualField(subrubricRaw);
  const subrubricEn = subrubricSplit.en || subrubricRaw;
  const subrubricHi = subrubricSplit.hi;

  const aggBilingual = parseBilingualList(aggRaw);
  const amelBilingual = parseBilingualList(amelRaw);
  const synBilingual = parseBilingualList(synRaw);

  return {
    chapterEn, chapterHi,
    rubricEn, rubricHi,
    subrubricEn, subrubricHi,
    aggEn: aggBilingual.en,
    aggHi: aggBilingual.hi,
    amelEn: amelBilingual.en,
    amelHi: amelBilingual.hi,
    synEn: synBilingual.en,
    synHi: synBilingual.hi
  };
};

const parseExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  
  const rubrics = [];
  const errors = [];
  const allMedicineHeaders = new Set();
  let totalRowsAcrossSheets = 0;
  const detectedLayouts = new Set();
  
  // Track distinct chapters in the uploaded excel workbook for debugging
  const allDistinctChapters = [];
  const allSampleEyeRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    
    // Check if first row looks like headers or data
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const firstRowData = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = sheet[cellAddress];
      firstRowData.push(cell ? String(cell.v).trim() : '');
    }
    
    // Detect if first row is a header row or data row
    const hasHeaders = firstRowData.some(val => {
      const lower = val.toLowerCase();
      return lower.includes('chapter') || 
             lower.includes('rubric') || 
             lower.includes('medicine') ||
             lower.includes('remedy') ||
             lower.includes('sub') ||
             lower.includes('aggrav') ||
             lower.includes('amelior') ||
             lower.includes('synonym');
    });
    
    let rawRows;
    let headers;
    
    if (hasHeaders) {
      // Use first row as headers (default behavior)
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      headers = Object.keys(rawRows[0] || {});
    } else {
      // No headers detected - generate generic column names
      console.log(`⚠️  Sheet "${sheetName}": No headers detected. Using positional columns (A, B, C, D...).`);
      
      // Read without headers (header: 1 means use row index as keys)
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, header: 1 });
      
      // Generate column names based on position
      // Assume: Col A = Chapter, Col B = Rubric, Col C = Subrubric, Rest = Medicines or metadata
      headers = Object.keys(rawRows[0] || {}).map((key, idx) => {
        if (idx === 0) return 'Chapter';
        if (idx === 1) return 'Rubric';
        if (idx === 2) return 'Sub-Rubric';
        // Last column is medicine list
        if (idx === Object.keys(rawRows[0]).length - 1) return 'Medicines';
        // Other columns might be aggravation, amelioration, etc.
        return `Column_${String.fromCharCode(65 + idx)}`; // Column_A, Column_B, etc.
      });
      
      // Remap rawRows to use our generated headers
      rawRows = rawRows.map(row => {
        const remapped = {};
        Object.keys(row).forEach((oldKey, idx) => {
          remapped[headers[idx]] = row[oldKey];
        });
        return remapped;
      });
    }

    if (!rawRows || rawRows.length === 0) {
      continue; // Skip empty sheets
    }

    totalRowsAcrossSheets += rawRows.length;
    
    // headers already defined above based on header detection
    const { medicineHeaders, metaHeaders } = detectMedicineColumns(headers, rawRows);

    // Track distinct chapters in rawRows
    const rawChapters = [...new Set(rawRows.map(r => String(r['Chapter'] || r['chapter'] || '').trim()).filter(Boolean))];
    rawChapters.forEach(ch => {
      if (!allDistinctChapters.includes(ch)) allDistinctChapters.push(ch);
    });
    
    const eyeRows = rawRows.filter(r => JSON.stringify(r).toLowerCase().includes('eye') || JSON.stringify(r).toLowerCase().includes('twitch'));
    eyeRows.forEach(row => {
      if (allSampleEyeRows.length < 5) allSampleEyeRows.push(row);
    });

    // Detect single-column medicine list mode for this sheet
    let isSingleColMode = false;
    let singleColHeader = null;
    let defaultGrade = 3;

    const foundSingleColHeader = medicineHeaders.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('medicine') || lower.includes('remedy') || lower.includes('remedies');
    });

    if (foundSingleColHeader && medicineHeaders.length === 1) {
      isSingleColMode = true;
      singleColHeader = foundSingleColHeader;
      const matchGrade = foundSingleColHeader.match(/\b([1-3])\b/);
      if (matchGrade) {
        defaultGrade = Number(matchGrade[1]);
      }
      detectedLayouts.add('single-column-medicines');
    } else {
      detectedLayouts.add('column-per-medicine');
    }

    medicineHeaders.forEach(h => allMedicineHeaders.add(h));

    let lastChapter = '';

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const fields = resolveFields(row, headers, metaHeaders);

      const cleanedSheetName = sheetName.trim();
      const isGenericSheet = /^sheet\d+$/i.test(cleanedSheetName);
      
      let sheetFallbackChapter = '';
      if (!isGenericSheet) {
        sheetFallbackChapter = cleanedSheetName;
      }

      const effectiveChapter = fields.chapterEn || lastChapter || sheetFallbackChapter;
      if (fields.chapterEn) lastChapter = fields.chapterEn;

      // Skip row if no chapter or rubric is present
      if (!effectiveChapter && !fields.rubricEn) {
        if (idx > 0) errors.push(`[Sheet: ${sheetName}] Row ${rowNum}: No chapter or rubric. Skipped.`);
        return;
      }

      const medicines = {};

      if (isSingleColMode) {
        const rawMeds = row[singleColHeader] || '';
        const medList = rawMeds.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        medList.forEach(medToken => {
          const gradeMatch = medToken.match(/\b([1-3])\b/) || medToken.match(/\(([1-3])\)/);
          let grade = defaultGrade;
          let medName = medToken;

          if (gradeMatch) {
            grade = Number(gradeMatch[1]);
            medName = medToken.replace(/\b[1-3]\b/g, '').replace(/[\(\)]/g, '').trim();
          }
          
          if (medName) {
            medicines[medName] = grade;
          }
        });
      } else {
        medicineHeaders.forEach(med => {
          const rawVal = row[med];
          const grade = Number(rawVal);
          if (!isNaN(grade) && grade >= 1 && grade <= 3) {
            medicines[String(med).trim()] = grade;
          }
        });
      }

      // Only skip if absolutely no medicines
      if (!fields.rubricEn && Object.keys(medicines).length === 0) {
        errors.push(`[Sheet: ${sheetName}] Row ${rowNum}: No rubric and no medicine grades. Skipped.`);
        return;
      }

      const parts = [
        effectiveChapter, fields.chapterHi,
        fields.rubricEn, fields.rubricHi,
        fields.subrubricEn, fields.subrubricHi,
        ...(fields.synEn || []),
        ...(fields.synHi || []),
        ...(fields.aggEn || []),
        ...(fields.amelEn || []),
      ].filter(Boolean);

      const searchText = parts.join(' ').toLowerCase();

      rubrics.push({
        chapter:   { en: effectiveChapter, hi: fields.chapterHi },
        rubric:    { en: fields.rubricEn || '(unnamed)', hi: fields.rubricHi },
        subrubric: { en: fields.subrubricEn, hi: fields.subrubricHi },
        modalities: {
          aggravation:  fields.aggEn,
          amelioration: fields.amelEn,
        },
        synonyms: {
          en: fields.synEn,
          hi: fields.synHi,
        },
        searchText,
        medicines,
      });
    });
  }

  // Write Excel structure debug to excel_debug.json for all sheets
  try {
    const fs = require('fs');
    const path = require('path');
    const debugPath = path.join(__dirname, '..', '..', 'excel_debug.json');
    fs.writeFileSync(debugPath, JSON.stringify({
      sheetNames: workbook.SheetNames,
      totalRowsAcrossSheets,
      distinctChaptersInExcel: allDistinctChapters,
      eyeMatchRowCount: allSampleEyeRows.length,
      sampleEyeRows: allSampleEyeRows,
      medicineHeaders: Array.from(allMedicineHeaders),
      detectedLayouts: Array.from(detectedLayouts)
    }, null, 2));
    console.log('✅ Wrote multi-sheet Excel structure debug to excel_debug.json');
  } catch (err) {
    console.error('❌ Failed to write excel_debug.json', err);
  }

  if (rubrics.length === 0) {
    throw new Error('Excel file sheets are empty or could not be parsed. Please check the file.');
  }

  return {
    rubrics,
    errors,
    medicineHeaders: Array.from(allMedicineHeaders),
    totalRows: totalRowsAcrossSheets,
    detectedLayout: Array.from(detectedLayouts).join(', '),
  };
};

module.exports = { parseExcel };
