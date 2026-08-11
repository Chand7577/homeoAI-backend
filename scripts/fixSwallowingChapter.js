'use strict';

/**
 * Migration: Fix "SWALLOWING" chapter hierarchy contamination.
 *
 * Root cause: The AI parser misread the right-column continuation header
 * "swallowing, when:" (a sub-rubric of HEAD - PAIN, sudden) as a top-level
 * chapter heading "SWALLOWING".
 *
 * This script:
 *  1. Re-anchors all Rubric docs where chapter.en === "SWALLOWING" back to
 *     chapter.en = "HEAD" and prepends "PAIN, sudden - " to their rubric path.
 *  2. Normalises chapter.hi from "निगलना" → "सिर" for those records.
 *  3. Also normalises any records that still have the wrong chapter.hi = "प्रमुख"
 *     (a known OCR artifact) → "सिर".
 *  4. Prints a dry-run summary before writing; set DRY_RUN=false env var to apply.
 *
 * Run:
 *   node scripts/fixSwallowingChapter.js              # dry-run (safe)
 *   DRY_RUN=false node scripts/fixSwallowingChapter.js # apply changes
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

// ─── Rubric paths within HEAD - PAIN, sudden that were contaminated ───────────
// Maps the incorrect rubric.en (as stored under the fake SWALLOWING chapter)
// → the correct rubric.en it should have under HEAD chapter.
//
// Pattern: The AI stored them as "SWALLOWING - <qualifier>" or just "<qualifier>"
// All of these belong under "PAIN, sudden - swallowing, when - <qualifier>"
// (or "PAIN, sudden - <qualifier>" for those that were sibling sub-rubrics).
//
// Reference: Kent's Repertory p.156 right-column bottom section, continuation
// of "PAIN, sudden" under the HEAD chapter.
const SWALLOWING_RUBRIC_MAP = [
  // Format: { oldRubricEn, newRubricEn, oldRubricHi, newRubricHi }
  // Generic: anything listed as "SWALLOWING - SWALLOWING - when" or variations
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*when/i,
    newRubricEn: 'PAIN, sudden - swallowing, when',
    newRubricHi: 'दर्द, अचानक - निगलने पर',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*SWALLOWING/i,
    newRubricEn: 'PAIN, sudden - swallowing, when',
    newRubricHi: 'दर्द, अचानक - निगलने पर',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*SYMPHILITIC/i,
    newRubricEn: 'PAIN, sudden - syphilitic',
    newRubricHi: 'दर्द, अचानक - सिफलिटिक',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*TALKING/i,
    newRubricEn: 'PAIN, sudden - talking, while, agg.',
    newRubricHi: 'दर्द, अचानक - बोलना, जबकि - बढ़ता है',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*AMEL/i,
    newRubricEn: 'PAIN, sudden - amel.',
    newRubricHi: 'दर्द, अचानक - घटता है',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*DISTANT/i,
    newRubricEn: 'PAIN, sudden - swallowing, when - distant',
    newRubricHi: 'दर्द, अचानक - निगलने पर - दूर का',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*OTHERS/i,
    newRubricEn: "PAIN, sudden - swallowing, when - others, of",
    newRubricHi: "दर्द, अचानक - निगलने पर - दूसरों का",
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*TEA/i,
    newRubricEn: 'PAIN, sudden - swallowing, when - tea, from',
    newRubricHi: 'दर्द, अचानक - निगलने पर - चाय, से',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*STRONG/i,
    newRubricEn: 'PAIN, sudden - swallowing, when - strong',
    newRubricHi: 'दर्द, अचानक - निगलने पर - तीव्र',
  },
  {
    matchOldRubric: /^SWALLOWING\s*[-–]\s*TEETH/i,
    newRubricEn: 'PAIN, sudden - swallowing, when - teeth, on compressing the',
    newRubricHi: 'दर्द, अचानक - निगलने पर - दाँत, दबाने पर',
  },
];

// Catch-all: any remaining SWALLOWING chapter rubrics we haven't specifically mapped
// will be moved to "PAIN, sudden - swallowing, when - <original qualifier>"
const buildCatchAllPath = (oldRubricEn) => {
  // Try to extract the qualifier after the second dash
  const parts = oldRubricEn.split(/\s*[-–]\s*/);
  // Parts[0] = "SWALLOWING" (the fake chapter), parts[1] = sub-rubric text
  const qualifier = parts.slice(1).join(' - ').trim();
  if (!qualifier || qualifier.toUpperCase() === 'SWALLOWING') {
    return 'PAIN, sudden - swallowing, when';
  }
  return `PAIN, sudden - swallowing, when - ${qualifier.toLowerCase()}`;
};

const buildCatchAllHindiPath = (qualifier) => {
  if (!qualifier || qualifier.toUpperCase() === 'SWALLOWING') {
    return 'दर्द, अचानक - निगलने पर';
  }
  return `दर्द, अचानक - निगलने पर - ${qualifier}`;
};

// ─── main ─────────────────────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const Rubric = require('../models/Rubric');

  // ── 1. Fix SWALLOWING chapter contamination ──────────────────────────────────
  const swallowingQuery = { 'chapter.en': { $regex: /^SWALLOWING$/i } };
  const swallowingTotal = await Rubric.countDocuments(swallowingQuery);
  console.log(`📊 Found ${swallowingTotal} records with chapter.en = "SWALLOWING"`);

  let swallowingFixed = 0;
  let swallowingErrors = 0;

  if (swallowingTotal > 0) {
    const cursor = Rubric.find(swallowingQuery).cursor();

    for await (const doc of cursor) {
      try {
        const oldRubricEn = (doc.rubric?.en || '').trim();

        // Find a matching rule
        let newRubricEn = '';
        let newRubricHi = '';

        for (const rule of SWALLOWING_RUBRIC_MAP) {
          if (rule.matchOldRubric.test(oldRubricEn)) {
            newRubricEn = rule.newRubricEn;
            newRubricHi = rule.newRubricHi;
            break;
          }
        }

        // Fall back to catch-all
        if (!newRubricEn) {
          newRubricEn = buildCatchAllPath(oldRubricEn);
          const parts = oldRubricEn.split(/\s*[-–]\s*/);
          const qualifier = parts.slice(1).join(' - ').trim();
          newRubricHi = buildCatchAllHindiPath(qualifier);
        }

        console.log(
          `  [${swallowingFixed + 1}] SWALLOWING → HEAD\n` +
          `      rubric.en: "${oldRubricEn}" → "${newRubricEn}"\n` +
          `      chapter.hi: "${doc.chapter?.hi}" → "सिर"`
        );

        if (!DRY_RUN) {
          doc.chapter.en = 'HEAD';
          doc.chapter.hi = 'सिर';
          doc.rubric.en = newRubricEn;
          if (newRubricHi) doc.rubric.hi = newRubricHi;
          await doc.save();
        }

        swallowingFixed++;
      } catch (err) {
        swallowingErrors++;
        console.error(`  ❌ Error on doc ${doc._id}: ${err.message}`);
      }
    }

    console.log(`\n✅ SWALLOWING fix: ${swallowingFixed} records re-anchored to HEAD. Errors: ${swallowingErrors}`);
  } else {
    console.log('✅ No SWALLOWING chapter contamination found — already clean!');
  }

  // ── 2. Fix remaining chapter.hi = "प्रमुख" (OCR artifact) → "सिर" ───────────
  const wrongHindiQuery = { 'chapter.hi': { $regex: /^प्रमुख/ } };
  const wrongHindiTotal = await Rubric.countDocuments(wrongHindiQuery);
  console.log(`\n📊 Found ${wrongHindiTotal} records with chapter.hi starting "प्रमुख" (OCR artifact)`);

  let hindiFixed = 0;
  let hindiErrors = 0;

  if (wrongHindiTotal > 0) {
    if (!DRY_RUN) {
      const result = await Rubric.updateMany(
        wrongHindiQuery,
        [{ $set: { 'chapter.hi': { $replaceAll: { input: '$chapter.hi', find: 'प्रमुख', replacement: 'सिर' } } } }]
      );
      hindiFixed = result.modifiedCount;
    } else {
      hindiFixed = wrongHindiTotal; // just report what would be done
    }
    console.log(`✅ Hindi chapter fix: ${hindiFixed} records updated ("प्रमुख" → "सिर"). Errors: ${hindiErrors}`);
  } else {
    console.log('✅ No "प्रमुख" chapter.hi artifacts found — already clean!');
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`✅ Migration complete!`);
  console.log(`   SWALLOWING → HEAD: ${swallowingFixed} records`);
  console.log(`   Hindi प्रमुख → सिर: ${hindiFixed} records`);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — NO CHANGES WERE WRITTEN.');
    console.log('   Run with DRY_RUN=false to apply.');
  }
  console.log('══════════════════════════════════════════════════');

  await mongoose.disconnect();
})();
