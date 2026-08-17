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
    const req = https.get(url, { timeout: 1500 }, (res) => {
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
    });
    req.on('error', () => resolve(text));
    req.on('timeout', () => {
      req.destroy();
      resolve(text);
    });
  });
};

// Memory translation cache to avoid repetitive network requests
const translationCache = new Map();

const fastTranslateSingle = async (text) => {
  if (!text || !text.trim()) return text;
  const key = text.trim().toLowerCase();
  if (translationCache.has(key)) return translationCache.get(key);

  const res = await googleTranslateSingle(text);
  translationCache.set(key, res);
  return res;
};

async function fixTsvFile(filePath) {
  console.log(`📄 Processing TSV File: ${filePath}`);
  const rawContent = fs.readFileSync(filePath, 'utf8');
  if (!rawContent || !rawContent.trim()) {
    console.log(`⚠️ File is empty (0 bytes).`);
    return;
  }

  const lines = rawContent.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  // Auto-detect header row (check if first cell contains 'chapter' case-insensitively)
  const firstLineCols = lines[0].split('\t');
  const hasHeader = /chapter/i.test(firstLineCols[0]);

  const startIndex = hasHeader ? 1 : 0;
  const fixedLines = hasHeader ? [lines[0]] : [];
  let fixedCount = 0;
  const totalRows = lines.length - startIndex;

  console.log(`📊 Processing ${totalRows} rows...`);

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (i % 1000 === 0 || i === lines.length - 1) {
      const progress = (((i - startIndex + 1) / totalRows) * 100).toFixed(0);
      console.log(`  ⏳ Progress: ${progress}% (${i - startIndex + 1}/${totalRows} rows)`);
    }

    const cols = line.split('\t');
    if (cols.length >= 4) {
      const enRubric = cols[2];
      const hiRubric = cols[3];

      // Check if Hindi rubric contains English letters ([a-zA-Z]{2,})
      if (/[a-zA-Z]{2,}/.test(hiRubric)) {
        let cleanHi = ensureHindiTranslation(enRubric, hiRubric);
        // If English words still remain after dictionary, use fast cached translation
        if (/[a-zA-Z]{2,}/.test(cleanHi)) {
          cleanHi = await fastTranslateSingle(cleanHi);
        }
        cols[3] = postProcessHindiMedicalTerms(cleanHi);
        fixedCount++;
      }
    }
    fixedLines.push(cols.join('\t'));
  }

  const outputPath = filePath.replace(/\.tsv$/, '_fixed.tsv');
  fs.writeFileSync(outputPath, fixedLines.join('\n'), 'utf8');
  console.log(`\n✅ Finished! Processed ${totalRows} rows. Fixed ${fixedCount} rows! Saved to:\n   ${outputPath}`);
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
