const mongoose = require('mongoose');
const Repertory = require('./models/Repertory');
require('dotenv').config();

/**
 * Set Google Drive external URL for Boericke's Pocket Manual
 */
async function setBoerickeGoogleDrive() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find Boericke repertory (Reference type)
    const boericke = await Repertory.findOne({ 
      name: /boericke/i,
      type: 'Reference'
    });
    
    if (!boericke) {
      console.log('❌ Boericke Pocket Manual not found');
      console.log('\n📋 Available Reference books:');
      const refs = await Repertory.find({ type: 'Reference' });
      refs.forEach(r => console.log(`   - ${r.name} (ID: ${r._id})`));
      process.exit(1);
    }

    console.log(`📋 Found: ${boericke.name} (ID: ${boericke._id})`);
    console.log(`📊 Current PDF URL: ${boericke.pdfUrl || 'None'}`);

    // Google Drive link from user
    const googleDriveLink = 'https://drive.google.com/file/d/1HPgo_A0xpzze-GiIqH2CktiAHQmJdnaf/view?usp=sharing';
    
    // Extract file ID and convert to embedded preview link (not download)
    const fileIdMatch = googleDriveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      console.log('❌ Could not extract file ID from Google Drive link');
      process.exit(1);
    }
    
    const fileId = fileIdMatch[1];
    const directUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    
    console.log(`\n🔗 Original link: ${googleDriveLink}`);
    console.log(`🔗 Embedded preview URL: ${directUrl}`);

    // Update repertory
    boericke.pdfUrl = directUrl;
    boericke.cloudinaryPdfUrl = ''; // Clear Cloudinary URL
    boericke.pdfName = 'Boericke_Pocket_Manual.pdf';
    
    await boericke.save();

    console.log(`\n✅ Successfully set Google Drive URL for ${boericke.name}`);
    console.log(`📄 PDF Name: ${boericke.pdfName}`);
    console.log(`🔗 PDF URL: ${boericke.pdfUrl}`);
    console.log(`\n🎉 Done! The PDF will now load from Google Drive permanently.`);
    console.log(`🚀 No more re-uploading needed after server restarts!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setBoerickeGoogleDrive();
