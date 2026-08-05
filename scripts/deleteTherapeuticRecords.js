const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Repertory = require('../models/Repertory');
const Rubric = require('../models/Rubric');

/**
 * Script to delete invalid/corrupted rubric records from remote MongoDB database
 * for Therapeutic Repertory (or any specified search query).
 * 
 * Usage:
 *   node scripts/deleteTherapeuticRecords.js              (Deletes rubrics for repertories matching "therap" or "therpau")
 *   node scripts/deleteTherapeuticRecords.js "Boericke"  (Deletes rubrics for repertories matching custom term)
 *   node scripts/deleteTherapeuticRecords.js --all-therap --delete-repertory (Deletes rubrics AND the repertory record)
 */

async function deleteTherapeuticRecords() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ ERROR: MONGO_URI is not defined in environment variables or server/.env file.');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const deleteRepertoryDoc = args.includes('--delete-repertory');
  const searchArg = args.find(a => !a.startsWith('--')) || 'therap';

  console.log(`🔌 Connecting to MongoDB Remote Database...`);

  try {
    await mongoose.connect(mongoUri, {
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`✅ Connected successfully to: ${mongoose.connection.host}`);

    // Search for repertories matching the keyword (e.g. "Therapeutic", "Therpau", etc.)
    const searchRegex = new RegExp(searchArg.replace(/[^a-zA-Z0-9]/g, '.*'), 'i');
    const matchingRepertories = await Repertory.find({
      $or: [
        { name: searchRegex },
        { nameHi: searchRegex },
        { description: searchRegex }
      ]
    });

    if (matchingRepertories.length === 0) {
      console.log(`\n⚠️  No repertories found matching query: "${searchArg}"`);
      console.log(`📋 Available repertories in database:`);
      const allReps = await Repertory.find({}, 'name type rubricCount');
      if (allReps.length === 0) {
        console.log(`   (Database contains no repertories)`);
      } else {
        allReps.forEach(r => {
          console.log(`   • ID: ${r._id} | Name: "${r.name}" | Type: ${r.type} | Rubrics: ${r.rubricCount}`);
        });
      }
      process.exit(0);
    }

    console.log(`\n🔍 Found ${matchingRepertories.length} matching repertories:`);
    for (const rep of matchingRepertories) {
      console.log(`   • ID: ${rep._id} | Name: "${rep.name}" | Current rubricCount: ${rep.rubricCount}`);
    }

    let totalDeletedRubrics = 0;

    for (const rep of matchingRepertories) {
      console.log(`\n🗑️  Processing repertory "${rep.name}" (${rep._id})...`);
      
      const countBefore = await Rubric.countDocuments({ repertoryId: rep._id });
      console.log(`   📊 Found ${countBefore} rubrics in database for this repertory.`);

      if (countBefore > 0) {
        const deleteResult = await Rubric.deleteMany({ repertoryId: rep._id });
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} rubrics from remote database.`);
        totalDeletedRubrics += deleteResult.deletedCount;
      } else {
        console.log(`   ℹ️ No rubrics to delete.`);
      }

      if (deleteRepertoryDoc) {
        await Repertory.findByIdAndDelete(rep._id);
        console.log(`   🗑️  Deleted Repertory document "${rep.name}" from database.`);
      } else {
        // Reset rubric count in Repertory metadata
        await Repertory.findByIdAndUpdate(rep._id, { rubricCount: 0 });
        console.log(`   🔄 Reset rubricCount to 0 for "${rep.name}".`);
      }
    }

    console.log(`\n==================================================`);
    console.log(`🎉 Operation completed successfully!`);
    console.log(`📊 Total rubrics deleted across all matched repertories: ${totalDeletedRubrics}`);
    console.log(`==================================================\n`);

  } catch (error) {
    console.error(`❌ Error during deletion script:`, error.message);
  } finally {
    await mongoose.disconnect();
    console.log(`🔌 Disconnected from MongoDB.`);
    process.exit(0);
  }
}

deleteTherapeuticRecords();
