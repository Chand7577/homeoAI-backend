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
  'sub-rubric (en + hi)', 'rubric (english – verb + action)', 'rubric (hindi – क्रिया आधारित)',
  'hindi', 'rubric_hindi', 'subrubric_hindi', 'medicine', 'grade', 'grading'
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
 * Detect if a sheet uses row-based medicine format by scanning all columns
 * to find one that contains medicine names and one that contains grades.
 */
const detectRowBasedColumns = (headers, rows) => {
  if (headers.length < 2 || rows.length === 0) return null;

  let medicineHeader = null;
  let gradeHeader = null;

  // ── Fast path: our content-aware generateKentHeaders already tagged these ──
  if (headers.includes('Medicine') && headers.includes('Grade')) {
    return { medicineHeader: 'Medicine', gradeHeader: 'Grade' };
  }

  // List of common homeopathic medicine abbreviations to check against
  const commonMeds = new Set([
    'acon', 'bell', 'bry', 'calc', 'chin', 'hep', 'hyos', 'ign', 'kali-c', 'lach',
    'lyc', 'merc', 'nat-m', 'nux-v', 'phos', 'puls', 'rhus-t', 'sep', 'sil', 'sulph',
    'thuj', 'zinc', 'ars', 'arn', 'carb-v', 'cham', 'ferr', 'grap', 'op', 'petr'
  ]);

  for (const h of headers) {
    const lowerH = String(h).toLowerCase();
    
    // Check if this column is explicitly named medicine/remedy
    if (lowerH.includes('medicine') || lowerH.includes('remedy')) {
      medicineHeader = h;
      continue;
    }
    
    // Check if it's named grade/grading
    if (lowerH.includes('grade') || lowerH.includes('grading')) {
      gradeHeader = h;
      continue;
    }

    // Sample the column data
    const sample = rows.slice(0, 50).map(r => String(r[h] || '').trim()).filter(Boolean);
    if (sample.length === 0) continue;

    // Check if it looks like grades (all non-empty values are 1, 2, 3)
    const isGrades = sample.every(v => {
      const num = Number(v);
      return !isNaN(num) && num >= 1 && num <= 3;
    });

    if (isGrades && !gradeHeader) {
      gradeHeader = h;
      continue;
    }

    // Check if it looks like medicine names (abbreviations of 2-8 chars, starts with letter, matches common meds or typical patterns)
    const isMeds = sample.every(v => {
      const lowerV = v.toLowerCase();
      // Check if it's a known med abbreviation, or fits typical style (e.g. Sulph, Calc-f, Fl-ac)
      return commonMeds.has(lowerV) || (/^[a-z]{2,8}(-[a-z]{1,4})?$/i.test(v) && isNaN(v));
    });

    if (isMeds && !medicineHeader) {
      medicineHeader = h;
    }
  }

  if (medicineHeader && gradeHeader) {
    return { medicineHeader, gradeHeader };
  }
  return null;
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

/**
 * Enhanced header detection - checks multiple indicators
 */
const detectHeaderRow = (firstRowData) => {
  if (!firstRowData || firstRowData.length === 0) return false;
  
  let headerScore = 0;
  const totalCells = firstRowData.filter(v => v && v.trim()).length;
  
  if (totalCells === 0) return false;
  
  firstRowData.forEach(val => {
    if (!val) return;
    const lower = val.toLowerCase().trim();
    
    // Strong header indicators
    if (lower.includes('chapter')) headerScore += 3;
    if (lower.includes('rubric')) headerScore += 3;
    if (lower.includes('medicine') || lower.includes('remedy')) headerScore += 3;
    if (lower.includes('sub-rubric') || lower.includes('subrubric')) headerScore += 2;
    if (lower.includes('aggrav') || lower.includes('amelior')) headerScore += 2;
    if (lower.includes('synonym') || lower.includes('grading')) headerScore += 2;
    if (lower.includes('english') || lower.includes('hindi')) headerScore += 1;
    
    // Weak indicators (column labels)
    if (/^[a-z]+$/i.test(lower) && lower.length < 3) headerScore += 0.5; // Like "A", "B"
  });
  
  // If score is high enough relative to number of cells, it's likely a header row
  return headerScore >= Math.min(totalCells * 0.8, 5);
};

/**
 * Generate Kent Repertory standard headers based on data analysis.
 * Uses positional index to avoid sparse-array shifting.
 */
const generateKentHeaders = (dataRows, firstRowData) => {
  const numCols = firstRowData.length;
  const headers = [];

  // Sample first 30 rows for analysis
  const sampleRows = dataRows.slice(0, Math.min(30, dataRows.length));

  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    // Use positional index — NOT Object.keys — to avoid sparse shifting
    const columnData = sampleRows
      .map(row => row[colIdx])
      .filter(v => v !== undefined && v !== null && String(v).trim() !== '');

    if (columnData.length === 0) {
      headers.push(`Column_${String.fromCharCode(65 + colIdx)}`);
      continue;
    }

    const headerName = detectColumnType(columnData, colIdx, firstRowData[colIdx]);
    headers.push(headerName);
  }

  return headers;
};

/**
 * Detect column type by analyzing its content.
 */
const detectColumnType = (columnData, colIdx, firstCellValue) => {
  const firstCell = String(firstCellValue || '').trim();

  // Check if ALL non-empty values are grades (1, 2, or 3)
  const allGrades = columnData.every(val => {
    if (!val || String(val).trim() === '') return true;
    const num = Number(val);
    return !isNaN(num) && num >= 1 && num <= 3;
  });

  // Check if values look like medicine abbreviations:
  // e.g. "acon", "bell", "lyc", "kali-c", "nat-m.", "fl-ac"
  const medAbbrevPattern = /^[a-z]{2,10}(-[a-z]{1,6})?[.]?$/i;
  const allMedAbbrev = columnData.every(val => {
    const s = String(val).trim();
    return medAbbrevPattern.test(s) && isNaN(Number(s));
  });

  // Check if values contain Hindi characters
  const hasHindi = columnData.some(val => /[\u0900-\u097F]/.test(String(val)));

  // Check if this column's data looks like English chapter/rubric text (long strings, mixed case)
  const sampleText = columnData.slice(0, 10).join(' ').toLowerCase();
  const hasLongText = columnData.some(v => String(v).trim().length > 15);

  // ── Grade column: all values are 1, 2, or 3 ──
  if (allGrades && columnData.length > 0) {
    return 'Grade';
  }

  // ── Medicine abbreviation column ──
  if (allMedAbbrev && columnData.length > 0) {
    return 'Medicine';
  }

  // ── Hindi column ──
  if (hasHindi && !hasLongText) {
    if (colIdx <= 1) return 'Rubric (Hindi)';
    return 'Rubric (Hindi)';
  }

  // ── Position-based fallback for remaining columns ──
  if (colIdx === 0) return 'Chapter';
  if (colIdx === 1) return hasHindi ? 'Rubric (Hindi)' : 'Rubric (English)';
  if (colIdx === 2) return hasHindi ? 'Rubric (Hindi)' : 'Rubric (English)';
  if (colIdx === 3) return hasHindi ? 'Rubric (Hindi)' : 'Sub-Rubric';

  if (sampleText.includes('aggrav') || sampleText.includes('worse')) return 'Aggravation';
  if (sampleText.includes('amelior') || sampleText.includes('better')) return 'Amelioration';
  if (sampleText.includes('synonym')) return 'Synonyms';

  return `Column_${String.fromCharCode(65 + colIdx)}`;
};

const parseExcel = async (buffer) => {
  console.log(`📊 Starting Excel parsing. Buffer size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Increase efficiency for large files
  const workbook = XLSX.read(buffer, { 
    type: 'buffer', 
    cellDates: true,
    cellStyles: false,  // Don't parse styles (saves memory)
    cellFormula: false, // Don't parse formulas (saves memory)
    sheetStubs: false,  // Don't create stubs for empty cells
    bookSheets: true    // Only read sheet names initially (lazy loading)
  });
  
  const rubrics = [];
  const errors = [];
  const allMedicineHeaders = new Set();
  let totalRowsAcrossSheets = 0;
  const detectedLayouts = new Set();
  
  // Track distinct chapters in the uploaded excel workbook for debugging
  const allDistinctChapters = [];
  const allSampleEyeRows = [];

  console.log(`📋 Found ${workbook.SheetNames.length} sheets to process`);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n🔄 Processing sheet: "${sheetName}"...`);
    const startTime = Date.now();
    
    // Re-read ONLY this sheet to avoid loading all sheets in memory
    const singleSheetWorkbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellStyles: false,
      cellFormula: false,
      sheetStubs: false,
      sheets: [sheetName]  // Only parse this specific sheet
    });
    
    const sheet = singleSheetWorkbook.Sheets[sheetName];
    
    if (!sheet || !sheet['!ref']) {
      console.log(`⏭️  Sheet "${sheetName}" is empty, skipping...`);
      continue;
    }
    
    // Check if first row looks like headers or data
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const firstRowData = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = sheet[cellAddress];
      firstRowData.push(cell ? String(cell.v).trim() : '');
    }
    
    // Enhanced header detection with multiple strategies
    const hasHeaders = detectHeaderRow(firstRowData);
    
    let rawRows;
    let headers;
    
    if (hasHeaders) {
      // Use first row as headers (default behavior)
      rawRows = XLSX.utils.sheet_to_json(sheet, { 
        defval: '', 
        raw: false,
        blankrows: false  // Skip blank rows to save memory
      });
      headers = Object.keys(rawRows[0] || {});
      console.log(`✅ Sheet "${sheetName}": Headers detected -`, headers.slice(0, 5).join(', '));
    } else {
      // No headers detected - use smart column mapping for Kent Repertory
      console.log(`⚠️  Sheet "${sheetName}": No headers detected. Using Kent Repertory standard column mapping.`);
      
      // Read without headers (header: 1 means use row index as keys)
      rawRows = XLSX.utils.sheet_to_json(sheet, { 
        defval: '', 
        raw: false, 
        header: 1,
        blankrows: false  // Skip blank rows
      });
      
      // Smart Kent Repertory column mapping based on data analysis
      headers = generateKentHeaders(rawRows, firstRowData);
      console.log(`📋 Generated headers for "${sheetName}":`, headers.slice(0, 6).join(', '));
      
      // Remap rawRows to use our generated headers using actual array indices
      rawRows = rawRows.map(row => {
        const remapped = {};
        headers.forEach((header, idx) => {
          remapped[header] = (row[idx] !== undefined && row[idx] !== null) ? row[idx] : '';
        });
        return remapped;
      });

      // After remapping, override medicineHeader / gradeHeader if our generated
      // headers now contain 'Medicine' and 'Grade' keys detected from content analysis
      if (headers.includes('Medicine') && headers.includes('Grade')) {
        console.log(`🔍 Sheet "${sheetName}": Content-detected Medicine/Grade columns confirmed`);
      }
    }

    if (!rawRows || rawRows.length === 0) {
      continue; // Skip empty sheets
    }

    const sheetRowCount = rawRows.length;
    totalRowsAcrossSheets += sheetRowCount;
    console.log(`📊 Sheet has ${sheetRowCount} rows`);
    
    // Check if this sheet uses row-based medicine format (Medicine | Grade columns at any position)
    const rowBasedCols = detectRowBasedColumns(headers, rawRows);
    
    if (rowBasedCols) {
      const { medicineHeader, gradeHeader } = rowBasedCols;
      console.log(`✅ Sheet "${sheetName}": Detected ROW-BASED medicine format (Medicine Column: "${medicineHeader}", Grade Column: "${gradeHeader}")`);
      detectedLayouts.add('row-based-medicines');
      
      // Context tracking for row-based merging
      let lastChapter = '';
      let lastChapterHi = '';
      let lastRubric = '';
      let lastRubricHi = '';
      let lastSubrubric = '';
      let lastSubrubricHi = '';

      // Process row-based format: each row is one medicine for one rubric
      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        
        // Extract medicine name and grade
        const medicineName = String(row[medicineHeader] || '').trim();
        const gradeValue = Number(row[gradeHeader]);
        
        if (!medicineName || isNaN(gradeValue) || gradeValue < 1 || gradeValue > 3) {
          return; // Skip invalid rows
        }
        
        // For row-based format, skip the medicine and grade columns from metadata
        const metaHeaders = headers.filter(h => h !== medicineHeader && h !== gradeHeader);
        const fields = resolveFields(row, headers, metaHeaders);
        
        const cleanedSheetName = sheetName.trim();
        const isGenericSheet = /^sheet\d+$/i.test(cleanedSheetName);
        let sheetFallbackChapter = '';
        if (!isGenericSheet) {
          sheetFallbackChapter = cleanedSheetName;
        }

        const effectiveChapter = fields.chapterEn || lastChapter || sheetFallbackChapter;
        const effectiveChapterHi = fields.chapterHi || lastChapterHi;
        if (fields.chapterEn) {
          lastChapter = fields.chapterEn;
          lastChapterHi = fields.chapterHi || '';
        }

        const effectiveRubric = fields.rubricEn || lastRubric;
        const effectiveRubricHi = fields.rubricHi || lastRubricHi;
        if (fields.rubricEn) {
          lastRubric = fields.rubricEn;
          lastRubricHi = fields.rubricHi || '';
        }

        // Subrubric forward fill context
        let effectiveSubrubric = fields.subrubricEn || '';
        let effectiveSubrubricHi = fields.subrubricHi || '';

        if (fields.rubricEn) {
          // If a new main rubric starts, reset the subrubric context
          lastSubrubric = fields.subrubricEn || '';
          lastSubrubricHi = fields.subrubricHi || '';
          effectiveSubrubric = lastSubrubric;
          effectiveSubrubricHi = lastSubrubricHi;
        } else {
          // We are in the same main rubric
          if (fields.subrubricEn) {
            // A new subrubric starts under the same main rubric
            lastSubrubric = fields.subrubricEn;
            lastSubrubricHi = fields.subrubricHi || '';
            effectiveSubrubric = lastSubrubric;
            effectiveSubrubricHi = lastSubrubricHi;
          } else {
            // Continue the previous subrubric (if any)
            effectiveSubrubric = lastSubrubric;
            effectiveSubrubricHi = lastSubrubricHi;
          }
        }

        // Skip row if no chapter or rubric is present
        if (!effectiveChapter && !effectiveRubric) {
          return;
        }

        // Create medicines object with single medicine
        const medicines = {};
        medicines[medicineName] = gradeValue;

        const parts = [
          effectiveChapter, effectiveChapterHi,
          effectiveRubric, effectiveRubricHi,
          effectiveSubrubric, effectiveSubrubricHi,
          ...(fields.synEn || []),
          ...(fields.synHi || []),
          ...(fields.aggEn || []),
          ...(fields.amelEn || []),
        ].filter(Boolean);

        const searchText = parts.join(' ').toLowerCase();

        // Check if we already have this rubric - if yes, add medicine to it
        const existingRubric = rubrics.find(r =>
          r.chapter.en === effectiveChapter &&
          r.rubric.en === effectiveRubric &&
          r.subrubric.en === effectiveSubrubric
        );

        if (existingRubric) {
          // Add medicine to existing rubric
          existingRubric.medicines[medicineName] = gradeValue;
        } else {
          // Create new rubric entry
          rubrics.push({
            chapter:   { en: effectiveChapter, hi: effectiveChapterHi },
            rubric:    { en: effectiveRubric || '(unnamed)', hi: effectiveRubricHi },
            subrubric: { en: effectiveSubrubric, hi: effectiveSubrubricHi },
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
        }
      });
      
      console.log(`✅ Processed ${rawRows.length} medicine entries from row-based format`);
      continue; // Skip to next sheet
    }
    
    // Standard column-based format detection
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
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Sheet "${sheetName}" processed: ${rubrics.length} total rubrics so far (took ${processingTime}s)`);
    
    // Force garbage collection hint by clearing references
    singleSheetWorkbook.Sheets = null;
    
    // Allow event loop to process other tasks
    if (rubrics.length % 5000 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
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
