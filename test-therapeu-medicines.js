/**
 * Check if Therapeu rubrics have medicines populated
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');

async function checkTherapeuMedicines() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Therapeu repertory ID
    const Repertory = require('./models/Repertory');
    const therapeu = await Repertory.findOne({ name: 'Therapeu' });
    
    if (!therapeu) {
      console.log('❌ Therapeu repertory not found');
      return;
    }

    console.log(`📖 Analyzing Therapeu (ID: ${therapeu._id})\n`);

    // Get total rubric count
    const total = await Rubric.countDocuments({ repertoryId: therapeu._id });
    console.log(`Total rubrics: ${total}`);

    // Count rubrics WITH medicines
    const withMeds = await Rubric.countDocuments({
      repertoryId: therapeu._id,
      medicines: { $exists: true, $ne: {} }
    });
    console.log(`Rubrics with medicines: ${withMeds}`);

    // Count rubrics WITHOUT medicines  
    const withoutMeds = total - withMeds;
    console.log(`Rubrics WITHOUT medicines: ${withoutMeds}`);
    console.log(`Percentage missing medicines: ${((withoutMeds/total)*100).toFixed(1)}%\n`);

    // Sample rubrics WITH medicines
    console.log('='.repeat(80));
    console.log('SAMPLE RUBRICS WITH MEDICINES:');
    console.log('='.repeat(80));
    const samplesWithMeds = await Rubric.find({
      repertoryId: therapeu._id,
      medicines: { $exists: true, $ne: {} }
    }).limit(5).lean();

    samplesWithMeds.forEach((rub, idx) => {
      console.log(`\n${idx + 1}. ${rub.chapter?.en} → ${rub.rubric?.en}`);
      const medEntries = Object.entries(rub.medicines || {});
      console.log(`   Medicines (${medEntries.length}): ${medEntries.slice(0, 5).map(([med, grade]) => `${med}(${grade})`).join(', ')}`);
    });

    // Sample rubrics WITHOUT medicines
    console.log('\n\n' + '='.repeat(80));
    console.log('SAMPLE RUBRICS WITHOUT MEDICINES:');
    console.log('='.repeat(80));
    const samplesWithoutMeds = await Rubric.find({
      repertoryId: therapeu._id,
      $or: [
        { medicines: { $exists: false } },
        { medicines: {} }
      ]
    }).limit(10).lean();

    samplesWithoutMeds.forEach((rub, idx) => {
      console.log(`\n${idx + 1}. ${rub.chapter?.en} → ${rub.rubric?.en}`);
      console.log(`   Subrubric: ${rub.subrubric?.en || '(none)'}`);
      console.log(`   Medicines: EMPTY (${typeof rub.medicines})`);
      console.log(`   SearchText: ${rub.searchText ? rub.searchText.substring(0, 80) + '...' : '(empty)'}`);
    });

    // Now check Classical too
    console.log('\n\n' + '='.repeat(80));
    const classical = await Repertory.findOne({ name: 'Classical' });
    if (classical) {
      console.log(`📖 Analyzing Classical (ID: ${classical._id})\n`);
      
      const totalClassical = await Rubric.countDocuments({ repertoryId: classical._id });
      const withMedsClassical = await Rubric.countDocuments({
        repertoryId: classical._id,
        medicines: { $exists: true, $ne: {} }
      });
      const withoutMedsClassical = totalClassical - withMedsClassical;
      
      console.log(`Total rubrics: ${totalClassical}`);
      console.log(`Rubrics with medicines: ${withMedsClassical}`);
      console.log(`Rubrics WITHOUT medicines: ${withoutMedsClassical}`);
      console.log(`Percentage missing medicines: ${((withoutMedsClassical/totalClassical)*100).toFixed(1)}%`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTherapeuMedicines();
