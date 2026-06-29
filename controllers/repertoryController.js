const Repertory = require('../models/Repertory');
const Rubric = require('../models/Rubric');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseExcel } = require('../services/excelService');

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
  limits: { fileSize: 100 * 1024 * 1024 }
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

// POST /api/repertories/:id/upload  — Excel bulk import
const uploadExcel = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No Excel file uploaded'); }

  const { rubrics, errors, medicineHeaders } = parseExcel(req.file.buffer);

  if (rubrics.length === 0) {
    res.status(400);
    throw new Error('No valid rubric rows found. Check your Excel format. Errors: ' + errors.join('; '));
  }

  // Delete existing rubrics for this repertory before re-importing
  if (req.query.replace === 'true') {
    await Rubric.deleteMany({ repertoryId: repertory._id });
  }

  // Batch insert
  const docsToInsert = rubrics.map(r => ({ ...r, repertoryId: repertory._id }));
  await Rubric.insertMany(docsToInsert, { ordered: false });

  // Update rubric count
  const count = await Rubric.countDocuments({ repertoryId: repertory._id });
  await Repertory.findByIdAndUpdate(repertory._id, { rubricCount: count });

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
  res.json({ success: true, message: 'Repertory and its rubrics deleted' });
};

// POST /api/repertories/:id/upload-pdf
const uploadPDFFile = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No PDF file uploaded'); }

  const relativeUrl = `/uploads/${req.file.filename}`;
  repertory.pdfUrl = relativeUrl;
  repertory.pdfName = req.file.originalname;

  // Run LLM Chapter/Remedy index extraction
  let extractionSuccess = false;
  try {
    const { extractChaptersFromPdf } = require('../services/aiService');
    const mappings = await extractChaptersFromPdf(req.file.path, req.file.originalname);
    if (mappings && Object.keys(mappings).length > 0) {
      repertory.chapterPages = mappings;
      repertory.markModified('chapterPages');
      extractionSuccess = true;
      console.log(`✅ Extracted ${Object.keys(mappings).length} chapters/remedies from PDF`);
    }
  } catch (err) {
    console.error('⚠️ Could not extract chapters from PDF using Gemini:', err.message);
  }

  await repertory.save();

  res.json({
    success: true,
    message: extractionSuccess 
      ? 'PDF uploaded and chapters indexed successfully' 
      : 'PDF uploaded successfully (chapter indexing failed, please map manually)',
    data: {
      pdfUrl: relativeUrl,
      pdfName: req.file.originalname,
      chapterPages: repertory.chapterPages
    }
  });
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

module.exports = { 
  getRepertories, 
  getRepertory, 
  createRepertory, 
  uploadExcel, 
  deleteRepertory, 
  upload, 
  uploadPDF, 
  uploadPDFFile, 
  updateChapterPages 
};
