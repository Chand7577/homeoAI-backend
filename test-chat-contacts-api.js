require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

async function testChatContactsAPI() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find the Core Team doctor
    const doctor = await User.findOne({ email: 'doctor@gmail.com' });
    if (!doctor) {
      console.log('❌ Doctor not found');
      process.exit(1);
    }

    console.log('🧑‍⚕️ Testing as:', doctor.name, '(' + doctor.role + ')');
    console.log('   Email:', doctor.email);
    console.log('   ID:', doctor._id);
    console.log('');

    // Simulate what the getChatContacts endpoint does
    let contacts = [];

    if (doctor.role === 'Patient') {
      console.log('📋 Fetching doctors for patient...');
      contacts = await User.find({
        role: { $in: ['Admin', 'Core Team', 'External Doctor'] },
        status: 'Approved',
        isActive: true
      }).select('-password').sort({ name: 1 });
    } else {
      console.log('📋 Fetching patients for doctor/admin...');
      contacts = await User.find({
        role: 'Patient',
        status: 'Approved',
        isActive: true
      }).select('-password').sort({ name: 1 });
    }

    console.log(`\n✅ Found ${contacts.length} contacts\n`);

    if (contacts.length === 0) {
      console.log('⚠️  NO CONTACTS FOUND!');
      console.log('\nChecking what patients exist in database:');
      const allPatients = await User.find({ role: 'Patient' }).select('-password');
      console.log(`   Total patients: ${allPatients.length}`);
      allPatients.forEach(p => {
        console.log(`   - ${p.name} (${p.email})`);
        console.log(`     Status: ${p.status}, Active: ${p.isActive}`);
      });
    } else {
      contacts.forEach((contact, idx) => {
        console.log(`${idx + 1}. ${contact.name} (${contact.email})`);
        console.log(`   Role: ${contact.role}`);
        console.log(`   Status: ${contact.status}`);
        console.log(`   Active: ${contact.isActive}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

testChatContactsAPI();
