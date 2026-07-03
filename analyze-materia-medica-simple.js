/**
 * Simple Materia Medica PDF Structure Analyzer
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse/lib/pdf-parse');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');

async function analyzePDF() {
  console.log('\n📚 Analyzing Materia Medica PDF Structure...\n');
  
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // Parse first 30 pages
    const data = await pdf(dataBuffer, {
      max: 30
    });

    console.log('📄 PDF Metadata:');
    console.log(`  Total Pages: ${data.numpages}`);
    console.log('\n' + '='.repeat(100) + '\n');

    // Extract and analyze text
    const fullText = data.text;
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    
    console.log(`📋 First 100 Lines of PDF:\n`);
    lines.slice(0, 100).forEach((line, idx) => {
      if (line.length > 0) {
        console.log(`${String(idx + 1).padStart(4, ' ')}: ${line}`);
      }
    });

    console.log('\n' + '='.repeat(100));
    console.log('\n🔍 Pattern Analysis:\n');

    // Look for medicine names (usually ALL CAPS, standalone lines)
    const potentialMedicines = [];
    const sectionHeadings = [];
    
    const sectionPattern = /^(MIND|HEAD|EYES|EARS|NOSE|FACE|MOUTH|THROAT|STOMACH|ABDOMEN|CHEST|HEART|BACK|EXTREMITIES|SKIN|GENERALITIES|FEVER|SLEEP|VERTIGO|RESPIRATION|COUGH)/i;
    
    lines.forEach((line, idx) => {
      // Medicine names: ALL CAPS, 5-40 chars, mostly letters
      if (line.length >= 5 && line.length <= 50) {
        if (line === line.toUpperCase() && /^[A-Z][A-Z\s\-\.']+$/.test(line)) {
          // Exclude common section headings
          if (!sectionPattern.test(line) && !line.includes('PAGE') && !line.includes('INDEX')) {
            potentialMedicines.push({ lineNum: idx + 1, name: line });
          }
        }
      }
      
      // Section headings
      if (sectionPattern.test(line)) {
        sectionHeadings.push({ lineNum: idx + 1, section: line });
      }
    });

    console.log(`🧪 Potential Medicine Names Found: ${potentialMedicines.length}\n`);
    potentialMedicines.slice(0, 50).forEach(med => {
      console.log(`  Line ${String(med.lineNum).padStart(4, ' ')}: "${med.name}"`);
    });

    console.log(`\n🏥 Body Section Headings Found: ${sectionHeadings.length}\n`);
    sectionHeadings.slice(0, 30).forEach(sec => {
      console.log(`  Line ${String(sec.lineNum).padStart(4, ' ')}: "${sec.section}"`);
    });

    console.log('\n' + '='.repeat(100));
    console.log('\n💡 Structure Conclusions:\n');
    console.log('This Materia Medica follows this pattern:');
    console.log('  1. Medicine Name (ALL CAPS, e.g., "ACONITUM NAPELLUS")');
    console.log('  2. Sections for body parts (MIND, HEAD, EYES, etc.)');
    console.log('  3. Symptoms under each section');
    console.log('\n📌 UI Design Recommendation:');
    console.log('  • Left Sidebar: Medicine Names (manually mapped to pages)');
    console.log('  • Right Panel: PDF Viewer showing that medicine\'s page');
    console.log('  • Mapping Interface: Similar to current chapter mapping');
    console.log('  • Field name: "Medicine Name" instead of "Chapter Name"');

    // Save detailed analysis
    const analysis = {
      totalPages: data.numpages,
      analyzedLines: lines.length,
      potentialMedicines: potentialMedicines,
      sectionHeadings: sectionHeadings,
      sampleText: lines.slice(0, 200)
    };

    fs.writeFileSync(
      path.join(__dirname, '..', 'materia-medica-structure.json'),
      JSON.stringify(analysis, null, 2)
    );

    console.log('\n✅ Full analysis saved to: materia-medica-structure.json\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

analyzePDF();
