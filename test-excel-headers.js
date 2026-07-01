/**
 * Test script to check if Excel files have proper headers
 * This helps diagnose headerless Excel files
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Check if a sample Excel file exists to test
const testFile = process.argv[2];

if (!testFile) {
  console.log('Usage: node test-excel-headers.js <path-to-excel-file>');
  console.log('Example: node test-excel-headers.js ./uploads/Therapeu.xlsx');
  process.exit(1);
}

if (!fs.existsSync(testFile)) {
  console.log(`❌ File not found: ${testFile}`);
  process.exit(1);
}

console.log(`📂 Reading: ${testFile}\n`);

const buffer = fs.readFileSync(testFile);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log(`📊 Sheets found: ${workbook.SheetNames.length}`);
console.log(`   ${workbook.SheetNames.join(', ')}\n`);

// Check first sheet
const firstSheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[firstSheetName];

console.log(`🔍 Analyzing first sheet: "${firstSheetName}"\n`);
console.log('═'.repeat(80));

// Get range
const range = XLSX.utils.decode_range(sheet['!ref']);
console.log(`📏 Range: ${sheet['!ref']} (${range.e.r + 1} rows × ${range.e.c + 1} columns)\n`);

// Read first 3 rows
console.log('First 3 rows (raw cell values):\n');

for (let row = range.s.r; row <= Math.min(range.s.r + 2, range.e.r); row++) {
  console.log(`Row ${row + 1}:`);
  const rowData = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[cellAddress];
    const value = cell ? String(cell.v).substring(0, 40) : '(empty)';
    rowData.push(`  Col ${String.fromCharCode(65 + col)}: ${value}`);
  }
  console.log(rowData.join('\n'));
  console.log('');
}

// Detect if first row looks like headers
const firstRowData = [];
for (let col = range.s.c; col <= range.e.c; col++) {
  const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
  const cell = sheet[cellAddress];
  firstRowData.push(cell ? String(cell.v).trim() : '');
}

console.log('═'.repeat(80));
console.log('\n🔍 HEADER DETECTION:\n');

const hasHeaders = firstRowData.some(val => {
  const lower = val.toLowerCase();
  return lower.includes('chapter') || 
         lower.includes('rubric') || 
         lower.includes('medicine') ||
         lower.includes('remedy') ||
         lower.includes('sub') ||
         lower.includes('aggrav') ||
         lower.includes('amelior') ||
         lower.includes('synonym');
});

if (hasHeaders) {
  console.log('✅ First row appears to contain HEADERS');
  console.log('\nDetected headers:');
  firstRowData.forEach((h, idx) => {
    console.log(`  ${String.fromCharCode(65 + idx)}: ${h}`);
  });
} else {
  console.log('❌ First row appears to contain DATA (no headers detected)');
  console.log('\nFirst row values:');
  firstRowData.forEach((h, idx) => {
    console.log(`  ${String.fromCharCode(65 + idx)}: ${h}`);
  });
  console.log('\n💡 Suggested fix: Add header row at the top of the Excel file');
  console.log('   Example headers: Chapter | Rubric | Sub-Rubric | Aggravation | Amelioration | Medicines');
}

console.log('\n═'.repeat(80));

// Parse with sheet_to_json to see what happens
console.log('\n📋 Parsed with sheet_to_json (default):\n');
const defaultParsed = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
console.log(`Total rows: ${defaultParsed.length}`);
console.log('\nFirst row keys (will be used as field names):');
const keys = Object.keys(defaultParsed[0] || {});
keys.forEach((k, idx) => {
  console.log(`  ${idx + 1}. "${k}"`);
});

console.log('\nFirst data row:');
console.log(JSON.stringify(defaultParsed[0], null, 2).substring(0, 500));

console.log('\n═'.repeat(80));
console.log('✅ Analysis complete');
