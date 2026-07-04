require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const User = require('./models/User');

async function testFullContactsLogic() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get admin user
    const currentUser = await User.findOne({ email: 'admin@gmail.com' }).select('role');
    if (!currentUser) {
      console.error('❌ Admin user not found');
      return;
    }
    
    const currentUserId = currentUser._id.toString();
    console.log('👤 Current user:', currentUser.role, `(${currentUserId})\n`);

    let contacts = [];

    if (currentUser.role === 'Patient') {
      console.log('📋 Fetching doctors for patient...');
      contacts = await User.find({
        role: { $in: ['Admin', 'Core Team', 'External Doctor'] },
        status: 'Approved',
        isActive: true
      }).select('-password').sort({ name: 1 });
    } else {
      console.log('📋 Fetching patients for doctor/admin...\n');
      
      // 1. All Patient users in the system
      console.log('Step 1: Finding Patient users...');
      const patientUsers = await User.find({
        role: 'Patient',
        isActive: true
      }).select('-password').sort({ name: 1 });
      console.log(`   Found ${patientUsers.length} Patient users in User collection`);

      // 2. Find patients who have chatted
      console.log('\nStep 2: Finding sender IDs from messages...');
      const allRooms = await Message.distinct('senderId', {
        $or: [
          { receiverId: currentUserId },
          { senderId: currentUserId }
        ]
      });
      console.log(`   Found ${allRooms.length} unique sender IDs:`, allRooms);

      // Collect IDs of patients already in our list
      const patientIds = new Set(patientUsers.map(u => u._id.toString()));
      console.log('\n   Patient IDs already in list:', Array.from(patientIds));

      // Find any senders who are not already in our contacts
      const missingIds = allRooms.filter(id => id !== currentUserId && !patientIds.has(id));
      console.log('\n   Missing sender IDs:', missingIds);

      let extraContacts = [];
      if (missingIds.length > 0) {
        console.log('\nStep 3: Looking up missing IDs in User collection...');
        try {
          extraContacts = await User.find({
            _id: { $in: missingIds },
            role: 'Patient'
          }).select('-password');
          console.log(`   Found ${extraContacts.length} additional contacts`);
        } catch (err) {
          console.error('   ❌ Error looking up missing IDs:', err.message);
          console.error('   This might be because some IDs are not valid ObjectIds');
        }
      }

      // Merge and deduplicate
      console.log('\nStep 4: Merging contacts...');
      const mergedMap = new Map();
      [...patientUsers, ...extraContacts].forEach(u => mergedMap.set(u._id.toString(), u));
      contacts = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`   Total unique contacts: ${contacts.length}`);
    }

    // Attach last message info for each contact
    console.log('\nStep 5: Attaching last message info...');
    const contactsWithLastMsg = await Promise.all(contacts.map(async (contact) => {
      const roomId1 = [currentUserId, contact._id.toString()].sort().join('_');
      const lastMsg = await Message.findOne({ roomId: roomId1 }).sort({ createdAt: -1 }).select('text time createdAt attachmentName attachmentType');
      
      // Convert Mongoose document to plain object safely
      const contactObj = contact.toObject ? contact.toObject() : contact;
      
      return {
        ...contactObj,
        lastMessage: lastMsg ? (lastMsg.text || (lastMsg.attachmentName ? '📎 Attachment' : '')) : null,
        lastMessageTime: lastMsg ? lastMsg.createdAt : null
      };
    }));

    console.log('   ✅ Successfully attached last message info to all contacts');

    // Sort by last message time (most recent first), then alphabetically
    contactsWithLastMsg.sort((a, b) => {
      if (a.lastMessageTime && b.lastMessageTime) {
        return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
      }
      if (a.lastMessageTime) return -1;
      if (b.lastMessageTime) return 1;
      return a.name.localeCompare(b.name);
    });

    console.log('\n📋 Final contacts list:');
    contactsWithLastMsg.forEach((contact, idx) => {
      console.log(`   ${idx + 1}. ${contact.name} (${contact.email})`);
      if (contact.lastMessage) {
        console.log(`      Last: "${contact.lastMessage}" at ${new Date(contact.lastMessageTime).toLocaleString()}`);
      }
    });

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testFullContactsLogic();
