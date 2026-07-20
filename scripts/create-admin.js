require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

const main = async () => {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_PHONE } = process.env;
  if (!MONGO_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME || !ADMIN_PHONE) {
    throw new Error('Set MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, and ADMIN_PHONE');
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  await mongoose.connect(MONGO_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) {
    throw new Error('A user with ADMIN_EMAIL already exists; use a password-reset workflow instead');
  }

  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    phone: ADMIN_PHONE.trim(),
    password: ADMIN_PASSWORD,
    role: 'Admin',
    status: 'Approved',
    isActive: true,
    emailVerified: true,
  });
  console.log(`Created secure admin account for ${email}`);
};

main()
  .catch(err => {
    console.error(`Admin creation failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
