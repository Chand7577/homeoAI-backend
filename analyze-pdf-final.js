const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');

(async () => {
  console.log('\n📚 Analyzing Materia Medica PDF...\n');
  
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer, { max: 30 });

  console.log(`Total Pages: ${data.numpages}\n`);
  console.log('=' + ''.repeat(100) + '\n');

  const lines = data.text.split('\n').map(l => l.trim()).filter(Boolean);
  
  console.log('First 100 Lines:\n');
  lines.slice(0, 100).forEach((line, i) => {
    console.log(`${String(i + 1).padStart(4)}: ${line}`);
  });

  console.log('\n' + '='.repeat(100) + '\n');

  // Find ALL CAPS lines (likely medicine names)
  const medicines = [];
  const sections = [];
  
  lines.forEach((line, i) => {
    if (line.length >= 5 && line.length <= 50 && line === line.toUpperCase()) {
      if (/^(MIND|HEAD|EYES|EARS|NOSE|FACE|MOUTH|THROAT|STOMACH|ABDOMEN|CHEST)/.test(line)) {
        sections.push({ line: i + 1, text: line });
      } else if (/^[A-Z][A-Z\s\-\.']+$/.test(line)) {
        medicines.push({ line: i + 1, text: line });
      }
    }
  });

  console.log(`\n🧪 Medicine Names (${medicines.length}):\n`);
  medicines.slice(0, 50).forEach(m => {
    console.log(`  Line ${String(m.line).padStart(4)}: ${m.text}`);
  });

  console.log(`\n🏥 Sections (${sections.length}):\n`);
  sections.slice(0, 30).forEach(s => {
    console.log(`  Line ${String(s.line).padStart(4)}: ${s.text}`);
  });

  fs.writeFileSync('materia-medica-analysis.json', JSON.stringify({
    totalPages: data.numpages,
    medicines,
    sections,
    sample: lines.slice(0, 200)
  }, null, 2));

  console.log('\n✅ Saved to materia-medica-analysis.json\n');
})();
