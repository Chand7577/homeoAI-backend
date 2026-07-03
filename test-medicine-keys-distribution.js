require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');

async function analyzeMedicineKeys() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const kent = await Repertory.findOne({ name: /kent/i });
    if (!kent) {
      console.log('❌ No Kent repertory found');
      process.exit(0);
    }

    console.log(`📚 Analyzing Kent Repertory: ${kent.name}\n`);

    // Sample 100 rubrics
    const samples = await Rubric.find({ repertoryId: kent._id }).limit(100);

    let withProperNames = 0;
    let withNumericKeys = 0;
    let withMixedKeys = 0;
    let empty = 0;

    const properNameExamples = [];
    const numericKeyExamples = [];

    samples.forEach(rubric => {
      const meds = rubric.toJSON().medicines;
      const keys = Object.keys(meds || {});

      if (keys.length === 0) {
        empty++;
        return;
      }

      const hasProperNames = keys.some(k => k.length > 3 && isNaN(k));
      const hasNumericKeys = keys.some(k => !isNaN(k));

      if (hasProperNames && !hasNumericKeys) {
        withProperNames++;
        if (properNameExamples.length < 3) {
          properNameExamples.push({
            rubric: rubric.rubric.en,
            medicines: meds
          });
        }
      } else if (hasNumericKeys && !hasProperNames) {
        withNumericKeys++;
        if (numericKeyExamples.length < 3) {
          numericKeyExamples.push({
            rubric: rubric.rubric.en,
            chapter: rubric.chapter.en,
            medicines: meds
          });
        }
      } else if (hasProperNames && hasNumericKeys) {
        withMixedKeys++;
      }
    });

    console.log('📊 Analysis Results (100 rubrics sampled):');
    console.log(`   ✅ With proper medicine names: ${withProperNames}`);
    console.log(`   ⚠️  With numeric keys only: ${withNumericKeys}`);
    console.log(`   🔀 With mixed keys: ${withMixedKeys}`);
    console.log(`   ⚪ Empty medicines: ${empty}\n`);

    if (properNameExamples.length > 0) {
      console.log('✅ Examples with PROPER medicine names:');
      properNameExamples.forEach(ex => {
        console.log(`   - ${ex.rubric}`);
        console.log(`     Medicines:`, ex.medicines);
      });
      console.log('');
    }

    if (numericKeyExamples.length > 0) {
      console.log('⚠️  Examples with NUMERIC keys (problem):');
      numericKeyExamples.forEach(ex => {
        console.log(`   - Chapter: ${ex.chapter}`);
        console.log(`     Rubric: ${ex.rubric}`);
        console.log(`     Medicines:`, ex.medicines);
      });
      console.log('');
    }

    // Check specific chapters
    console.log('\n🔍 Checking specific chapters:');
    const chapters = ['Mind', 'ABDOMEN', 'Extremities'];
    
    for (const chap of chapters) {
      const sample = await Rubric.findOne({ 
        repertoryId: kent._id,
        'chapter.en': chap
      });
      
      if (sample) {
        const meds = sample.toJSON().medicines;
        const keys = Object.keys(meds || {});
        const hasProper = keys.some(k => k.length > 3 && isNaN(k));
        
        console.log(`   ${chap}: ${hasProper ? '✅ Proper names' : '⚠️  Numeric keys'}`);
        console.log(`      Sample rubric: ${sample.rubric.en}`);
        console.log(`      Medicine keys: ${keys.slice(0, 5).join(', ')}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

analyzeMedicineKeys();
