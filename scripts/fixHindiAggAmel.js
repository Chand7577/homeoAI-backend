'use strict';

/**
 * Migration: Fix agg. / amel. Hindi translations in all existing Rubric records.
 *
 * Old (wrong)  → New (correct)
 * -------------------------------------------
 * एजीजी।       → बढ़ता है   (agg. / aggravation)
 * अमेल।        → घटता है   (amel. / amelioration)
 * अमल।         → घटता है   (typo variant of amel.)
 *
 * Run: node scripts/fixHindiAggAmel.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in .env');
  process.exit(1);
}

const REPLACEMENTS = [
  // Chapter fixes
  { from: /^प्रमुख\b/g, to: 'सिर' },
  { from: /प्रमुख -/g, to: 'सिर -' },

  // Aggravation variants (agg. / agg / एजीजी। / एजीजी. / एजीजी / एजी. / एजी)
  { from: /\bएजीजी[।\.]?/gi, to: 'बढ़ता है' },
  { from: /\bएजी[।\.]?/gi, to: 'बढ़ता है' },
  { from: /\bagg[।\.]?/gi, to: 'बढ़ता है' },

  // Amelioration variants (amel. / amel / अमेल। / अमेल. / अमेल / अमल। / अमल. / अमल)
  { from: /\bअमेल[।\.]?/gi, to: 'घटता है' },
  { from: /\bअमल[।\.]?/gi, to: 'घटता है' },
  { from: /\bamel[।\.]?/gi, to: 'घटता है' },
];

// ─── fields to patch in each Rubric document ─────────────────────────────────
const FIELDS = ['rubric.hi', 'chapter.hi', 'subrubric.hi'];

// ─── helper ──────────────────────────────────────────────────────────────────
const applyReplacements = (str) => {
  if (!str || typeof str !== 'string') return str;
  let result = str;
  for (const { from, to } of REPLACEMENTS) {
    result = result.replace(from, to);
  }
  return result;
};

// ─── main ─────────────────────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const Rubric = require('../models/Rubric');

  // Build a query that matches any document containing the old strings
  const OLD_STRINGS = ['एजीजी', 'एजी', 'अमेल', 'अमल', 'प्रमुख'];
  const orQuery = FIELDS.flatMap(field =>
    OLD_STRINGS.map(s => ({ [field]: { $regex: s } }))
  );

  const total = await Rubric.countDocuments({ $or: orQuery });
  console.log(`📊 Found ${total} documents to update`);

  if (total === 0) {
    console.log('✅ Nothing to fix — all records already up to date.');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let errors  = 0;
  const BATCH = 500;

  const cursor = Rubric.find({ $or: orQuery }).cursor();

  for await (const doc of cursor) {
    try {
      let changed = false;

      // rubric.hi
      const newRubricHi = applyReplacements(doc.rubric?.hi);
      if (newRubricHi !== doc.rubric?.hi) {
        doc.rubric.hi = newRubricHi;
        changed = true;
      }

      // chapter.hi
      const newChapterHi = applyReplacements(doc.chapter?.hi);
      if (newChapterHi !== doc.chapter?.hi) {
        doc.chapter.hi = newChapterHi;
        changed = true;
      }

      // subrubric.hi
      const newSubrubricHi = applyReplacements(doc.subrubric?.hi);
      if (newSubrubricHi !== doc.subrubric?.hi) {
        doc.subrubric.hi = newSubrubricHi;
        changed = true;
      }

      if (changed) {
        await doc.save();
        updated++;
        if (updated % BATCH === 0) {
          console.log(`  … updated ${updated} / ${total}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  ❌ Error on doc ${doc._id}: ${err.message}`);
    }
  }

  console.log(`\n✅ Done! Updated ${updated} records. Errors: ${errors}`);
  await mongoose.disconnect();
})();
