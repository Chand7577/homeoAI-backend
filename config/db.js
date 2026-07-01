const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Connection pool settings for high concurrency
      maxPoolSize: 50, // Maximum number of connections (default: 100, but 50 is more efficient for most apps)
      minPoolSize: 10, // Minimum number of connections to keep open
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      serverSelectionTimeoutMS: 10000, // 10 seconds to select a server
      family: 4, // Use IPv4, skip trying IPv6 for faster connection
    });
    
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      console.log(`📊 Connection Pool: ${conn.connection.maxPoolSize} max, ${conn.connection.minPoolSize} min`);
    }
    
    // Run background migrations only if not already done
    const hasRun = await checkMigrationStatus();
    if (!hasRun.searchText) {
      setTimeout(migrateSearchText, 100);
    }
    if (!hasRun.messages) {
      setTimeout(seedMessages, 200);
    }
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Check if migrations have already run
const checkMigrationStatus = async () => {
  try {
    const Rubric = require('../models/Rubric');
    const Message = require('../models/Message');
    
    const [unmigratedRubrics, messageCount] = await Promise.all([
      Rubric.countDocuments({
        $or: [
          { searchText: "" },
          { searchText: null },
          { searchText: { $exists: false } }
        ]
      }),
      Message.countDocuments()
    ]);
    
    return {
      searchText: unmigratedRubrics === 0,
      messages: messageCount > 0
    };
  } catch (err) {
    return { searchText: false, messages: false };
  }
};

const migrateSearchText = async () => {
  const Rubric = require('../models/Rubric');
  try {
    const unmigrated = await Rubric.find({
      $or: [
        { searchText: "" },
        { searchText: null },
        { searchText: { $exists: false } }
      ]
    });
    
    if (unmigrated.length > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`🔧 Found ${unmigrated.length} rubrics without pre-computed search text. Migrating...`);
      let count = 0;
      for (const r of unmigrated) {
        const parts = [
          r.chapter?.en, r.chapter?.hi,
          r.rubric?.en, r.rubric?.hi,
          r.subrubric?.en, r.subrubric?.hi,
          ...(r.synonyms?.en || []),
          ...(r.synonyms?.hi || []),
          ...(r.modalities?.aggravation || []),
          ...(r.modalities?.amelioration || []),
        ].filter(Boolean);
        const st = parts.join(' ').toLowerCase();
        await Rubric.updateOne({ _id: r._id }, { $set: { searchText: st } });
        count++;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Successfully migrated ${count} rubrics search text!`);
      }
    }
  } catch (err) {
    console.error('❌ Rubric search text migration failed:', err.message);
  }
};

const seedMessages = async () => {
  const Message = require('../models/Message');
  try {
    const count = await Message.countDocuments();
    if (count === 0) {
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔧 Seeding chat messages in MongoDB...');
      }
      const dummyMessages = [
        // dr-jp & pat-amrit
        { senderId: 'dr-jp', receiverId: 'pat-amrit', roomId: 'dr-jp_pat-amrit', text: 'Hello Amrit. How is your headache today?', time: '09:30 AM' },
        { senderId: 'pat-amrit', receiverId: 'dr-jp', roomId: 'dr-jp_pat-amrit', text: 'It is much better now, doctor. But feeling slightly drowsy.', time: '09:35 AM' },
        { senderId: 'dr-jp', receiverId: 'pat-amrit', roomId: 'dr-jp_pat-amrit', text: 'That is expected with the first few doses of Nux Vomica. Reduce the dose to 2 drops once a day in the evening.', time: '09:38 AM' },
        // dr-rahul & pat-amrit
        { senderId: 'dr-rahul', receiverId: 'pat-amrit', roomId: 'dr-rahul_pat-amrit', text: 'Hello, please send your previous prescription.', time: 'Yesterday' },
        { senderId: 'pat-amrit', receiverId: 'dr-rahul', roomId: 'dr-rahul_pat-amrit', text: 'Sure, sending in a minute.', time: 'Yesterday' },
        // dr-priya & pat-amrit
        { senderId: 'dr-priya', receiverId: 'pat-amrit', roomId: 'dr-priya_pat-amrit', text: 'Please report symptoms after 3 days of Belladonna.', time: '3 days ago' },
        // dr-jp & pat-rahul
        { senderId: 'pat-rahul', receiverId: 'dr-jp', roomId: 'dr-jp_pat-rahul', text: 'Acidity is better now, thank you.', time: '10:15 AM' },
        { senderId: 'dr-jp', receiverId: 'pat-rahul', roomId: 'dr-jp_pat-rahul', text: 'Excellent! Continue Carbo Veg for another 2 days and then stop.', time: '10:20 AM' },
        // dr-jp & pat-priya
        { senderId: 'pat-priya', receiverId: 'dr-jp', roomId: 'dr-jp_pat-priya', text: 'Cough increased at night. High fever since evening.', time: 'Yesterday' },
        { senderId: 'dr-jp', receiverId: 'pat-priya', roomId: 'dr-jp_pat-priya', text: 'Give Aconite 30, 4 globules every 2 hours. Keep me updated.', time: 'Yesterday' },
        // dr-jp & pat-arav
        { senderId: 'pat-arav', receiverId: 'dr-jp', roomId: 'dr-jp_pat-arav', text: 'Sent reports of blood test.', time: '2 days ago' }
      ];
      await Message.insertMany(dummyMessages);
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Successfully seeded chat messages!');
      }
    }
  } catch (err) {
    console.error('❌ Chat message seeding failed:', err.message);
  }
};

module.exports = connectDB;
