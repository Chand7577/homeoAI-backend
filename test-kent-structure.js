/**
 * Test Kent Repertory OCR with the structure from the user's image:
 * - MAIN RUBRICS in CAPITALS (VERTIGO, ROCKING, SLEEP, SMOKING, SNEEZING, etc.)
 * - Sub-rubrics with lowercase
 * - Medicines after colon with grading (Capital = Bold = Grade 3)
 */

const { parseKentOcrTextAdvanced } = require('./services/kentTextParser');

// Sample text matching the EXACT image structure shown by user
// Left column has: ROCKING, RUBBING, SALIVATION, SEWING, SHAKING, SHAVING, SHUTTERING, SINKING, SITTING
// Right column has: SLEEP, SLEEPINESS, SMOKING, SNEEZING, SOUNDS, SPARKS, SPEECH, SPRING, STAGGERING, STANDING, STARS, STARTING
const testText = `
VERTIGO

ROCKING, as if: Bell., calad.

from: Bor., coff.

amel.: Secale.

RUBBING the eyes amel.: Alum.

SLEEP, on going to: Arg-m., nat-m., Nux-v., op., scr., spong., stann., stict., stram., tarent., thuj., ther., zinc.

during: Æth., croc-h., scng., sil., thea.

amel.: Bell., ferr., grat., pall.

SLEEPINESS, with: Æth., arg-m., crot-t., laur., nit-ac., nux-m., puls., sarr., sil., stram.

SMOKING, from: Asc-t., bor., brom., clem., gels., ign., op., oena., op., tabac., zinc.

SNEEZING, during: Bar-c., nux-v., seng.

STAGGERING with: Acon., ail., agar., am-c., Phos., phyt.

STANDING, while: Acon., æth., aloe, am-c., apis, glon.

STARS, white, before eyes: Alum.

STARTING, with: Atc, arg-m.
`;

console.log('🧪 Testing Kent Repertory OCR Parser with user\'s image structure\n');
console.log('Expected behavior:');
console.log('1. CAPITAL RUBRICS = Main rubrics (VERTIGO, ROCKING, SLEEP, etc.)');
console.log('2. Lowercase/mixed = Sub-rubrics');
console.log('3. Everything after colon = Medicines only');
console.log('4. Capital medicine names (Bell., Acon., Phos.) = Grade 3 (Bold)');
console.log('5. Lowercase medicine names = Grade 1 or 2 based on known italic list\n');

const results = parseKentOcrTextAdvanced(testText);

console.log(`\n📊 Parsed ${results.length} entries\n`);

// Show sample entries to verify structure
const samples = [
  results.find(r => r.rubric_en.includes('ROCKING') && r.rubric_en.includes('from')),
  results.find(r => r.rubric_en.includes('SLEEP') && r.rubric_en.includes('going')),
  results.find(r => r.rubric_en.includes('SITTING') && r.rubric_en.includes('while') && r.medicine === 'Bell'),
  results.find(r => r.rubric_en.includes('SNEEZING')),
  results.find(r => r.rubric_en.includes('STAGGERING') && r.medicine === 'Phos'),
];

console.log('📋 Sample parsed entries:\n');
samples.filter(Boolean).forEach((entry, i) => {
  console.log(`${i + 1}. Chapter: ${entry.chapter_en}`);
  console.log(`   Rubric: ${entry.rubric_en}`);
  console.log(`   Medicine: ${entry.medicine} (Grade ${entry.grading})`);
  console.log('');
});

// Verify grading logic
console.log('🎯 Verifying grading logic:\n');
const bellEntries = results.filter(r => r.medicine === 'Bell' || r.medicine === 'Bell.');
const aconsEntries = results.filter(r => r.medicine === 'Acon' || r.medicine === 'Acon.');
const silEntries = results.filter(r => r.medicine === 'sil' || r.medicine === 'sil.');

if (bellEntries.length > 0) {
  console.log(`✓ Bell. (Capital) → Grade ${bellEntries[0].grading} (Expected: 3 for Bold)`);
}
if (aconsEntries.length > 0) {
  console.log(`✓ Acon. (Capital) → Grade ${aconsEntries[0].grading} (Expected: 3 for Bold)`);
}
if (silEntries.length > 0) {
  console.log(`✓ sil (lowercase) → Grade ${silEntries[0].grading} (Expected: 2 for Italic or 1 for Normal)`);
}

// Check that medicines are NOT in rubric names
console.log('\n🔍 Verifying medicines NOT included in rubric names:\n');
const rubricWithMedicines = results.find(r => 
  r.rubric_en.includes('Bell') || 
  r.rubric_en.includes('Acon') || 
  r.rubric_en.includes('calad')
);

if (rubricWithMedicines) {
  console.log('❌ ERROR: Found medicine name in rubric:', rubricWithMedicines.rubric_en);
} else {
  console.log('✓ Rubrics correctly exclude medicine names (everything after colon)');
}

console.log('\n✅ Test complete!');
