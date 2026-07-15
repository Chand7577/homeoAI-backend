'use strict';

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Generates an Excel file from the structured JSON data.
 *
 * @param {Array} data Array of objects containing chapter, rubric, medicine, etc.
 * @param {string} outputDir Directory to save the file
 * @returns {Promise<string>} Absolute path to the generated .xlsx file
 */
const generateKentExcel = async (data, outputDir) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HomeoAI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Extracted Repertory');

  // Define columns
  sheet.columns = [
    { header: 'Chapter (English)', key: 'chapter_en', width: 25 },
    { header: 'Chapter (Hindi)', key: 'chapter_hi', width: 25 },
    { header: 'Rubric (English)', key: 'rubric_en', width: 40 },
    { header: 'Rubric (Hindi)', key: 'rubric_hi', width: 40 },
    { header: 'Medicine', key: 'medicine', width: 20 },
    { header: 'Grading', key: 'grading', width: 10 }
  ];

  // Style the header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Add rows
  data.forEach((row) => {
    sheet.addRow({
      chapter_en: row.chapter_en || '',
      chapter_hi: row.chapter_hi || '',
      rubric_en: row.rubric_en || '',
      rubric_hi: row.rubric_hi || '',
      medicine: row.medicine || '',
      grading: row.grading || 1
    });
  });

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = \`kent_extracted_\${Date.now()}.xlsx\`;
  const filePath = path.join(outputDir, fileName);

  await workbook.xlsx.writeFile(filePath);

  return filePath;
};

module.exports = { generateKentExcel };
