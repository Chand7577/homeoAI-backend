'use strict';

/**
 * Script: Import / Save TSV or Excel Kent Repertory Data to MongoDB.
 *
 * Usage:
 *   node server/scripts/importTsvToMongo.js <file_path.tsv|xlsx> [repertory_id]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Rubric = require('../models/Rubric');
const Repertory = require('../models/Repertory');
const { ensureHindiTranslation, postProcessHindiMedicalTerms } = require('../services/kentAiParser');

const DEFAULT_KENT_ID = '6a4b3cc4b051c9d866c5364c';

// Helper to clean and split rubric paths
const cleanRubricPath = (pathStr, chapterEn) => {
  if (!pathStr) return { rubric: '', subrubric: '' };
  let path = pathStr.trim();
  if (chapterEn) {
    const chapRegex = new RegExp(`^${chapterEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
    path = path.replace(chapRegex, '').trim();
  }
  const parts = path.split(/\s*-\s*/);
  const rubric = parts[0] ? parts[0].trim() : '';
  const subrubric = parts.slice(1).join(' - ').trim();
  return { rubric, subrubric };
};

async function parseTsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) throw new Error('TSV file is empty or missing data rows.');

  const groupedRubrics = new Map(); // key: chapterEn|||rubricEn|||subrubricEn

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;

    const chapterEn = cols[0].trim() || 'EYE';
    const chapterHi = cols[1].trim() || 'आंख';
    let rubricEnPath = cols[2].trim();
    let rubricHiPath = cols[3].trim();
    const medicine = cols[4].trim();
    const grade = parseInt(cols[5], 10) || 1;

    if (!rubricEnPath || !medicine) continue;

    // Ensure full path has chapter prefix if missing
    if (!rubricEnPath.toUpperCase().startsWith(chapterEn.toUpperCase() + ' - ')) {
      rubricEnPath = `${chapterEn} - ${rubricEnPath}`;
    }

    // Sanitize Hindi rubric to ensure no raw English remains
    rubricHiPath = ensureHindiTranslation(rubricEnPath, rubricHiPath);
    rubricHiPath = postProcessHindiMedicalTerms(rubricHiPath);

    const { rubric: rubricEn, subrubric: subrubricEn } = cleanRubricPath(rubricEnPath, chapterEn);
    const { rubric: rubricHi, subrubric: subrubricHi } = cleanRubricPath(rubricHiPath, chapterHi);

    const groupKey = `${chapterEn}|||${rubricEn}|||${subrubricEn}`.toLowerCase();

    if (!groupedRubrics.has(groupKey)) {
      groupedRubrics.set(groupKey, {
        chapter: { en: chapterEn, hi: chapterHi },
        rubric: { en: rubricEn, hi: rubricHi },
        subrubric: { en: subrubricEn, hi: subrubricHi },
        medicines: {}
      });
    }

    const doc = groupedRubrics.get(groupKey);
    doc.medicines[medicine] = Math.max(doc.medicines[medicine] || 0, grade);
  }

  return Array.from(groupedRubrics.values());
}

async function runImport() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node server/scripts/importTsvToMongo.js <file.tsv> [repertoryId]');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const repertoryId = args[1] || DEFAULT_KENT_ID;

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in environment.');
    process.exit(1);
  }

  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(MONGO_URI);
  console.log(`✅ Connected to MongoDB.`);

  const repertory = await Repertory.findById(repertoryId);
  if (!repertory) {
    console.error(`❌ Repertory not found with ID: ${repertoryId}`);
    process.exit(1);
  }

  console.log(`📖 Target Repertory: ${repertory.name} (${repertory._id})`);
  console.log(`📥 Parsing file: ${filePath}`);

  const rubricsToImport = await parseTsv(filePath);
  console.log(`📊 Found ${rubricsToImport.length} unique rubrics to save into MongoDB.`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const item of rubricsToImport) {
    const filter = {
      repertoryId: repertory._id,
      'chapter.en': item.chapter.en,
      'rubric.en': item.rubric.en,
      'subrubric.en': item.subrubric.en
    };

    const searchTextParts = [
      item.chapter.en, item.chapter.hi,
      item.rubric.en, item.rubric.hi,
      item.subrubric.en, item.subrubric.hi,
      ...Object.keys(item.medicines)
    ].filter(Boolean);

    const searchText = searchTextParts.join(' ').toLowerCase();

    const existing = await Rubric.findOne(filter);

    if (existing) {
      // Merge medicines
      for (const [med, grade] of Object.entries(item.medicines)) {
        existing.medicines.set(med, grade);
      }
      existing.rubric.hi = item.rubric.hi;
      existing.subrubric.hi = item.subrubric.hi;
      existing.searchText = searchText;
      await existing.save();
      updatedCount++;
    } else {
      await Rubric.create({
        repertoryId: repertory._id,
        chapter: item.chapter,
        rubric: item.rubric,
        subrubric: item.subrubric,
        medicines: item.medicines,
        searchText: searchText
      });
      insertedCount++;
    }
  }

  // Update total rubric count on Repertory document
  const totalRubrics = await Rubric.countDocuments({ repertoryId: repertory._id });
  repertory.rubricCount = totalRubrics;
  await repertory.save();

  console.log(`\n🎉 Import completed successfully!`);
  console.log(`   - New Rubrics Created: ${insertedCount}`);
  console.log(`   - Existing Rubrics Updated: ${updatedCount}`);
  console.log(`   - Total Rubrics in Repertory: ${totalRubrics}`);

  await mongoose.disconnect();
}

runImport().catch(err => {
  console.error('❌ Import Error:', err);
  process.exit(1);
});
