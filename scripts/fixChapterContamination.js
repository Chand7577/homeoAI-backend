'use strict';

/**
 * Migration: Fix ALL-CAPS rubric-as-chapter contamination and case normalization.
 *
 * Problems fixed:
 *  1. Kent main rubrics stored as chapter names (VOMITING, THIRST, TWITCHING, etc.)
 *     → Move the ALL-CAPS value into the rubric path, assign correct parent chapter.
 *  2. Inconsistent chapter casing: SKIN/STOMACH/ABDOMEN (ALL-CAPS)
 *     → Normalize to title-case: Skin / Stomach / Abdomen.
 *  3. "CHAPTER" as chapter name (23 records) → classify by rubric content.
 *
 * Run:
 *   node scripts/fixChapterContamination.js              # dry-run (safe)
 *   DRY_RUN=false node scripts/fixChapterContamination.js # apply changes
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in .env');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN !== 'false';
if (DRY_RUN) {
  console.log('ℹ️  DRY RUN MODE — no changes will be written.');
  console.log('   Run with DRY_RUN=false to apply fixes.\n');
}

// ─── Kent main rubrics that were incorrectly stored as chapter names ──────────
// Maps contaminated chapter.en value → correct parent chapter + optional rubric prefix
const RUBRIC_AS_CHAPTER_FIXES = [
  // STOMACH chapter rubrics
  { chapter: 'VOMITING',   correctChapter: 'Stomach',      chapterHi: 'पेट' },
  { chapter: 'THIRST',     correctChapter: 'Stomach',      chapterHi: 'पेट' },
  { chapter: 'THIRSTLESS', correctChapter: 'Stomach',      chapterHi: 'पेट' },
  { chapter: 'WATER',      correctChapter: 'Stomach',      chapterHi: 'पेट' },
  { chapter: 'WINE',       correctChapter: 'Stomach',      chapterHi: 'पेट' },
  // ABDOMEN chapter rubrics
  { chapter: 'TWISTING',   correctChapter: 'Abdomen',      chapterHi: 'उदर' },
  { chapter: 'TURNING',    correctChapter: 'Abdomen',      chapterHi: 'उदर' },
  // GENERALITIES chapter rubrics
  { chapter: 'TREMBLING',  correctChapter: 'Generalities', chapterHi: 'सामान्यें' },
  { chapter: 'TINGLING',   correctChapter: 'Generalities', chapterHi: 'सामान्यें' },
  { chapter: 'TWITCHING',  correctChapter: 'Generalities', chapterHi: 'सामान्यें' },
  { chapter: 'TICKLING',   correctChapter: 'Generalities', chapterHi: 'सामान्यें' },
  { chapter: 'UNEASINESS', correctChapter: 'Generalities', chapterHi: 'सामान्यें' },
  // SKIN chapter rubrics
  { chapter: 'ULCERS',     correctChapter: 'Skin',         chapterHi: 'त्वचा' },
];

// ─── ALL-CAPS → title-case chapter normalization ──────────────────────────────
const CASE_NORMALIZATIONS = [
  { from: 'SKIN',          to: 'Skin',       hi: 'त्वचा' },
  { from: 'STOMACH',       to: 'Stomach',    hi: 'पेट' },
  { from: 'ABDOMEN',       to: 'Abdomen',    hi: 'उदर' },
  { from: 'EXTREMITIES',   to: 'Extremities', hi: 'अंग' },
  { from: 'RECTUM',        to: 'Rectum',     hi: 'मलाशय' },
];

// ─── helper: build new rubric path ────────────────────────────────────────────
const buildNewRubricEn = (oldChapterEn, oldRubricEn) => {
  // Capitalize old chapter (e.g. "VOMITING" → "VOMITING")
  // then prepend to existing rubric (e.g. "VOMITING - intervals, long" → "intervals, long")
  const rubricBase = oldRubricEn && oldRubricEn !== '—' ? oldRubricEn.trim() : '';
  if (rubricBase) {
    return `${oldChapterEn} - ${rubricBase}`;
  }
  return oldChapterEn;
};

// ─── main ─────────────────────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const Rubric = require('../models/Rubric');

  let totalFixed = 0;
  let totalErrors = 0;

  // ── Step 1: Fix rubric-as-chapter contamination ──────────────────────────────
  console.log('════ STEP 1: Re-anchoring rubric-as-chapter records ════');

  for (const fix of RUBRIC_AS_CHAPTER_FIXES) {
    const query = { 'chapter.en': fix.chapter };
    const count = await Rubric.countDocuments(query);

    if (count === 0) {
      console.log(`  ✅ ${fix.chapter}: 0 records (already clean)`);
      continue;
    }

    console.log(`\n  📍 ${fix.chapter} → ${fix.correctChapter} (${count} records)`);

    if (DRY_RUN) {
      // Show a sample in dry-run
      const sample = await Rubric.find(query).limit(2).lean();
      sample.forEach(r =>
        console.log(`     Sample: chapter="${r.chapter?.en}", rubric="${r.rubric?.en}" → new chapter="${fix.correctChapter}", new rubric="${buildNewRubricEn(fix.chapter, r.rubric?.en)}"`)
      );
      totalFixed += count;
      continue;
    }

    // Apply fix: update chapter, prepend old chapter name to rubric path
    const cursor = Rubric.find(query).cursor();
    let localFixed = 0;
    let localErrors = 0;

    for await (const doc of cursor) {
      try {
        const newRubricEn = buildNewRubricEn(fix.chapter, doc.rubric?.en);
        const newRubricHi = doc.rubric?.hi || '';

        doc.chapter.en = fix.correctChapter;
        doc.chapter.hi = fix.chapterHi;
        doc.rubric.en = newRubricEn;
        // Only update Hindi rubric if it doesn't already contain Hindi text
        if (newRubricHi && !/[\u0900-\u097F]/.test(newRubricHi)) {
          doc.rubric.hi = `${fix.chapter} - ${newRubricHi}`;
        }

        await doc.save();
        localFixed++;
        totalFixed++;

        if (localFixed % 50 === 0) {
          console.log(`    … ${localFixed}/${count}`);
        }
      } catch (err) {
        localErrors++;
        totalErrors++;
        console.error(`    ❌ Error on doc ${doc._id}: ${err.message}`);
      }
    }

    console.log(`  ✅ ${fix.chapter}: ${localFixed} records re-anchored to "${fix.correctChapter}". Errors: ${localErrors}`);
  }

  // ── Step 2: Normalize ALL-CAPS chapter names to title-case ──────────────────
  console.log('\n════ STEP 2: Normalizing ALL-CAPS chapter names ════');

  for (const norm of CASE_NORMALIZATIONS) {
    const query = { 'chapter.en': norm.from };
    const count = await Rubric.countDocuments(query);

    if (count === 0) {
      console.log(`  ✅ ${norm.from}: 0 records (already clean)`);
      continue;
    }

    console.log(`  📍 ${norm.from} → ${norm.to} (${count} records)`);

    if (!DRY_RUN) {
      const result = await Rubric.updateMany(
        query,
        { $set: { 'chapter.en': norm.to, 'chapter.hi': norm.hi } }
      );
      console.log(`  ✅ Updated ${result.modifiedCount} records`);
      totalFixed += result.modifiedCount;
    } else {
      totalFixed += count;
    }
  }

  // ── Step 3: Fix "CHAPTER" as chapter name ────────────────────────────────────
  console.log('\n════ STEP 3: Fixing "CHAPTER" as chapter name ════');
  const chapterCount = await Rubric.countDocuments({ 'chapter.en': 'CHAPTER' });
  console.log(`  📍 Found ${chapterCount} records with chapter.en = "CHAPTER"`);

  if (chapterCount > 0 && !DRY_RUN) {
    // Try to infer chapter from rubric.en content
    const chapterRecords = await Rubric.find({ 'chapter.en': 'CHAPTER' }).lean();
    let inferred = 0;
    for (const r of chapterRecords) {
      const rubricLower = (r.rubric?.en || '').toLowerCase();
      let correctChapter = 'Generalities';
      let correctHi = 'सामान्यें';

      if (rubricLower.includes('head') || rubricLower.includes('pain')) {
        correctChapter = 'Head'; correctHi = 'सिर';
      } else if (rubricLower.includes('stomach') || rubricLower.includes('nausea') || rubricLower.includes('vomit')) {
        correctChapter = 'Stomach'; correctHi = 'पेट';
      } else if (rubricLower.includes('skin') || rubricLower.includes('erupt')) {
        correctChapter = 'Skin'; correctHi = 'त्वचा';
      } else if (rubricLower.includes('mind') || rubricLower.includes('anxiety') || rubricLower.includes('fear')) {
        correctChapter = 'Mind'; correctHi = 'मन';
      }

      await Rubric.findByIdAndUpdate(r._id, { $set: { 'chapter.en': correctChapter, 'chapter.hi': correctHi } });
      inferred++;
      totalFixed++;
    }
    console.log(`  ✅ Inferred and fixed ${inferred} "CHAPTER" records`);
  } else if (chapterCount > 0 && DRY_RUN) {
    totalFixed += chapterCount;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`✅ Migration complete!`);
  console.log(`   Total records fixed: ${totalFixed}`);
  console.log(`   Total errors: ${totalErrors}`);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — NO CHANGES WERE WRITTEN.');
    console.log('   Run with DRY_RUN=false to apply.');
  }
  console.log('══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
})();
