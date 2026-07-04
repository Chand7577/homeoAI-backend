require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const User = require('./models/User');

async function testDistinctQuery() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get admin user ID
    const admin = await User.findOne({ email: 'admin@gmail.com' });
    if (!admin) {
      console.error('❌ Admin user not found');
      return;
    }
    console.log('👤 Testing with user:', admin.name, `(${admin._id})`);

    const currentUserId = admin._id.toString();
    console.log('\n🔍 Testing Message.distinct() query...');

    try {
      const allRooms = await Message.distinct('senderId', {
        $or: [
          { receiverId: currentUserId },
          { senderId: currentUserId }
        ]
      });
      
      console.log('✅ Query successful!');
      console.log('   Found sender IDs:', allRooms);
      console.log('   Count:', allRooms.length);
    } catch (err) {
      console.error('❌ Query failed:', err.message);
      console.error('   Error name:', err.name);
      console.error('   Stack:', err.stack);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testDistinctQuery();
