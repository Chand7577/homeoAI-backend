require('dotenv').config();
const mongoose = require('mongoose');

const fix = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('users');

  const indexes = await collection.indexes();
  console.log('Current indexes:', indexes.map(i => i.name));

  // Drop the stale username_1 index if it exists
  const staleIndex = indexes.find(i => i.name === 'username_1');
  if (staleIndex) {
    await collection.dropIndex('username_1');
    console.log('✅ Dropped stale index: username_1');
  } else {
    console.log('ℹ️  No stale username_1 index found');
  }

  const remaining = await collection.indexes();
  console.log('Remaining indexes:', remaining.map(i => i.name));
  process.exit(0);
};

fix().catch(err => { console.error('Error:', err); process.exit(1); });
