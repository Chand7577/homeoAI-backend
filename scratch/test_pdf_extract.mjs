import { PDFExtract } from 'pdf.js-extract';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfExtract = new PDFExtract();
const options = {};

const chapters = [
  "MIND", "HEAD", "EYES", "EARS", "NOSE", "FACE", "MOUTH", "THROAT", "STOMACH",
  "ABDOMEN", "RECTUM", "URINARY ORGANS", "MALE SEXUAL ORGANS", "FEMALE SEXUAL ORGANS",
  "RESPIRATORY ORGANS", "CIRCULATORY ORGANS", "BACK", "EXTREMITIES", "SLEEP", "FEVER",
  "SKIN", "GENERALITIES", "MODALITIES"
];

async function extractHeadings() {
  const filePath = path.join(__dirname, '../uploads/1781927909914-398019508-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');
  console.log("Parsing PDF with pdf.js-extract...");

  pdfExtract.extract(filePath, options, (err, data) => {
    if (err) return console.error(err);

    console.log(`Extracted ${data.pages.length} pages.`);
    
    // Inspect page 700
    const page20 = data.pages[20];
    console.log("Page 20 content length:", page20.content ? page20.content.length : 'undefined');
    if (page20.content && page20.content.length > 0) {
       console.log("Sample:", page20.content[0].str);
    }

  });
}

extractHeadings();
