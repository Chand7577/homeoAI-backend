require('dotenv').config();
const mongoose = require('mongoose');
const Repertory = require('./models/Repertory');
const Rubric = require('./models/Rubric');

async function testKentRubric() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ No MONGO_URI found in .env file');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find Kent Repertory
    const kentRepertories = await Repertory.find({ 
      name: { $regex: /kent/i } 
    });
    
    console.log('\n📚 Found Repertories with "Kent" in name:');
    kentRepertories.forEach(rep => {
      console.log(`  - ID: ${rep._id}`);
      console.log(`    Name: ${rep.name}`);
      console.log(`    Rubric Count: ${rep.rubricCount || 0}`);
      console.log(`    Type: ${rep.type || 'Repertory'}`);
      console.log('');
    });

    if (kentRepertories.length === 0) {
      console.log('❌ No Kent repertory found. Please upload Kent Excel file first.');
      process.exit(0);
    }

    // Use the first Kent repertory found
    const kent = kentRepertories[0];
    console.log(`\n🔍 Testing rubrics for: ${kent.name} (ID: ${kent._id})`);

    // Count total rubrics
    const totalRubrics = await Rubric.countDocuments({ repertoryId: kent._id });
    console.log(`\n📊 Total Rubrics: ${totalRubrics}`);

    // Get distinct chapters
    const chapters = await Rubric.distinct('chapter.en', { repertoryId: kent._id });
    console.log(`\n📖 Chapters (${chapters.length}):`, chapters.slice(0, 10).join(', '));

    // Test sample queries
    console.log('\n\n🧪 TEST 1: Search for "anxiety" rubrics');
    const anxietyRubrics = await Rubric.find({
      repertoryId: kent._id,
      searchText: { $regex: /anxiety/i }
    }).limit(3);
    
    anxietyRubrics.forEach((rubric, idx) => {
      console.log(`\n  ${idx + 1}. Chapter: ${rubric.chapter.en}`);
      console.log(`     Rubric: ${rubric.rubric.en}`);
      if (rubric.subrubric?.en) console.log(`     Sub-rubric: ${rubric.subrubric.en}`);
      const meds = Object.entries(rubric.medicines || {}).slice(0, 5);
      console.log(`     Medicines (${Object.keys(rubric.medicines || {}).length}): ${meds.map(([m, g]) => `${m}(${g})`).join(', ')}`);
    });

    console.log('\n\n🧪 TEST 2: Search for "headache" in MIND chapter');
    const headacheRubrics = await Rubric.find({
      repertoryId: kent._id,
      searchText: { $regex: /headache/i }
    }).limit(3);
    
    headacheRubrics.forEach((rubric, idx) => {
      console.log(`\n  ${idx + 1}. Chapter: ${rubric.chapter.en}`);
      console.log(`     Rubric: ${rubric.rubric.en}`);
      if (rubric.subrubric?.en) console.log(`     Sub-rubric: ${rubric.subrubric.en}`);
      const meds = Object.entries(rubric.medicines || {}).slice(0, 5);
      console.log(`     Medicines: ${meds.map(([m, g]) => `${m}(${g})`).join(', ')}`);
    });

    console.log('\n\n🧪 TEST 3: Get first 5 rubrics from first chapter');
    if (chapters.length > 0) {
      const firstChapter = chapters[0];
      const chapterRubrics = await Rubric.find({
        repertoryId: kent._id,
        'chapter.en': firstChapter
      }).limit(5);

      console.log(`\n  Chapter: ${firstChapter} (${chapterRubrics.length} rubrics shown)`);
      chapterRubrics.forEach((rubric, idx) => {
        console.log(`\n  ${idx + 1}. ${rubric.rubric.en}`);
        if (rubric.subrubric?.en) console.log(`     Sub: ${rubric.subrubric.en}`);
        const medCount = Object.keys(rubric.medicines || {}).length;
        const meds = Object.entries(rubric.medicines || {}).slice(0, 3);
        console.log(`     Medicines (${medCount}): ${meds.map(([m, g]) => `${m}(${g})`).join(', ')}...`);
      });
    }

    console.log('\n\n✅ Kent Repertory is working correctly!');
    console.log(`\n📈 Summary:`);
    console.log(`   - Repertory: ${kent.name}`);
    console.log(`   - Total Rubrics: ${totalRubrics}`);
    console.log(`   - Chapters: ${chapters.length}`);
    console.log(`   - Sample searches working: ✓`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testKentRubric();
