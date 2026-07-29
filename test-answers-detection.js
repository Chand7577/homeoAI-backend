/**
 * Test to verify ANSWERS main rubric detection issue
 */

const { parseKentOcrTextAdvanced } = require('./services/kentTextParser');

// Exact text from Kent page showing the issue - with ANSWERS: on its own line
const testText = `
MIND

ANGUISH:
  Acet-ac., Acon., aeth., aloe.

  daytime: Murex.
  
  walking in open air: Arg-m., bell.

ANSWERS:

  aversion to: Agar., alum., ambr., am-c., am-m., anac.
  
  morning: Mag-m.
  
  incoherently: Bell., cann-i., chlol.
`;

console.log('🧪 Testing ANSWERS main rubric detection\n');
console.log('Expected: ANSWERS should be detected as a NEW main rubric');
console.log('Issue: "aversion to" is being incorrectly assigned to ANGUISH\n');

const results = parseKentOcrTextAdvanced(testText);

console.log(`\n📊 Parsed ${results.length} entries\n`);

// Show all unique rubric paths
const uniqueRubrics = [...new Set(results.map(r => r.rubric_en))];
console.log('📋 Unique rubric paths found:\n');
uniqueRubrics.forEach(rubric => {
  console.log(`   ${rubric}`);
});

// Check if "aversion to" is under ANGUISH or ANSWERS
const aversionEntries = results.filter(r => r.rubric_en.includes('aversion'));
console.log('\n🔍 "aversion to" rubric details:\n');
aversionEntries.forEach(entry => {
  console.log(`   Rubric: ${entry.rubric_en}`);
  console.log(`   Medicine: ${entry.medicine}`);
  console.log('');
});

// Verify ANSWERS is detected as main rubric
const answersEntries = results.filter(r => r.rubric_en.includes('ANSWERS'));
console.log('✅ ANSWERS rubrics found:\n');
answersEntries.slice(0, 5).forEach(entry => {
  console.log(`   ${entry.rubric_en} → ${entry.medicine}`);
});

if (aversionEntries.length > 0 && aversionEntries[0].rubric_en.includes('ANGUISH')) {
  console.log('\n❌ ERROR: "aversion to" is incorrectly under ANGUISH!');
  console.log('   Should be: MIND - ANSWERS, aversion to');
  console.log(`   Found: ${aversionEntries[0].rubric_en}`);
} else if (aversionEntries.length > 0 && aversionEntries[0].rubric_en.includes('ANSWERS')) {
  console.log('\n✅ SUCCESS: "aversion to" is correctly under ANSWERS!');
} else {
  console.log('\n⚠️ "aversion to" not found in results');
}

console.log('\n✅ Test complete!');
