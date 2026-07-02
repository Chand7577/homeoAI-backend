/**
 * Test script to verify Hindi rubric column parsing
 */

const XLSX = require('xlsx');

// Simulate the updated parser logic
const KNOWN_META_COLS = new Set([
  'chapter_en','chapter_hi','rubric_en','rubric_hi',
  'subrubric_en','subrubric_hi','subrubric',
  'aggravation','amelioration','synonyms_en','synonyms_hi',
  'chapter','rubric','section','sub rubric','sub-rubric',
  'chapter (english)','chapter (hindi)','rubric (english)','rubric (hindi)',
  'synonyms (en + hi)', 'aggravation (en + hi)', 'amelioration (en + hi)',
  'sub-rubric (en + hi)', 'rubric (english – verb + action)', 'rubric (hindi – क्रिया आधारित)'
]);

const resolveFields = (row, headers) => {
  const get = (...keys) => {
    for (const k of keys) {
      const found = headers.find(h => {
        const lowerH = String(h).toLowerCase().trim();
        const lowerK = String(k).toLowerCase().trim();
        return lowerH === lowerK || lowerH.includes(lowerK);
      });
      if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
    }
    return '';
  };

  const rubricEnRaw  = get('rubric (english – verb + action)', 'rubric (english)', 'rubric_en', 'rubric');
  const rubricHiRaw  = get('rubric (hindi – क्रिया आधारित)', 'rubric (hindi)', 'rubric_hi');

  console.log('\n=== Field Resolution Test ===');
  console.log('Headers found:', headers);
  console.log('Looking for English rubric with keys: rubric (english – verb + action), rubric (english), rubric_en, rubric');
  console.log('  → Found:', rubricEnRaw);
  console.log('Looking for Hindi rubric with keys: rubric (hindi – क्रिया आधारित), rubric (hindi), rubric_hi');
  console.log('  → Found:', rubricHiRaw);

  return { rubricEn: rubricEnRaw, rubricHi: rubricHiRaw };
};

// Test with sample data matching user's Excel format
console.log('\n📝 Testing Hindi Rubric Column Parsing\n');

const testRow = {
  'Chapter': 'Mind',
  'Rubric (English – Verb + Action)': 'Fear – becomes fearful when alone',
  'Rubric (Hindi – क्रिया आधारित)': 'भय – अकेले होने पर डर जाता है',
  'Sub-Rubric (EN + HI)': 'When alone / अकेले में',
  'Synonyms (EN + HI)': 'Dread – भीति; Terror – आतंक',
  'Aggravation (EN + HI)': 'Darkness – अँधेरा; Solitude – एकांत',
  'Amelioration (EN + HI)': 'Light – रोशनी; Company – संगति',
  'Medicines (Full Name – 3)': 'Stramonium; Calcarea carbonica; Pulsatilla nigricans'
};

const headers = Object.keys(testRow);
const result = resolveFields(testRow, headers);

console.log('\n✅ Parsing Result:');
console.log('English Rubric:', result.rubricEn);
console.log('Hindi Rubric:', result.rubricHi);

if (result.rubricEn && result.rubricHi) {
  console.log('\n✅ SUCCESS: Both English and Hindi rubrics parsed correctly!');
  console.log('\n📌 NOTE: You need to RE-UPLOAD your Excel file for the database to contain the Hindi rubric data.');
} else {
  console.log('\n❌ FAILED: Hindi rubric not detected');
}
