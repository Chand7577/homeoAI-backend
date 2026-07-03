/**
 * Analyze Materia Medica PDF Structure
 * 
 * This script extracts text from the PDF and identifies:
 * - Medicine names
 * - Page numbers where each medicine starts
 * - Structure of content (sections like Mind, Head, Abdomen, etc.)
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.join(__dirname, 'uploads', '1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');

async function analyzePDF() {
  console.log('\n📚 Analyzing Materia Medica PDF Structure...\n');
  
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // Parse PDF with page-by-page text extraction
    const pdfParser = new PDFParse();
    const data = await pdfParser.parse(dataBuffer, {
      max: 20, // Analyze first 20 pages to understand structure
    });

    console.log('📄 PDF Metadata:');
    console.log(`  Total Pages: ${data.numpages}`);
    console.log(`  PDF Info:`, data.info);
    console.log('\n' + '='.repeat(80) + '\n');

    // Extract text page by page to identify medicine names
    let currentPage = 1;
    const medicinePattern = /^[A-Z][A-Za-z\s\-]+$/; // Medicine names typically start with capital letter
    const sectionPattern = /^(MIND|HEAD|EYES|EARS|NOSE|FACE|MOUTH|THROAT|STOMACH|ABDOMEN|CHEST|HEART|BACK|EXTREMITIES|SKIN|GENERALITIES|FEVER|SLEEP)[\s:]/i;
    
    const pagesData = [];
    
    // Re-parse with render_page callback to get page-by-page content
    const detailedData = await pdfParser.parse(dataBuffer, {
      max: 20,
      pagerender: function(pageData) {
        return pageData.getTextContent().then(function(textContent) {
          let pageText = '';
          textContent.items.forEach(function(item) {
            pageText += item.str + ' ';
          });
          return pageText;
        });
      }
    });

    // Split full text into pages (approximation)
    const fullText = data.text;
    const lines = fullText.split('\n');
    
    console.log('📋 First 50 Lines of PDF:\n');
    lines.slice(0, 50).forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed) {
        console.log(`Line ${idx + 1}: ${trimmed}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 Pattern Analysis:\n');

    // Look for medicine names (usually bold, capitalized, start of section)
    const potentialMedicines = [];
    const sections = [];
    
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      // Check if line looks like a medicine name (ALL CAPS or Title Case, short)
      if (trimmed.length > 2 && trimmed.length < 50) {
        if (trimmed === trimmed.toUpperCase() && /^[A-Z][A-Z\s\-\.]+$/.test(trimmed)) {
          potentialMedicines.push({ line: idx + 1, text: trimmed });
        }
      }
      
      // Check if line is a body section heading
      if (sectionPattern.test(trimmed)) {
        sections.push({ line: idx + 1, text: trimmed });
      }
    });

    console.log(`🧪 Potential Medicine Names Found: ${potentialMedicines.length}`);
    potentialMedicines.slice(0, 30).forEach(med => {
      console.log(`  Line ${med.line}: "${med.text}"`);
    });

    console.log(`\n🏥 Body Section Headings Found: ${sections.length}`);
    sections.slice(0, 20).forEach(sec => {
      console.log(`  Line ${sec.line}: "${sec.text}"`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Structure Analysis:\n');

    // Try to identify the structure
    console.log('Based on the patterns, this Materia Medica appears to be organized as:');
    console.log('  1. Medicine Name (ALL CAPS or bold)');
    console.log('  2. Followed by sections: MIND, HEAD, EYES, NOSE, etc.');
    console.log('  3. Each section contains symptoms related to that body part');
    console.log('\nRecommended approach:');
    console.log('  - Left Sidebar: List of Medicine Names');
    console.log('  - Main View: PDF viewer showing that medicine\'s page');
    console.log('  - Medicine names should be manually mapped to page numbers');
    console.log('  - Similar to current chapter mapping, but with medicine names');

    // Save analysis to file
    const analysis = {
      metadata: {
        totalPages: data.numpages,
        pdfInfo: data.info,
        analyzedPages: 20
      },
      potentialMedicines: potentialMedicines.slice(0, 100),
      sections: sections.slice(0, 50),
      sampleLines: lines.slice(0, 100),
      recommendations: {
        structure: 'Medicine-based organization',
        sidebarContent: 'Medicine Names (manually mapped to pages)',
        mappingRequired: true,
        mappingType: 'medicineName -> pageNumber',
        example: {
          'Aconitum Napellus': 15,
          'Arnica Montana': 45,
          'Belladonna': 78
        }
      }
    };

    fs.writeFileSync(
      path.join(__dirname, '..', 'materia-medica-structure-analysis.json'),
      JSON.stringify(analysis, null, 2)
    );

    console.log('\n✅ Analysis saved to: materia-medica-structure-analysis.json');
    console.log('\n📌 Next Steps:');
    console.log('  1. Update Reference Library UI to show "Medicine Names" instead of "Chapters"');
    console.log('  2. Update mapping interface to accept medicine name + page number');
    console.log('  3. Store mappings in chapterPages field (reuse existing field)');
    console.log('  4. Update sidebar label based on type: "Chapters" for Repertory, "Medicines" for Reference');

  } catch (error) {
    console.error('❌ Error analyzing PDF:', error.message);
  }
}

analyzePDF();
