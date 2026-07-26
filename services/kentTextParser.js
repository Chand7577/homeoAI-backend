'use strict';

/**
 * Kent's Repertory specific parser.
 * 
 * KEY FORMAT RULES FROM ACTUAL KENT PAGES:
 * 1. Rubrics end with a colon ":"
 * 2. Medicines follow after colon on same or next lines
 * 3. Medicines are comma-separated with periods: "Acon., Bell., Calc."
 * 4. Medicine lists can span multiple indented lines
 * 5. New rubric starts when we see text ending with ":"
 */

/**
 * Extract all medicines from a multi-line medicine block.
 * Handles medicines that span across multiple lines.
 * Attempts to detect grading from typography patterns.
 * 
 * Kent's Grading System:
 * - Grade 3 (Bold): Most proven/important remedies
 * - Grade 2 (Italic): Significant remedies  
 * - Grade 1 (Normal): Listed but less emphasized
 * 
 * Since OCR loses formatting, we use heuristics:
 * - ALL CAPS or mostly caps = Grade 3
 * - All lowercase or starts lowercase = Grade 2
 * - Standard capitalization = Grade 1
 * 
 * @param {string} medicineText - Raw text containing medicines
 * @returns {Array} - Array of {name, grading} objects
 */
const extractMedicinesFromBlock = (medicineText) => {
  const medicines = [];
  
  // Split by commas and periods
  const parts = medicineText
    .replace(/\n/g, ' ') // Join wrapped lines
    .split(/[,;]/)       // Split by comma or semicolon
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  for (let part of parts) {
    // Remove trailing period
    const cleaned = part.replace(/\.$/, '').trim();
    if (!cleaned || cleaned.length < 2) continue;
    
    // Skip descriptive text (not medicines)
    if (cleaned.includes(' and ') || cleaned.includes(' from ') || 
        cleaned.includes(' like ') || cleaned.includes(' as ') ||
        cleaned.length > 20) {
      continue;
    }
    
    // Determine grading based on capitalization patterns
    let grading = 1; // Default
    let medName = cleaned;
    
    // Count uppercase vs lowercase letters (excluding hyphens, periods)
    const letters = cleaned.replace(/[\-\.]/g, '');
    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    const lowerCount = (letters.match(/[a-z]/g) || []).length;
    const totalLetters = upperCount + lowerCount;
    
    if (totalLetters === 0) continue; // Not a valid medicine
    
    const upperRatio = upperCount / totalLetters;
    
    // Grade 3: Mostly uppercase (>70% caps) - Bold medicines
    // Examples: "BELL", "DIG", "Calc", "PULS"
    if (upperRatio > 0.7) {
      grading = 3;
    }
    // Grade 2: Mostly lowercase (<40% caps) - Italic medicines  
    // Examples: "chin", "dros", "mag-m", "nat-s"
    else if (upperRatio < 0.4) {
      grading = 2;
    }
    // Grade 1: Mixed case (40-70% caps) - Normal medicines
    // Examples: "Acon", "Agar", "Bell"
    else {
      grading = 1;
    }
    
    // Special case: Single capital letter followed by lowercase is usually Grade 1
    // Examples: "Acon", "Bell" (even though they might look like Grade 3)
    if (/^[A-Z][a-z]+(-[a-z]+)?$/.test(cleaned)) {
      grading = 1;
    }
    
    // Special case: All lowercase with hyphen is usually Grade 2 (italic)
    // Examples: "mag-c", "nat-m", "calc-p"
    if (/^[a-z]+-[a-z]+$/.test(cleaned)) {
      grading = 2;
    }
    
    medName = cleaned;
    
    if (medName && medName.length >= 2) {
      medicines.push({
        name: medName,
        grading: grading
      });
    }
  }
  
  return medicines;
};

/**
 * Parse Kent's Repertory OCR text using actual Kent format rules.
 * 
 * @param {string} ocrText - Raw OCR text from Tesseract
 * @returns {Array} - Structured medicine-rubric rows
 */
const parseKentOcrText = (ocrText) => {
  console.log('[Kent Text Parser] Starting Kent-format parsing...');
  
  const lines = ocrText.split('\n');
  const results = [];
  const seenKeys = new Set();
  
  let currentChapter = '';
  let currentRubric = '';
  let currentIndent = 0;
  let collectingMedicines = false;
  let medicineBuffer = '';
  
  const rubricStack = [];
  const indentStack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed) {
      // Empty line - finalize medicine collection if active
      if (collectingMedicines && medicineBuffer) {
        const medicines = extractMedicinesFromBlock(medicineBuffer);
        const rubricPath = rubricStack.join(' - ');
        
        for (const med of medicines) {
          const key = `${rubricPath}|||${med.name}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push({
              chapter_en: currentChapter,
              chapter_hi: '',
              rubric_en: rubricPath,
              rubric_hi: '',
              medicine: med.name,
              grading: med.grading
            });
          }
        }
        
        medicineBuffer = '';
        collectingMedicines = false;
      }
      continue;
    }
    
    // Skip page numbers
    if (/^\d+$/.test(trimmed)) continue;
    
    // Detect chapter (ALL CAPS, at top of page)
    if (i < 10 && /^[A-Z]{2,}$/.test(trimmed) && trimmed.length < 20) {
      currentChapter = trimmed;
      rubricStack.length = 0;
      rubricStack.push(currentChapter);
      indentStack.length = 0;
      indentStack.push(0);
      console.log(`[Kent Parser] Chapter: ${currentChapter}`);
      continue;
    }
    
    // Check if line contains a rubric (ends with colon)
    if (trimmed.includes(':')) {
      // Finalize previous medicine collection
      if (collectingMedicines && medicineBuffer) {
        const medicines = extractMedicinesFromBlock(medicineBuffer);
        const rubricPath = rubricStack.join(' - ');
        
        for (const med of medicines) {
          const key = `${rubricPath}|||${med.name}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push({
              chapter_en: currentChapter,
              chapter_hi: '',
              rubric_en: rubricPath,
              rubric_hi: '',
              medicine: med.name,
              grading: med.grading
            });
          }
        }
        medicineBuffer = '';
      }
      
      // Parse new rubric
      const colonIndex = trimmed.indexOf(':');
      const rubricText = trimmed.substring(0, colonIndex).trim();
      const medicinesAfterColon = trimmed.substring(colonIndex + 1).trim();
      
      // Determine indentation level
      const indent = line.match(/^(\s*)/)[1].length;
      
      // Update rubric stack based on indentation
      while (indentStack.length > 1 && indent <= indentStack[indentStack.length - 1]) {
        indentStack.pop();
        rubricStack.pop();
      }
      
      // Add new rubric to stack
      rubricStack.push(rubricText);
      indentStack.push(indent);
      
      // Start collecting medicines
      collectingMedicines = true;
      medicineBuffer = medicinesAfterColon;
      
      console.log(`[Kent Parser] Rubric: ${rubricStack.join(' - ')}`);
      
    } else if (collectingMedicines) {
      // Continue collecting medicines from wrapped lines
      medicineBuffer += ' ' + trimmed;
    }
  }
  
  // Finalize last medicine block
  if (collectingMedicines && medicineBuffer) {
    const medicines = extractMedicinesFromBlock(medicineBuffer);
    const rubricPath = rubricStack.join(' - ');
    
    for (const med of medicines) {
      const key = `${rubricPath}|||${med.name}`.toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          chapter_en: currentChapter,
          chapter_hi: '',
          rubric_en: rubricPath,
          rubric_hi: '',
          medicine: med.name,
          grading: med.grading
        });
      }
    }
  }
  
  console.log(`[Kent Text Parser] ✅ Parsed ${results.length} medicine-rubric rows`);
  
  return results;
};

/**
 * Enhanced parser for two-column layouts.
 * Detects and splits two-column pages before parsing.
 */
const parseKentOcrTextAdvanced = (ocrText) => {
  console.log('[Kent Text Parser] Starting advanced Kent-format parsing...');
  
  // Try simple parser first
  const simpleResults = parseKentOcrText(ocrText);
  
  // If we got good results, return them
  if (simpleResults.length > 30) {
    return simpleResults;
  }
  
  // Otherwise, try column-aware parsing
  console.log('[Kent Text Parser] Few results from simple parse, trying column split...');
  
  const lines = ocrText.split('\n');
  
  // Detect two-column layout by checking for very long lines
  const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  
  if (avgLineLength > 80) {
    console.log('[Kent Text Parser] Detected two-column layout');
    
    const leftColumn = [];
    const rightColumn = [];
    
    for (const line of lines) {
      if (line.length > 80) {
        // Split roughly in middle
        const mid = Math.floor(line.length / 2);
        // Find nearest space to split cleanly
        let splitPoint = mid;
        for (let j = mid; j < Math.min(mid + 20, line.length); j++) {
          if (line[j] === ' ' || line[j] === '\t') {
            splitPoint = j;
            break;
          }
        }
        leftColumn.push(line.substring(0, splitPoint));
        rightColumn.push(line.substring(splitPoint));
      } else {
        leftColumn.push(line);
      }
    }
    
    const leftResults = parseKentOcrText(leftColumn.join('\n'));
    const rightResults = parseKentOcrText(rightColumn.join('\n'));
    
    // Combine and deduplicate
    const combined = [...leftResults, ...rightResults];
    const seenKeys = new Set();
    const deduplicated = [];
    
    for (const row of combined) {
      const key = `${row.rubric_en}|||${row.medicine}`.toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduplicated.push(row);
      }
    }
    
    console.log(`[Kent Text Parser] Column-aware: ${deduplicated.length} unique rows`);
    return deduplicated;
  }
  
  return simpleResults;
};

module.exports = {
  parseKentOcrText,
  parseKentOcrTextAdvanced,
  extractMedicinesFromBlock
};
