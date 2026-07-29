/**
 * Extract medicine names from Boericke PDF using OCR
 * Automatically scans pages 11-600 and identifies medicine headings
 */

const axios = require('axios');
const tesseract = require('tesseract.js');
const fs = require('fs').promises;

const ARCHIVE_ID = 'in.ernet.dli.2015.125811';
const START_PAGE = 11; // First medicine page (Abies Canadensis)
const END_PAGE = 600; // Approximate end of medicines
const OFFSET = 10; // scan number - 10 = book page number

// Internet Archive image URL pattern
const getImageUrl = (scanNum) => 
  `https://archive.org/download/${ARCHIVE_ID}/page/n${scanNum}_w600.jpg`;

/**
 * Check if a text line is likely a medicine heading
 * Medicine headings are:
 * - ALL CAPS
 * - Usually at top of page
 * - Typically 3-30 characters
 * - May include latin name in parentheses
 */
function isMedicineHeading(text, isTopOfPage = false) {
  const cleaned = text.trim();
  
  // Must be uppercase
  if (cleaned !== cleaned.toUpperCase()) return false;
  
  // Reasonable length for medicine name
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  
  // Should not be common page headers/footers
  const excludeWords = [
    'MATERIA MEDICA', 'HOMOEOPATHIC', 'REPERTORY', 'INDEX', 'CONTENTS',
    'CHAPTER', 'PAGE', 'SECTION', 'PART', 'PREFACE', 'INTRODUCTION'
  ];
  if (excludeWords.some(word => cleaned.includes(word))) return false;
  
  // Should contain letters (not just numbers/symbols)
  if (!/[A-Z]{3,}/.test(cleaned)) return false;
  
  // Likely medicine patterns
  const medicinePatterns = [
    /^[A-Z][A-Z\s\-\.]+$/,  // All caps with spaces, hyphens, dots
    /^[A-Z]+\s+[A-Z]+/,      // Two or more words in caps
    /\([A-Z][a-z]+/,         // Contains latin name in parens
  ];
  
  return medicinePatterns.some(pattern => pattern.test(cleaned));
}

/**
 * Extract medicine name from OCR text of a single page
 */
async function extractMedicineFromPage(scanNum) {
  try {
    const imageUrl = getImageUrl(scanNum);
    console.log(`📄 Scanning page n${scanNum}...`);
    
    // OCR the image
    const { data: { text } } = await tesseract.recognize(imageUrl, 'eng', {
      logger: () => {} // Suppress verbose logs
    });
    
    // Split into lines and analyze
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    if (lines.length === 0) return null;
    
    // Check first 5 lines for medicine heading (they're usually at top)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (isMedicineHeading(line, i < 2)) {
        // Try to extract latin name if present
        let medicineName = line;
        let latinName = '';
        
        // Pattern: "MEDICINE NAME (Latin name)" or "MEDICINE NAME—Latin name"
        const parenMatch = line.match(/^([A-Z\s\-\.]+)\s*[\(]([A-Za-z\s]+)[\)]/);
        if (parenMatch) {
          medicineName = parenMatch[1].trim();
          latinName = parenMatch[2].trim();
        }
        
        const pageNum = scanNum - OFFSET;
        console.log(`✅ Found: ${medicineName} (scan n${scanNum}, page ${pageNum})`);
        
        return {
          name: medicineName,
          latin: latinName || medicineName.toLowerCase(),
          page: pageNum,
          scan: scanNum
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error on page n${scanNum}:`, error.message);
    return null;
  }
}

/**
 * Main function: Extract all medicines
 */
async function extractAllMedicines() {
  console.log('🚀 Starting Boericke medicine extraction...');
  console.log(`📖 Scanning pages ${START_PAGE} to ${END_PAGE}`);
  console.log('');
  
  const medicines = [];
  let consecutiveEmpty = 0;
  
  for (let scan = START_PAGE; scan <= END_PAGE; scan++) {
    const medicine = await extractMedicineFromPage(scan);
    
    if (medicine) {
      medicines.push(medicine);
      consecutiveEmpty = 0;
      
      // Small delay to avoid overwhelming Archive.org
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      consecutiveEmpty++;
      
      // If we hit 20 consecutive pages with no medicines, assume we're past the medicine section
      if (consecutiveEmpty >= 20) {
        console.log('');
        console.log('🏁 Reached end of medicine section (20 consecutive empty pages)');
        break;
      }
    }
    
    // Progress update every 10 pages
    if (scan % 10 === 0) {
      console.log(`📊 Progress: ${scan - START_PAGE}/${END_PAGE - START_PAGE} pages scanned, ${medicines.length} medicines found`);
    }
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`✅ Extraction complete!`);
  console.log(`📚 Total medicines found: ${medicines.length}`);
  console.log('='.repeat(70));
  
  // Save to file
  const jsCode = `// Boericke Materia Medica - Auto-extracted via OCR
// Source: Internet Archive ${ARCHIVE_ID}
// Extracted: ${new Date().toISOString()}
// Total: ${medicines.length} medicines
// Offset: +${OFFSET} (page + ${OFFSET} = scan number)

const BOERICKE_MEDICINES = ${JSON.stringify(medicines, null, 2)};

module.exports = BOERICKE_MEDICINES;
`;
  
  await fs.writeFile('boericke-medicines-extracted.js', jsCode);
  console.log('💾 Saved to: boericke-medicines-extracted.js');
  
  // Also save as JSON
  const jsonData = {
    source: 'Internet Archive',
    archiveId: ARCHIVE_ID,
    extractedDate: new Date().toISOString(),
    offset: OFFSET,
    totalMedicines: medicines.length,
    medicines: medicines
  };
  
  await fs.writeFile('boericke-medicines-extracted.json', JSON.stringify(jsonData, null, 2));
  console.log('💾 Saved to: boericke-medicines-extracted.json');
  
  console.log('');
  console.log('🎉 Done! You can now:');
  console.log('1. Review boericke-medicines-extracted.js');
  console.log('2. Copy the BOERICKE_MEDICINES array into ReferenceLibrary.jsx');
  
  return medicines;
}

// Run the extraction
extractAllMedicines().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
