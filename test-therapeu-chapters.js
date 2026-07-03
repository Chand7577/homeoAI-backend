/**
 * Check all chapters in Therapeu repertory
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');

async function checkTherapeuChapters() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const therapeu = await Repertory.findOne({ name: 'Therapeu' });
    
    if (!therapeu) {
      console.log('❌ Therapeu not found');
      return;
    }

    console.log('📖 THERAPEU REPERTORY');
    console.log('═'.repeat(80));
    console.log(`Total Rubrics: ${therapeu.rubricCount || 0}\n`);

    // Get all distinct chapters
    const chapters = await Rubric.aggregate([
      { $match: { repertoryId: therapeu._id } },
      {
        $group: {
          _id: '$chapter.en',
          count: { $sum: 1 },
          sampleRubric: { $first: '$rubric.en' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log(`📊 Distinct Chapters: ${chapters.length}\n`);
    console.log('═'.repeat(80));

    chapters.forEach((ch, idx) => {
      console.log(`${idx + 1}. "${ch._id}" → ${ch.count} rubrics`);
      console.log(`   Sample: ${ch.sampleRubric}`);
      console.log('');
    });

    // Look for "generalities" in any variation
    console.log('\n' + '═'.repeat(80));
    console.log('SEARCHING FOR "GENERALITIES" VARIATIONS:');
    console.log('═'.repeat(80) + '\n');

    const generalitiesVariations = chapters.filter(ch => 
      ch._id && ch._id.toLowerCase().includes('general')
    );

    if (generalitiesVariations.length > 0) {
      console.log('✅ Found chapters with "general":');
      generalitiesVariations.forEach(ch => {
        console.log(`   - "${ch._id}" → ${ch.count} rubrics`);
      });
    } else {
      console.log('❌ No chapters containing "general" found');
    }

    // Check for "rest aggravates" in searchText across all chapters
    console.log('\n\n' + '═'.repeat(80));
    console.log('SEARCHING: "rest" + "aggravat" IN ALL CHAPTERS');
    console.log('═'.repeat(80) + '\n');

    const restAggRubrics = await Rubric.find({
      repertoryId: therapeu._id,
      searchText: /rest/i
    }).limit(10).lean();

    console.log(`Found ${restAggRubrics.length} rubrics with "rest":\n`);
    
    restAggRubrics.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.chapter?.en} → ${r.rubric?.en}`);
      if (r.subrubric?.en) console.log(`   Subrubric: ${r.subrubric.en}`);
      console.log(`   SearchText: ${r.searchText.substring(0, 80)}...`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

checkTherapeuChapters();
