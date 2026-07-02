
const mongoose = require('mongoose');
const Repertory = require('../models/Repertory');
const Rubric = require('../models/Rubric');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseExcel } = require('../services/excelService');

// Global in-memory cache for chapters aggregation: Map<repertoryId, Array<chapters>>
const chapterCache = new Map();

// Multer: store in memory for processing (Excel files)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Multer: store in disk for serving (large PDF files up to 100MB)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const uploadPDF = multer({
  storage: diskStorage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// GET /api/repertories
const getRepertories = async (req, res) => {
  const filter = { isActive: true };
  if (req.query.type) {
    if (req.query.type === 'Repertory') {
      filter.$or = [ { type: 'Repertory' }, { type: { $exists: false } } ];
    } else {
      filter.type = req.query.type;
    }
  }
  
  const repertories = await Repertory.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: repertories });
};

// GET /api/repertories/:id
const getRepertory = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  res.json({ success: true, data: repertory });
};

// POST /api/repertories
const createRepertory = async (req, res) => {
  const { name, nameHi, author, description, type } = req.body;
  if (!name) { res.status(400); throw new Error('Repertory name is required'); }
  const repertory = await Repertory.create({ name, nameHi, author, description, type: type || 'Repertory' });
  res.status(201).json({ success: true, data: repertory });
};

// POST /api/repertories/:id/upload  — Excel bulk import (OPTIMIZED)
const uploadExcel = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No Excel file uploaded'); }

  // Parse Excel with optimizations
  const { rubrics, errors, medicineHeaders } = parseExcel(req.file.buffer);

  if (rubrics.length === 0) {
    res.status(400);
    throw new Error('No valid rubric rows found. Check your Excel format. Errors: ' + errors.join('; '));
  }

  // Delete existing rubrics for this repertory if replace mode
  if (req.query.replace === 'true') {
    // Use deleteMany with lean for better performance
    await Rubric.deleteMany({ repertoryId: repertory._id }).lean();
  }

  // Batch insert with optimizations
  const docsToInsert = rubrics.map(r => ({ ...r, repertoryId: repertory._id }));
  
  // Insert in chunks for better memory management (1000 at a time)
  const chunkSize = 1000;
  for (let i = 0; i < docsToInsert.length; i += chunkSize) {
    const chunk = docsToInsert.slice(i, i + chunkSize);
    await Rubric.insertMany(chunk, { 
      ordered: false,
      lean: true, // Skip instantiation for better performance
      rawResult: true // Get raw result without hydration
    });
  }

  // Update rubric count
  const count = await Rubric.countDocuments({ repertoryId: repertory._id });
  await Repertory.findByIdAndUpdate(repertory._id, { rubricCount: count }, { new: false });

  // Invalidate chapters cache
  chapterCache.delete(repertory._id.toString());

  res.json({
    success: true,
    message: `Imported ${rubrics.length} rubrics successfully`,
    rubricCount: rubrics.length,
    medicinesDetected: medicineHeaders,
    skippedRows: errors.length,
    errors: errors.slice(0, 20), // Return first 20 errors only
  });
};

// DELETE /api/repertories/:id
const deleteRepertory = async (req, res) => {
  await Repertory.findByIdAndDelete(req.params.id);
  await Rubric.deleteMany({ repertoryId: req.params.id });
  
  // Invalidate chapters cache
  chapterCache.delete(req.params.id);
  
  res.json({ success: true, message: 'Repertory and its rubrics deleted' });
};

// POST /api/repertories/:id/upload-pdf
const uploadPDFFile = async (req, res) => {
  const { uploadPDFToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
  
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No PDF file uploaded'); }

  try {
    // Upload to Cloudinary with optimizations
    const uploadResult = await uploadPDFToCloudinary(req.file.path, req.file.originalname);
    
    // Delete old Cloudinary file if exists
    if (repertory.cloudinaryPdfPublicId) {
      await deleteFromCloudinary(repertory.cloudinaryPdfPublicId);
    }
    
    // Update repertory with Cloudinary URLs
    repertory.cloudinaryPdfUrl = uploadResult.url;
    repertory.cloudinaryPdfPublicId = uploadResult.publicId;
    repertory.pdfName = req.file.originalname;
    
    // Legacy field for backward compatibility
    repertory.pdfUrl = uploadResult.url;

    // Run LLM Chapter/Remedy index extraction
    let extractionSuccess = false;
    try {
      // Note: For Cloudinary files, we'd need to download temporarily for AI processing
      // For now, we'll skip AI extraction if using Cloudinary
      // You can implement temporary download if needed
      console.log('⚠️ Chapter extraction from Cloudinary PDFs not yet implemented');
    } catch (err) {
      console.error('⚠️ Could not extract chapters from PDF using Gemini:', err.message);
    }

    await repertory.save();

    res.json({
      success: true,
      message: 'PDF uploaded to Cloudinary successfully',
      data: {
        pdfUrl: uploadResult.url,
        pdfPublicId: uploadResult.publicId,
        pdfName: req.file.originalname,
        bytes: uploadResult.bytes,
        chapterPages: repertory.chapterPages
      }
    });
  } catch (error) {
    // Clean up local file if it still exists
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
};

// PUT /api/repertories/:id/chapter-pages
const updateChapterPages = async (req, res) => {
  const { chapterPages } = req.body;
  if (!chapterPages) { res.status(400); throw new Error('chapterPages mapping is required'); }

  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }

  repertory.chapterPages = chapterPages;
  repertory.markModified('chapterPages');
  await repertory.save();

  res.json({
    success: true,
    message: 'Chapter page mappings updated successfully',
    data: repertory
  });
};

// GET /api/repertories/:id/chapters
const getRepertoryChapters = async (req, res) => {
  const repId = req.params.id;
  
  // Check if chapters are cached
  if (chapterCache.has(repId)) {
    return res.json({ success: true, data: chapterCache.get(repId) });
  }

  const repertory = await Repertory.findById(repId);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }

  const chapters = await Rubric.aggregate([
    { $match: { repertoryId: new mongoose.Types.ObjectId(repId) } },
    {
      $group: {
        _id: "$chapter.en",
        chapterEn: { $first: "$chapter.en" },
        chapterHi: { $first: "$chapter.hi" },
        rubricCount: { $sum: 1 }
      }
    },
    { $sort: { chapterEn: 1 } }
  ]);

  // Store in cache
  chapterCache.set(repId, chapters);

  res.json({ success: true, data: chapters });
};

module.exports = { 
  getRepertories, 
  getRepertory, 
  createRepertory, 
  uploadExcel, 
  deleteRepertory, 
  upload, 
  uploadPDF, 
  uploadPDFFile, 
  updateChapterPages,
  getRepertoryChapters
};
