require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');

async function testMedicineData() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get a few sample rubrics to check medicine data structure
    const samples = await Rubric.find({
      'chapter.en': 'Mind'
    }).limit(10);

    console.log('📋 Sample Rubrics from MIND chapter:\n');
    
    samples.forEach((rubric, idx) => {
      console.log(`${idx + 1}. ${rubric.rubric.en}`);
      console.log(`   Chapter: ${rubric.chapter.en}`);
      
      // Convert medicines Map to object for display
      const medicinesObj = rubric.medicines instanceof Map 
        ? Object.fromEntries(rubric.medicines) 
        : rubric.medicines;
      
      const medicinesList = Object.entries(medicinesObj || {});
      console.log(`   Total Medicines: ${medicinesList.length}`);
      console.log(`   Medicines:`, medicinesList.slice(0, 10));
      console.log('');
    });

    // Check if any rubrics have proper medicine names (not just numbers)
    const withProperMeds = await Rubric.findOne({
      'chapter.en': 'Mind'
    }).lean();

    console.log('\n🔍 Checking medicine data structure:');
    const meds = withProperMeds?.medicines || {};
    const medKeys = Object.keys(meds);
    console.log('Sample medicine keys:', medKeys.slice(0, 20));
    
    // Check if keys look like medicine names or just numbers
    const hasProperNames = medKeys.some(key => key.length > 3 && isNaN(key));
    console.log(`\n${hasProperNames ? '✅' : '❌'} Proper medicine names: ${hasProperNames ? 'YES' : 'NO (only numbers found)'}`);

    if (!hasProperNames) {
      console.log('\n⚠️  WARNING: Medicines are stored as numbers instead of names!');
      console.log('This suggests the Excel file has medicine grades as column headers');
      console.log('instead of medicine names as column headers.\n');
      console.log('Expected format:');
      console.log('  Chapter | Rubric | Aconitum | Belladonna | Pulsatilla');
      console.log('  Mind    | Anxiety | 3        | 2          | 1\n');
      console.log('Current format detected:');
      console.log('  Chapter | Rubric | 1 | 2 | 3');
      console.log('  Mind    | Anxiety | X | X | X');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testMedicineData();
