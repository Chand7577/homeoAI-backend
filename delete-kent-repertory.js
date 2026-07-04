require('dotenv').config();
const mongoose = require('mongoose');
const Repertory = require('./models/Repertory');
const Rubric = require('./models/Rubric');

async function deleteKentRepertory() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Kent repertory
    const kent = await Repertory.findOne({ name: /kent/i });
    
    if (!kent) {
      console.log('❌ Kent repertory not found in database');
      return;
    }

    console.log('📚 Found Kent Repertory:');
    console.log(`   Name: ${kent.name}`);
    console.log(`   ID: ${kent._id}`);
    console.log(`   Rubric count: ${kent.rubricCount}`);
    console.log('');

    // Count rubrics
    const rubricCount = await Rubric.countDocuments({ repertoryId: kent._id });
    console.log(`📊 Total rubrics in database: ${rubricCount}`);
    console.log('');

    // Ask for confirmation
    console.log('⚠️  WARNING: This will permanently delete:');
    console.log(`   - The Kent repertory entry`);
    console.log(`   - All ${rubricCount} associated rubrics`);
    console.log('');
    console.log('🔄 You can re-upload the Kent Excel file after deletion');
    console.log('');

    // Delete confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('❓ Type "DELETE" to confirm deletion: ', async (answer) => {
      if (answer.trim() === 'DELETE') {
        console.log('\n🗑️  Deleting rubrics...');
        const deleteResult = await Rubric.deleteMany({ repertoryId: kent._id });
        console.log(`✅ Deleted ${deleteResult.deletedCount} rubrics`);

        console.log('\n🗑️  Deleting repertory...');
        await Repertory.deleteOne({ _id: kent._id });
        console.log('✅ Deleted Kent repertory');

        console.log('\n✅ Deletion completed successfully!');
        console.log('\n📤 Next steps:');
        console.log('   1. Go to your frontend application');
        console.log('   2. Navigate to Repertories tab');
        console.log('   3. Find "Kent" repertory');
        console.log('   4. Click "Choose File" and select your Kent Excel file');
        console.log('   5. Click "Upload Excel" to re-import with correct parser');
      } else {
        console.log('\n❌ Deletion cancelled');
      }

      rl.close();
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
  }
}

deleteKentRepertory();
