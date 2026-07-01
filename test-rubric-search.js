/**
 * DIAGNOSTIC SCRIPT: Test rubric search functionality
 * 
 * This script connects to MongoDB and tests:
 * 1. What repertories exist
 * 2. Sample rubrics from each repertory
 * 3. searchText field population
 * 4. Symptom matching logic
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Repertory = require('./models/Repertory');
const Rubric = require('./models/Rubric');

const testSymptoms = [
  'eye pain',
  'twitching eyelid',
  'headache worse from reading'
];

async function diagnose() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. List all repertories
    console.log('📚 REPERTORIES IN DATABASE:');
    console.log('═'.repeat(80));
    const repertories = await Repertory.find({}).lean();
    repertories.forEach((rep, idx) => {
      console.log(`${idx + 1}. ${rep.name} (ID: ${rep._id})`);
      console.log(`   - Type: ${rep.type || 'Repertory'}`);
      console.log(`   - Rubric Count: ${rep.rubricCount || 0}`);
      console.log(`   - Created: ${rep.createdAt}`);
      console.log('');
    });

    if (repertories.length === 0) {
      console.log('❌ No repertories found in database!');
      process.exit(0);
    }

    // 2. For each repertory, check sample rubrics
    for (const repertory of repertories) {
      console.log('\n' + '═'.repeat(80));
      console.log(`📖 ANALYZING: ${repertory.name}`);
      console.log('═'.repeat(80));

      // Get actual rubric count
      const actualCount = await Rubric.countDocuments({ repertoryId: repertory._id });
      console.log(`\n✓ Total rubrics: ${actualCount}`);

      // Get distinct chapters
      const chapters = await Rubric.aggregate([
        { $match: { repertoryId: repertory._id } },
        { $group: { _id: '$chapter.en', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      
      console.log(`\n✓ Distinct chapters (${chapters.length}):`);
      chapters.forEach(ch => {
        console.log(`   - ${ch._id || '(empty)'}: ${ch.count} rubrics`);
      });

      // Sample rubrics
      console.log(`\n✓ Sample rubrics (first 5):`);
      const samples = await Rubric.find({ repertoryId: repertory._id }).limit(5).lean();
      samples.forEach((rub, idx) => {
        console.log(`\n   ${idx + 1}. Chapter: ${rub.chapter?.en || '(missing)'}`);
        console.log(`      Rubric: ${rub.rubric?.en || '(missing)'}`);
        console.log(`      Subrubric: ${rub.subrubric?.en || '(none)'}`);
        console.log(`      SearchText: ${rub.searchText ? rub.searchText.substring(0, 100) + '...' : '(EMPTY!)'}`);
        console.log(`      Medicines: ${Object.keys(rub.medicines || {}).length} medicines`);
        if (rub.medicines) {
          const medList = Object.entries(rub.medicines).slice(0, 3).map(([med, grade]) => `${med}(${grade})`).join(', ');
          console.log(`      Sample meds: ${medList}`);
        }
      });

      // Check for rubrics with empty searchText
      const emptySearchCount = await Rubric.countDocuments({ 
        repertoryId: repertory._id,
        $or: [
          { searchText: '' },
          { searchText: { $exists: false } }
        ]
      });
      console.log(`\n⚠️  Rubrics with empty searchText: ${emptySearchCount}/${actualCount}`);

      // Test symptom matching
      console.log(`\n\n🔍 TESTING SYMPTOM MATCHING:`);
      console.log('─'.repeat(80));
      
      for (const symptom of testSymptoms) {
        console.log(`\nSymptom: "${symptom}"`);
        
        // Extract search terms (same logic as aiService.js)
        const stopWords = new Set(['and', 'the', 'for', 'with', 'worse', 'better', 'from', 'after', 'before', 'without', 'about', 'feels']);
        const chapterStopWords = new Set(['mind', 'head', 'eye', 'eyes', 'ear', 'ears', 'nose', 'face', 'mouth', 'throat', 'stomach', 'abdomen', 'stool', 'urine', 'cough', 'fever', 'chill', 'sleep', 'skin', 'chest', 'back', 'extremities']);
        
        const allTerms = symptom.toLowerCase()
          .replace(/[^\w\s\u0900-\u097F]/g, ' ')
          .split(/\s+/)
          .map(w => w.trim())
          .filter(w => w.length > 2 && !stopWords.has(w));
        
        const specificTerms = allTerms.filter(t => !chapterStopWords.has(t));
        const activeTerms = specificTerms.length > 0 ? specificTerms : allTerms;
        
        console.log(`   → Search terms: [${activeTerms.join(', ')}]`);
        
        // Test AND query (all terms must match)
        const andQuery = {
          repertoryId: repertory._id,
          $and: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
        };
        
        const andMatches = await Rubric.find(andQuery).limit(10).lean();
        console.log(`   → AND matches: ${andMatches.length} rubrics`);
        
        if (andMatches.length > 0) {
          andMatches.slice(0, 3).forEach((match, idx) => {
            console.log(`      ${idx + 1}. ${match.chapter?.en} → ${match.rubric?.en}`);
          });
        }
        
        // Test OR query (any term matches)
        const orQuery = {
          repertoryId: repertory._id,
          $or: activeTerms.map(t => ({ searchText: new RegExp(t, 'i') }))
        };
        
        const orMatches = await Rubric.find(orQuery).limit(10).lean();
        console.log(`   → OR matches: ${orMatches.length} rubrics`);
        
        if (orMatches.length > 0 && andMatches.length === 0) {
          orMatches.slice(0, 3).forEach((match, idx) => {
            console.log(`      ${idx + 1}. ${match.chapter?.en} → ${match.rubric?.en}`);
          });
        }
      }
    }

    console.log('\n\n' + '═'.repeat(80));
    console.log('✅ DIAGNOSIS COMPLETE');
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

diagnose();
