require('dotenv').config();
const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');

async function testAPIResponse() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find Kent Repertory
    const kent = await Repertory.findOne({ name: /kent/i });
    if (!kent) {
      console.log('❌ No Kent repertory found');
      process.exit(0);
    }

    console.log(`📚 Testing API response for Kent Repertory: ${kent.name}`);
    console.log(`   ID: ${kent._id}\n`);

    // Simulate the API query (same as frontend getRubrics call)
    const rubrics = await Rubric.find({
      repertoryId: kent._id,
      'chapter.en': 'Mind'
    }).limit(5);

    console.log(`📊 Found ${rubrics.length} rubrics from MIND chapter\n`);

    rubrics.forEach((rubric, idx) => {
      console.log(`${idx + 1}. Rubric: ${rubric.rubric.en}`);
      console.log(`   Rubric Hindi: ${rubric.rubric.hi || '(none)'}`);
      console.log(`   Medicines object type: ${rubric.medicines.constructor.name}`);
      
      // Convert to plain object for display (simulating JSON.stringify/parse that API does)
      const medicinesForAPI = rubric.toJSON().medicines;
      console.log(`   Medicines after toJSON():`, medicinesForAPI);
      console.log(`   Medicines keys:`, Object.keys(medicinesForAPI));
      console.log(`   Sample entries:`, Object.entries(medicinesForAPI).slice(0, 3));
      console.log('');
    });

    // Now test what the actual API endpoint returns
    console.log('\n🔍 Simulating actual API response format:\n');
    
    const apiResponse = rubrics.map(r => r.toJSON());
    console.log('Sample rubric as API would return it:');
    console.log(JSON.stringify(apiResponse[0], null, 2).substring(0, 800) + '...');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testAPIResponse();
