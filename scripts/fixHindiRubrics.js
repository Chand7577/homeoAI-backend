'use strict';

/**
 * Utility Script: Sanitize and Translate Untranslated English Words in Hindi Rubrics.
 *
 * Usage:
 *   node server/scripts/fixHindiRubrics.js [tsv_file_path]
 *   Or run without arguments to patch MongoDB database records.
 */

const fs = require('fs');
const path = require('path');
const { ensureHindiTranslation, postProcessHindiMedicalTerms } = require('../services/kentAiParser');

// Free Google Translate helper for fallback segment translation
const googleTranslateSingle = (text, targetLang = 'hi') => {
  if (!text || !text.trim()) return Promise.resolve('');
  const https = require('https');
  return new Promise((resolve) => {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text.trim());
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translatedText = parsed[0].map(item => item[0]).join('');
          resolve(translatedText || text);
        } catch (e) {
          resolve(text);
        }
      });
    }).on('error', () => resolve(text));
  });
};

async function fixTsvFile(filePath) {
  console.log(`📄 Processing TSV File: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  if (lines.length === 0) return;

  const header = lines[0];
  const fixedLines = [header];
  let fixedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split('\t');
    if (cols.length >= 4) {
      const enRubric = cols[2];
      const hiRubric = cols[3];

      // Check if Hindi rubric contains English letters ([a-zA-Z]{2,})
      if (/[a-zA-Z]{2,}/.test(hiRubric)) {
        let cleanHi = ensureHindiTranslation(enRubric, hiRubric);
        // If English words still remain after dictionary, run Google Translate on remaining English parts
        if (/[a-zA-Z]{2,}/.test(cleanHi)) {
          cleanHi = await googleTranslateSingle(cleanHi);
        }
        cols[3] = postProcessHindiMedicalTerms(cleanHi);
        fixedCount++;
      }
    }
    fixedLines.push(cols.join('\t'));
  }

  const outputPath = filePath.replace(/\.tsv$/, '_fixed.tsv');
  fs.writeFileSync(outputPath, fixedLines.join('\n'), 'utf8');
  console.log(`✅ Fixed ${fixedCount} rows! Saved to: ${outputPath}`);
}

async function fixDatabase() {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const mongoose = require('mongoose');
  const Rubric = require('../models/Rubric');

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Query rubrics where rubric.hi contains English letters
  const cursor = Rubric.find({ 'rubric.hi': { $regex: /[a-zA-Z]{2,}/ } }).cursor();
  let updated = 0;

  for await (const doc of cursor) {
    const enText = doc.rubric?.en || '';
    const hiText = doc.rubric?.hi || '';

    let cleanHi = ensureHindiTranslation(enText, hiText);
    if (/[a-zA-Z]{2,}/.test(cleanHi)) {
      cleanHi = await googleTranslateSingle(cleanHi);
    }
    cleanHi = postProcessHindiMedicalTerms(cleanHi);

    if (cleanHi !== doc.rubric.hi) {
      doc.rubric.hi = cleanHi;
      await doc.save();
      updated++;
      if (updated % 100 === 0) {
        console.log(`  … updated ${updated} records`);
      }
    }
  }

  console.log(`\n✅ Done! Cleaned ${updated} database records.`);
  await mongoose.disconnect();
}

const args = process.argv.slice(2);
if (args.length > 0 && args[0].endsWith('.tsv')) {
  fixTsvFile(path.resolve(args[0]));
} else {
  fixDatabase().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
