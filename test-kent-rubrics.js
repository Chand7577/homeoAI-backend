require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');

async function testKentRubrics() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Kent repertory
    const kent = await Repertory.findOne({ name: /kent/i });
    if (!kent) {
      console.log('❌ Kent repertory not found');
      return;
    }
    console.log('📚 Found Kent Repertory:', kent.name);
    console.log('   ID:', kent._id);
    console.log('   Total rubrics:', kent.rubricCount);
    console.log('');

    // Test 1: Get a few rubrics from different chapters
    console.log('='.repeat(80));
    console.log('TEST 1: Sample rubrics from different chapters');
    console.log('='.repeat(80));
    
    const sampleRubrics = await Rubric.find({ repertoryId: kent._id })
      .limit(5)
      .lean();

    sampleRubrics.forEach((rubric, idx) => {
      console.log(`\n${idx + 1}. Chapter: ${rubric.chapter?.en || 'N/A'}`);
      console.log(`   Rubric: ${rubric.rubric?.en || 'N/A'}`);
      console.log(`   Sub-rubric: ${rubric.subrubric?.en || 'N/A'}`);
      
      const medObj = rubric.medicines instanceof Map ? Object.fromEntries(rubric.medicines) : (rubric.medicines || {});
      const medCount = Object.keys(medObj).length;
      console.log(`   Medicines: ${medCount} medicines`);
      
      if (medCount > 0) {
        const firstFive = Object.entries(medObj).slice(0, 5);
        console.log('   First 5 medicines:');
        firstFive.forEach(([name, grade]) => {
          console.log(`      ${name}: Grade ${grade}`);
        });
      } else {
        console.log('   ⚠️  NO MEDICINES FOUND!');
      }
    });

    // Test 2: Check specific well-known rubric
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: Search for "MIND - FEAR" rubric');
    console.log('='.repeat(80));
    
    const mindFear = await Rubric.findOne({
      repertoryId: kent._id,
      'chapter.en': /mind/i,
      'rubric.en': /fear/i
    }).lean();

    if (mindFear) {
      console.log('\n✅ Found "MIND - FEAR" rubric:');
      console.log(`   Chapter: ${mindFear.chapter?.en}`);
      console.log(`   Rubric: ${mindFear.rubric?.en}`);
      console.log(`   Sub-rubric: ${mindFear.subrubric?.en || 'None'}`);
      
      const medObj = mindFear.medicines instanceof Map ? Object.fromEntries(mindFear.medicines) : (mindFear.medicines || {});
      const medCount = Object.keys(medObj).length;
      console.log(`   Total medicines: ${medCount}`);
      
      if (medCount > 0) {
        // Group by grade
        const byGrade = { 3: [], 2: [], 1: [] };
        Object.entries(medObj).forEach(([name, grade]) => {
          if (byGrade[grade]) byGrade[grade].push(name);
        });
        
        console.log(`\n   Grade 3 (${byGrade[3].length}): ${byGrade[3].slice(0, 10).join(', ')}${byGrade[3].length > 10 ? '...' : ''}`);
        console.log(`   Grade 2 (${byGrade[2].length}): ${byGrade[2].slice(0, 10).join(', ')}${byGrade[2].length > 10 ? '...' : ''}`);
        console.log(`   Grade 1 (${byGrade[1].length}): ${byGrade[1].slice(0, 10).join(', ')}${byGrade[1].length > 10 ? '...' : ''}`);
      } else {
        console.log('   ⚠️  NO MEDICINES FOUND!');
      }
    } else {
      console.log('\n❌ Could not find "MIND - FEAR" rubric');
    }

    // Test 3: Check medicine name format
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: Verify medicine names are proper (not grades like "1", "2", "3")');
    console.log('='.repeat(80));
    
    const randomRubrics = await Rubric.find({ repertoryId: kent._id })
      .limit(20)
      .lean();

    let validCount = 0;
    let invalidCount = 0;
    const invalidExamples = [];

    randomRubrics.forEach(rubric => {
      const medObj = rubric.medicines instanceof Map ? Object.fromEntries(rubric.medicines) : (rubric.medicines || {});
      const medicineNames = Object.keys(medObj);
      
      medicineNames.forEach(name => {
        // Check if medicine name is just a number (invalid)
        if (/^\d+$/.test(name)) {
          invalidCount++;
          if (invalidExamples.length < 3) {
            invalidExamples.push({
              rubric: rubric.rubric?.en,
              invalidName: name
            });
          }
        } else {
          validCount++;
        }
      });
    });

    console.log(`\n✅ Valid medicine names: ${validCount}`);
    console.log(`❌ Invalid medicine names (just numbers): ${invalidCount}`);
    
    if (invalidExamples.length > 0) {
      console.log('\n⚠️  Examples of invalid entries:');
      invalidExamples.forEach(ex => {
        console.log(`   Rubric: "${ex.rubric}" has medicine name: "${ex.invalidName}"`);
      });
    }

    // Test 4: Count rubrics per chapter
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: Rubrics count by chapter (top 10)');
    console.log('='.repeat(80));
    
    const chapterCounts = await Rubric.aggregate([
      { $match: { repertoryId: kent._id } },
      { $group: { _id: '$chapter.en', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    console.log('');
    chapterCounts.forEach((ch, idx) => {
      console.log(`${idx + 1}. ${ch._id || '[No Chapter]'}: ${ch.count} rubrics`);
    });

    // Test 5: Check for empty medicine lists
    console.log('\n' + '='.repeat(80));
    console.log('TEST 5: Check for rubrics without medicines');
    console.log('='.repeat(80));
    
    const rubricsWithoutMeds = await Rubric.countDocuments({
      repertoryId: kent._id,
      $or: [
        { medicines: { $exists: false } },
        { medicines: {} },
        { medicines: null }
      ]
    });

    const totalRubrics = await Rubric.countDocuments({ repertoryId: kent._id });
    const withMeds = totalRubrics - rubricsWithoutMeds;
    
    console.log(`\n   Total rubrics: ${totalRubrics}`);
    console.log(`   With medicines: ${withMeds} (${((withMeds / totalRubrics) * 100).toFixed(1)}%)`);
    console.log(`   Without medicines: ${rubricsWithoutMeds} (${((rubricsWithoutMeds / totalRubrics) * 100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST COMPLETED');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testKentRubrics();
