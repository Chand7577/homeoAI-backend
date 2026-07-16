'use strict';

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function test() {
  const filePath = path.join(__dirname, 'uploads/1781930114672-946977723-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');
  console.log(`Checking file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error('File does not exist!');
    return;
  }

  try {
    console.log('Reading file...');
    const buffer = fs.readFileSync(filePath);
    console.log('Parsing PDF...');
    const data = await pdfParse(buffer, { max: 1 }); // only parse first page to be quick
    console.log('Success! Extracted text length:', data.text.length);
    console.log('Text preview:', data.text.substring(0, 200));
  } catch (err) {
    console.error('Failed to parse:', err);
  }
}

test();
