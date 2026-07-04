require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUsers() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    const allUsers = await User.find({}).select('-password');
    console.log(`📊 Total users in database: ${allUsers.length}\n`);

    // Group by role
    const roleGroups = {};
    allUsers.forEach(user => {
      const role = user.role || 'No Role';
      if (!roleGroups[role]) roleGroups[role] = [];
      roleGroups[role].push(user);
    });

    console.log('👥 Users by Role:');
    Object.keys(roleGroups).forEach(role => {
      console.log(`\n  ${role}: ${roleGroups[role].length} users`);
      roleGroups[role].forEach(user => {
        console.log(`    - ${user.name} (${user.email}) - Status: ${user.status}`);
      });
    });

    // Check for Patient role specifically
    const patients = allUsers.filter(u => u.role === 'Patient');
    console.log(`\n\n🔍 Users with role='Patient': ${patients.length}`);
    
    if (patients.length === 0) {
      console.log('\n⚠️  NO PATIENT USERS FOUND!');
      console.log('📋 Available roles in database:', Object.keys(roleGroups).join(', '));
      console.log('\n💡 Suggestion: Users need to register with role="Patient" to appear in chat contacts.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkUsers();
