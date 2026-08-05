/**
 * Migration Script: Add patientId and doctorId to existing prescriptions
 * 
 * This script updates old prescriptions to include:
 * - patientId: by matching patientName to registered Patient users
 * - doctorId: by matching doctorName to registered Doctor users
 * 
 * Run with: node scripts/migratePrescriptionPatientIds.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Prescription = require('../models/Prescription');
const User = require('../models/User');

// Use MONGO_URI from .env (remote MongoDB Atlas)
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

console.log('🔗 Using MongoDB URI:', MONGO_URI.replace(/:[^:@]+@/, ':****@')); // Hide password in logs

async function migratePrescriptions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all prescriptions without patientId or doctorId
    const prescriptionsToUpdate = await Prescription.find({
      $or: [
        { patientId: { $exists: false } },
        { patientId: null },
        { doctorId: { $exists: false } },
        { doctorId: null }
      ]
    });

    console.log(`📋 Found ${prescriptionsToUpdate.length} prescriptions to update\n`);

    if (prescriptionsToUpdate.length === 0) {
      console.log('✅ All prescriptions already have patientId and doctorId');
      process.exit(0);
    }

    // Get all registered users for matching
    const allPatients = await User.find({ role: 'Patient', status: 'Approved' }).select('_id name');
    const allDoctors = await User.find({ role: { $in: ['Core Team', 'External Doctor', 'Admin'] } }).select('_id name');

    console.log(`👥 Found ${allPatients.length} registered patients`);
    console.log(`👨‍⚕️ Found ${allDoctors.length} doctors\n`);

    let updated = 0;
    let patientMatched = 0;
    let doctorMatched = 0;
    let notMatched = 0;

    for (const prescription of prescriptionsToUpdate) {
      let needsUpdate = false;
      const updates = {};

      // Match patient by name (case-insensitive, trimmed)
      if (!prescription.patientId && prescription.patientName) {
        const matchedPatient = allPatients.find(p => 
          p.name.toLowerCase().trim() === prescription.patientName.toLowerCase().trim()
        );
        
        if (matchedPatient) {
          updates.patientId = matchedPatient._id;
          needsUpdate = true;
          patientMatched++;
          console.log(`✅ Matched patient: "${prescription.patientName}" → ${matchedPatient._id}`);
        } else {
          console.log(`⚠️  No match for patient: "${prescription.patientName}"`);
        }
      }

      // Match doctor by name (case-insensitive, trimmed)
      if (!prescription.doctorId && prescription.doctorName) {
        const matchedDoctor = allDoctors.find(d => 
          d.name.toLowerCase().trim() === prescription.doctorName.toLowerCase().trim()
        );
        
        if (matchedDoctor) {
          updates.doctorId = matchedDoctor._id;
          needsUpdate = true;
          doctorMatched++;
          console.log(`✅ Matched doctor: "${prescription.doctorName}" → ${matchedDoctor._id}`);
        } else {
          console.log(`⚠️  No match for doctor: "${prescription.doctorName}"`);
        }
      }

      // Update prescription if we found matches
      if (needsUpdate) {
        await Prescription.findByIdAndUpdate(prescription._id, updates);
        updated++;
      } else {
        notMatched++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total prescriptions processed: ${prescriptionsToUpdate.length}`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`   - Patient IDs matched: ${patientMatched}`);
    console.log(`   - Doctor IDs matched: ${doctorMatched}`);
    console.log(`⚠️  Not matched: ${notMatched}`);
    console.log('='.repeat(60) + '\n');

    if (notMatched > 0) {
      console.log('ℹ️  Prescriptions without matches:');
      console.log('   - These patients/doctors may not be registered users');
      console.log('   - In-app chat sharing will not work for these prescriptions');
      console.log('   - WhatsApp sharing will still work\n');
    }

    console.log('✅ Migration complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migratePrescriptions();
