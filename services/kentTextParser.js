'use strict';

/**
 * Kent's Repertory Parser - CORRECT FORMAT UNDERSTANDING
 * 
 * Actual Kent Format (from test file):
 * 
 * CHAPTER (all caps, e.g., "EAR", "MIND")
 * 
 * MAIN_RUBRIC (all caps with period, e.g., "NOISES.")
 * 
 * primary_rubric: Med1., Med2., MED3., *med4*, med5.
 *   (continues on next lines...)
 * 
 * modifier1: Med6., Med7.
 * 
 * sub-modifier: Med8., Med9.
 * 
 * Key insights:
 * - Hierarchy is determined by INDENTATION
 * - All caps medicines (MED3) = Grade 3 (bold)
 * - Lowercase medicines (med5) = Grade 1 (normal)
 * - Medicines with asterisks (*med4*) = Grade 2 (italic) - OCR might lose asterisks
 * - Modifiers append to parent rubric with comma (e.g., "hissing, while sitting")
 * - Medicine list can span multiple lines (collect until next colon or new rubric)
 */

/**
 * Extract medicines and detect grading from typography
 * Grade detection based on Kent's original typography:
 * - ALL CAPS = Grade 3 (bold) - most important
 * - Lowercase = Grade 1 (normal)
 * - *Italic* (asterisk) = Grade 2 - but OCR loses asterisks, so detect by mixed case
 */
const extractMedicinesWithGrading = (medicineText) => {
  const medicines = [];
  
  // Split by commas and periods (Kent uses both)
  const parts = medicineText
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/[,;]/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  for (let part of parts) {
    // Remove trailing period and asterisks
    const cleaned = part.replace(/[.*]+$/g, '').replace(/^\*+/g, '').trim();
    if (!cleaned || cleaned.length < 2) continue;
    
    // Skip non-medicine text (descriptive phrases)
    if (cleaned.includes(' and ') || cleaned.includes(' from ') || 
        cleaned.includes(' as ') || cleaned.includes(' like ') ||
        cleaned.includes(' with ') || cleaned.length > 25) continue;
    
    // Detect grading from capitalization pattern
    const letters = cleaned.replace(/[\-\.]/g, ''); // Remove separators
    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    const lowerCount = (letters.match(/[a-z]/g) || []).length;
    const total = upperCount + lowerCount;
    
    if (total === 0) continue;
    
    let grading = 1;
    const upperRatio = upperCount / total;
    
    // Kent's typography rules:
    // 1. Initial Capital letter (e.g. Bell., Acon., Spig., Chin., Lyc., Dig., Lob., Mag-s.) = Grade 3 (Bold)
    // 2. Standard Italic remedy list = Grade 2
    // 3. Normal lowercase = Grade 1
    const italicRemedies = new Set([
      'acon', 'agar', 'alum', 'bell', 'berb', 'calc', 'caust', 'chin', 'con', 'cupr',
      'dros', 'dulc', 'graph', 'hep', 'kali-c', 'lach', 'laur', 'mag-c', 'mag-m', 'mang',
      'meny', 'merc', 'nat-m', 'nit-ac', 'olnd', 'petr', 'phos-ac', 'plat', 'puls', 'rhodo',
      'sabad', 'sep', 'sil', 'sulph', 'tabac', 'valer', 'verat'
    ]);

    const firstChar = cleaned.charAt(0);
    const isFirstCap = firstChar >= 'A' && firstChar <= 'Z';

    if (isFirstCap || upperRatio >= 0.8) {
      grading = 3;
    } else if (italicRemedies.has(cleaned.toLowerCase())) {
      grading = 2;
    } else {
      grading = 1;
    }
    
    medicines.push({ name: cleaned, grading });
  }
  
  return medicines;
};

/**
 * Parse Kent's Repertory format with hierarchical rubric building
 */
const parseKentOcrText = (ocrText) => {
  console.log('[Kent Parser] Starting hierarchical Kent format parsing...');
  
  const lines = ocrText.split('\n');
  const results = [];
  const seenKeys = new Set();
  
  let currentChapter = '';
  let rubricStack = []; // Stack to track rubric hierarchy [main, sub, sub-sub, ...]
  let medicineBuffer = '';
  let collectingMedicines = false;
  let lastIndentLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and page numbers
    if (!trimmed || /^\d+$/.test(trimmed) || /^Page \d+/i.test(trimmed)) continue;
    
    const indent = line.search(/\S/); // First non-whitespace position
    
    // Detect chapter (ALL CAPS, no colon, short, early in doc or after many blank lines)
    if (/^[A-Z\s]{3,20}$/.test(trimmed) && !trimmed.includes(':') && trimmed.length < 25) {
      // Likely a chapter heading
      if (i < 15 || !currentChapter) { // Early in document or first chapter
        currentChapter = trimmed.replace(/\s+/g, ' ').trim();
        console.log(`[Kent Parser] 📖 Chapter: ${currentChapter}`);
        rubricStack = [];
        continue;
      }
    }
    
    // Detect main rubric (ALL CAPS with period, e.g., "NOISES.")
    if (/^[A-Z\s]+\.$/.test(trimmed) && trimmed.length < 30) {
      const mainRubric = trimmed.replace(/\.$/, '').trim();
      rubricStack = [mainRubric]; // Reset stack with new main rubric
      console.log(`[Kent Parser] 📌 Main Rubric: ${mainRubric}`);
      medicineBuffer = '';
      collectingMedicines = false;
      continue;
    }
    
    // Line with colon = rubric entry with medicines
    if (trimmed.includes(':')) {
      // Save previous medicines if any
      if (collectingMedicines && medicineBuffer) {
        saveMedicines(medicineBuffer, currentChapter, rubricStack, results, seenKeys);
      }
      
      // Parse new rubric entry
      const colonIndex = trimmed.indexOf(':');
      const rubricPart = trimmed.substring(0, colonIndex).trim();
      const medicinesPart = trimmed.substring(colonIndex + 1).trim();
      
      // Determine hierarchy based on indentation
      const indentLevel = Math.floor(indent / 2); // Each 2 spaces = 1 level
      
      // Adjust rubric stack based on indentation
      if (rubricStack.length === 0) {
        // No main rubric set yet - this rubric becomes the only entry
        rubricStack = [rubricPart];
      } else if (indentLevel === 0) {
        // Same level as main rubric - keep main rubric, replace sub-rubric
        // rubricStack has ["NOISES"], we want ["NOISES", "hissing"]
        rubricStack = rubricStack.slice(0, 1); // Keep only main rubric
        rubricStack.push(rubricPart); // Add this rubric
      } else {
        // Indented sub-rubric: maintain hierarchy depth
        // indentLevel tells us how deep we are
        // We want rubricStack.length = indentLevel + 2 (main + parent + this)
        rubricStack = rubricStack.slice(0, indentLevel + 1);
        rubricStack.push(rubricPart);
      }
      
      lastIndentLevel = indentLevel;
      medicineBuffer = medicinesPart;
      collectingMedicines = true;
      
    } else if (collectingMedicines && trimmed) {
      // Continue collecting medicines from wrapped lines
      // Only if indent is similar or greater (part of same entry)
      if (indent >= lastIndentLevel * 2) {
        medicineBuffer += ' ' + trimmed;
      }
    }
  }
  
  // Process last block
  if (collectingMedicines && medicineBuffer) {
    saveMedicines(medicineBuffer, currentChapter, rubricStack, results, seenKeys);
  }
  
  console.log(`[Kent Parser] ✅ Parsed ${results.length} medicine entries`);
  return results;
};

/**
 * Helper: Save medicines to results with proper rubric hierarchy
 */
const saveMedicines = (medicineBuffer, chapter, rubricStack, results, seenKeys) => {
  const medicines = extractMedicinesWithGrading(medicineBuffer);
  
  // Build full rubric path with commas for sub-rubrics
  let fullRubric = chapter;
  if (rubricStack.length > 0) {
    fullRubric += ' - ' + rubricStack.join(', ');
  }
  
  for (const med of medicines) {
    const key = `${fullRubric}|||${med.name}`.toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push({
        chapter_en: chapter,
        chapter_hi: '',
        rubric_en: fullRubric,
        rubric_hi: '',
        medicine: med.name,
        grading: med.grading
      });
    }
  }
};

/**
 * Advanced parser with column detection
 */
const parseKentOcrTextAdvanced = (ocrText) => {
  const simpleResults = parseKentOcrText(ocrText);
  
  if (simpleResults.length > 30) {
    return simpleResults;
  }
  
  // Try column splitting
  console.log('[Kent Parser] Trying column split...');
  const lines = ocrText.split('\n');
  const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  
  if (avgLen > 80) {
    const leftCol = [];
    const rightCol = [];
    
    for (const line of lines) {
      if (line.length > 80) {
        const mid = Math.floor(line.length / 2);
        leftCol.push(line.substring(0, mid));
        rightCol.push(line.substring(mid));
      } else {
        leftCol.push(line);
      }
    }
    
    const leftResults = parseKentOcrText(leftCol.join('\n'));
    const rightResults = parseKentOcrText(rightCol.join('\n'));
    
    const combined = [...leftResults, ...rightResults];
    const seenKeys = new Set();
    const deduped = [];
    
    for (const row of combined) {
      const key = `${row.rubric_en}|||${row.medicine}`.toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduped.push(row);
      }
    }
    
    return deduped;
  }
  
  return simpleResults;
};

module.exports = {
  parseKentOcrText,
  parseKentOcrTextAdvanced,
  extractMedicinesWithGrading
};
