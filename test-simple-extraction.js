/**
 * Simple test: Extract medicine names from PDF text without Gemini File API
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');

async function simpleExtraction() {
  console.log('📚 Simple Medicine Extraction Test\n');
  
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log('📄 Parsing PDF...');
  
  const pdfData = await pdfParse(pdfBuffer, { max: 0 });
  
  console.log(`✅ Parsed ${pdfData.numpages} pages`);
  console.log(`✅ Extracted ${pdfData.text.length} characters\n`);
  
  // Split into lines
  const lines = pdfData.text.split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`✅ Found ${lines.length} non-empty lines\n`);
  
  // Identify medicine names (ALL CAPS lines between 5-50 characters)
  const medicinePattern = /^[A-Z][A-Z\s\-\.']{4,49}$/;
  const repertorySections = new Set([
    'MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 'THROAT',
    'STOMACH', 'ABDOMEN', 'RECTUM', 'CHEST', 'BACK', 'EXTREMITIES', 
    'SKIN', 'SLEEP', 'FEVER', 'GENERALITIES', 'MODALITIES',
    'MATERIA MEDICA', 'REPERTORY', 'INDEX', 'CONTENTS', 'PREFACE'
  ]);
  
  const potentialMedicines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (medicinePattern.test(line) && !repertorySections.has(line)) {
      // Check next few lines for medical context
      const nextLines = lines.slice(i + 1, i + 5).join(' ').toLowerCase();
      const hasMedContext = 
        nextLines.includes('mind') || 
        nextLines.includes('head') || 
        nextLines.includes('dose') ||
        nextLines.includes('syno') ||
        nextLines.includes('common') ||
        nextLines.includes('tincture') ||
        nextLines.includes('potency');
      
      if (hasMedContext || line.length > 15) {
        potentialMedicines.push({
          name: line,
          lineIndex: i,
          approxPosition: (i / lines.length) * pdfData.numpages
        });
      }
    }
  }
  
  console.log(`🧪 Found ${potentialMedicines.length} potential medicine names:\n`);
  
  potentialMedicines.slice(0, 30).forEach((med, idx) => {
    console.log(`${String(idx + 1).padStart(3)}. ${med.name.padEnd(40)} (approx page ${Math.floor(med.approxPosition)})`);
  });
  
  console.log('\n📊 Distribution:');
  console.log(`  - First medicine at line ${potentialMedicines[0]?.lineIndex}`);
  console.log(`  - Last medicine at line ${potentialMedicines[potentialMedicines.length - 1]?.lineIndex}`);
  
  // Save to file
  const output = {
    totalPages: pdfData.numpages,
    totalLines: lines.length,
    medicinesFound: potentialMedicines.length,
    medicines: potentialMedicines
  };
  
  fs.writeFileSync(
    path.join(__dirname, 'medicine-candidates.json'),
    JSON.stringify(output, null, 2)
  );
  
  console.log('\n✅ Saved to medicine-candidates.json');
  
  return potentialMedicines;
}

simpleExtraction().catch(console.error);
