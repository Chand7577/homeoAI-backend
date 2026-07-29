const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
require('dotenv').config();

/**
 * Delete rubrics where chapter contains header text like "S.no" or other header indicators
 */
async function deleteHeaderRubrics() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find Mastersheet repertory
    const Repertory = require('./models/Repertory');
    const mastersheet = await Repertory.findOne({ name: /mastersheet/i });
    
    if (!mastersheet) {
      console.log('❌ Mastersheet not found');
      process.exit(1);
    }

    console.log(`📋 Found Mastersheet: ${mastersheet.name} (ID: ${mastersheet._id})`);

    // Delete rubrics with header-like chapter names in Mastersheet
    const headerChapterNames = [
      'S.no',
      's.no',
      'S. no',
      'Sr. No',
      'Serial No',
      'ChapterRubric (Main Symptom)Rubric HindiSub-Rubric (TypeCondition)Sub-Rubric HindiSynonyms Eng——'
    ];

    let totalDeleted = 0;

    for (const chapterName of headerChapterNames) {
      const result = await Rubric.deleteMany({
        repertoryId: mastersheet._id,
        'chapter.en': chapterName
      });
      
      if (result.deletedCount > 0) {
        console.log(`🗑️  Deleted ${result.deletedCount} rubrics with chapter: "${chapterName}"`);
        totalDeleted += result.deletedCount;
      }
    }

    // Also try pattern matching for any remaining header-like chapters
    const patternResult = await Rubric.deleteMany({
      repertoryId: mastersheet._id,
      'chapter.en': { $regex: /^s\.?\s?no\.?$/i }
    });
    
    if (patternResult.deletedCount > 0) {
      console.log(`🗑️  Deleted ${patternResult.deletedCount} rubrics matching S.no pattern`);
      totalDeleted += patternResult.deletedCount;
    }

    console.log(`\n✅ Total deleted: ${totalDeleted} header-like rubrics`);
    
    // Update Mastersheet rubric count
    const count = await Rubric.countDocuments({ repertoryId: mastersheet._id });
    await Repertory.findByIdAndUpdate(mastersheet._id, { rubricCount: count });
    console.log(`📊 Updated ${mastersheet.name}: ${count} rubrics (was ${mastersheet.rubricCount})`);

    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteHeaderRubrics();
