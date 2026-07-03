/**
 * Test script to find a specific rubric
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');

async function findSpecificRubric() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Therapeu repertory
    const therapeu = await Repertory.findOne({ name: 'Therapeu' });
    
    if (!therapeu) {
      console.log('❌ Therapeu repertory not found');
      return;
    }

    console.log(`📖 Therapeu ID: ${therapeu._id}\n`);

    // Search for "Generalities" chapter
    console.log('🔍 SEARCHING FOR: "Generalities, Rest aggravates"\n');
    console.log('═'.repeat(80));

    // Method 1: Exact chapter search
    const generalitiesRubrics = await Rubric.find({
      repertoryId: therapeu._id,
      'chapter.en': /generalities/i
    }).lean();

    console.log(`\n📊 Found ${generalitiesRubrics.length} rubrics in Generalities chapter\n`);

    // Method 2: Search for "rest" in rubric text
    const restRubrics = await Rubric.find({
      repertoryId: therapeu._id,
      $or: [
        { 'rubric.en': /rest/i },
        { 'subrubric.en': /rest/i },
        { searchText: /rest/i }
      ]
    }).lean();

    console.log(`📊 Found ${restRubrics.length} rubrics containing "rest"\n`);

    // Method 3: Search for "aggravates" or "aggravation"
    const aggravatesRubrics = await Rubric.find({
      repertoryId: therapeu._id,
      $or: [
        { 'rubric.en': /aggravat/i },
        { 'subrubric.en': /aggravat/i },
        { 'modalities.aggravation': /rest/i },
        { searchText: /aggravat.*rest|rest.*aggravat/i }
      ]
    }).lean();

    console.log(`📊 Found ${aggravatesRubrics.length} rubrics with "aggravates"\n`);

    // Method 4: Combined search
    console.log('\n' + '═'.repeat(80));
    console.log('SEARCHING: Generalities chapter + "rest" + "aggravat"');
    console.log('═'.repeat(80));

    const targetRubrics = await Rubric.find({
      repertoryId: therapeu._id,
      'chapter.en': /generalities/i,
      searchText: /rest.*aggravat|aggravat.*rest/i
    }).lean();

    console.log(`\n✅ Found ${targetRubrics.length} matching rubrics:\n`);

    targetRubrics.forEach((r, idx) => {
      console.log(`${idx + 1}. Chapter: ${r.chapter?.en}`);
      console.log(`   Rubric: ${r.rubric?.en}`);
      console.log(`   Subrubric: ${r.subrubric?.en || '(none)'}`);
      console.log(`   SearchText: ${r.searchText.substring(0, 100)}...`);
      console.log(`   Medicines: ${Object.keys(r.medicines || {}).length}`);
      console.log('');
    });

    // Method 5: Show all Generalities rubrics (first 20)
    console.log('\n' + '═'.repeat(80));
    console.log('SAMPLE: First 20 Generalities rubrics');
    console.log('═'.repeat(80) + '\n');

    generalitiesRubrics.slice(0, 20).forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.rubric?.en}`);
      if (r.subrubric?.en) {
        console.log(`   └─ ${r.subrubric.en}`);
      }
    });

    // Method 6: Fuzzy search for the exact phrase
    console.log('\n\n' + '═'.repeat(80));
    console.log('FUZZY SEARCH: Looking for variations');
    console.log('═'.repeat(80) + '\n');

    const variations = [
      'rest aggravates',
      'rest, aggravates',
      'aggravation rest',
      'worse rest',
      'rest agg'
    ];

    for (const term of variations) {
      const results = await Rubric.find({
        repertoryId: therapeu._id,
        searchText: new RegExp(term.replace(/[,\s]+/g, '.*'), 'i')
      }).limit(5).lean();

      if (results.length > 0) {
        console.log(`\n🎯 "${term}" → Found ${results.length} matches:`);
        results.forEach(r => {
          console.log(`   - ${r.chapter?.en} → ${r.rubric?.en}`);
        });
      }
    }

    // Method 7: Check if rubric exists at all (any chapter)
    console.log('\n\n' + '═'.repeat(80));
    console.log('BROAD SEARCH: "Rest aggravates" in ANY chapter');
    console.log('═'.repeat(80) + '\n');

    const anyChapter = await Rubric.find({
      repertoryId: therapeu._id,
      $or: [
        { 'rubric.en': /rest.*aggravat/i },
        { 'rubric.en': /aggravat.*rest/i },
        { searchText: /\brest\b.*\baggravat/i }
      ]
    }).lean();

    console.log(`Found ${anyChapter.length} rubrics:\n`);
    anyChapter.forEach(r => {
      console.log(`- ${r.chapter?.en} → ${r.rubric?.en}`);
      console.log(`  Subrubric: ${r.subrubric?.en || '(none)'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

findSpecificRubric();
