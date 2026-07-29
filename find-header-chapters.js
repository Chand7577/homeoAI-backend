const mongoose = require('mongoose');
const Rubric = require('./models/Rubric');
const Repertory = require('./models/Repertory');
require('dotenv').config();

/**
 * Find chapters that look like headers in Mastersheet
 */
async function findHeaderChapters() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find Mastersheet repertory
    const mastersheet = await Repertory.findOne({ name: /mastersheet/i });
    
    if (!mastersheet) {
      console.log('❌ Mastersheet not found');
      process.exit(1);
    }

    console.log(`📋 Mastersheet ID: ${mastersheet._id}`);
    console.log(`📋 Mastersheet name: ${mastersheet.name}`);

    // Get all unique chapters from Mastersheet
    const chapters = await Rubric.distinct('chapter.en', { 
      repertoryId: mastersheet._id 
    });

    console.log(`\n📊 Found ${chapters.length} unique chapters in Mastersheet:\n`);
    
    chapters.forEach((chapter, i) => {
      console.log(`${i + 1}. "${chapter}"`);
    });

    // Find chapters that contain suspicious keywords
    const suspiciousKeywords = ['chapter', 'rubric', 'sub-rubric', 'symptom', 'condition', 'synonym', '——'];
    
    console.log('\n🔍 Searching for suspicious chapter names...\n');
    
    const suspicious = chapters.filter(ch => {
      const lower = ch.toLowerCase();
      return suspiciousKeywords.some(keyword => lower.includes(keyword));
    });

    if (suspicious.length > 0) {
      console.log('⚠️  Found suspicious chapter names:');
      suspicious.forEach(ch => {
        console.log(`   - "${ch}"`);
      });
      
      // Count rubrics in suspicious chapters
      for (const ch of suspicious) {
        const count = await Rubric.countDocuments({
          repertoryId: mastersheet._id,
          'chapter.en': ch
        });
        console.log(`     └─ ${count} rubrics`);
      }
    } else {
      console.log('✅ No suspicious chapter names found');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findHeaderChapters();
