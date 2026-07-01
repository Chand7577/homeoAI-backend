const mongoose = require('mongoose');

const RepertorySchema = new mongoose.Schema({
  name: { type: String, required: true },        // e.g. "Kent's Repertory"
  nameHi: { type: String, default: '' },          // e.g. "केंट की रेपरटॉरी"
  author: { type: String, default: '' },
  description: { type: String, default: '' },
  rubricCount: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  
  // Legacy local storage (deprecated)
  pdfUrl: { type: String, default: '' },         // path to the PDF on server
  pdfName: { type: String, default: '' },        // original uploaded filename
  
  // Cloudinary storage (new)
  cloudinaryPdfUrl: { type: String, default: '' },     // Cloudinary secure URL
  cloudinaryPdfPublicId: { type: String, default: '' }, // Cloudinary public ID for deletion
  cloudinaryExcelUrl: { type: String, default: '' },    // Excel file URL (optional)
  cloudinaryExcelPublicId: { type: String, default: '' }, // Excel public ID
  
  chapterPages: { type: Map, of: Number, default: {} }, // map of chapter -> page number
  type: { type: String, enum: ['Repertory', 'Reference'], default: 'Repertory' }, // separates analysis data from reading material
}, { timestamps: true });

module.exports = mongoose.model('Repertory', RepertorySchema);
