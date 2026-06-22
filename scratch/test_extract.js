require('dotenv').config({ path: '../.env' });
const path = require('path');
const { initAI } = require('../config/aiConfig');
const { extractChaptersFromPdf } = require('../services/aiService');

async function test() {
  initAI();
  const filePath = path.join(__dirname, '../uploads/1781927909914-398019508-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');
  const fileName = '1781927909914-398019508-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf';

  try {
    console.log("Starting extraction...");
    const mappings = await extractChaptersFromPdf(filePath, fileName);
    console.log("Extraction successful!");
    console.log(JSON.stringify(mappings, null, 2));
  } catch (err) {
    console.error("Extraction failed:", err);
  }
}

test();
