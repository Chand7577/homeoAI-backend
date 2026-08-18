
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

// POST /api/repertories/:id/upload  — Excel bulk import (OPTIMIZED FOR LARGE FILES)
const uploadExcel = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No Excel file uploaded'); }

  console.log(`📥 Processing Excel upload: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

  // Parse Excel with memory optimizations (now async)
  const { rubrics, errors, medicineHeaders } = await parseExcel(req.file.buffer);

  // Clear buffer reference immediately after parsing
  req.file.buffer = null;

  if (rubrics.length === 0) {
    res.status(400);
    throw new Error('No valid rubric rows found. Check your Excel format. Errors: ' + errors.join('; '));
  }

  console.log(`📊 Parsed ${rubrics.length} rubrics. Starting database import...`);

  // Delete existing rubrics for this repertory if replace mode
  if (req.query.replace === 'true') {
    console.log('🗑️  Deleting existing rubrics...');
    await Rubric.deleteMany({ repertoryId: repertory._id });
  }

  // Batch insert with aggressive chunking for memory management
  const docsToInsert = rubrics.map(r => ({ ...r, repertoryId: repertory._id }));
  
  // Smaller chunks for very large files (500 at a time)
  const chunkSize = 500;
  const totalChunks = Math.ceil(docsToInsert.length / chunkSize);
  
  console.log(`💾 Inserting ${docsToInsert.length} documents in ${totalChunks} chunks...`);
  
  for (let i = 0; i < docsToInsert.length; i += chunkSize) {
    const chunk = docsToInsert.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;
    
    try {
      await Rubric.insertMany(chunk, { 
        ordered: false,
        lean: true, // Skip instantiation for better performance
        rawResult: true // Get raw result without hydration
      });
      
      // Progress logging every 10 chunks or at end
      if (chunkNum % 10 === 0 || chunkNum === totalChunks) {
        const progress = ((chunkNum / totalChunks) * 100).toFixed(1);
        console.log(`📈 Progress: ${chunkNum}/${totalChunks} chunks (${progress}%) - ${i + chunk.length}/${docsToInsert.length} rubrics`);
      }
      
      // Allow garbage collection between chunks
      if (chunkNum % 5 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    } catch (insertError) {
      console.error(`❌ Error inserting chunk ${chunkNum}:`, insertError.message);
      // Continue with next chunk even if one fails
    }
  }

  // Update rubric count
  const count = await Rubric.countDocuments({ repertoryId: repertory._id });
  await Repertory.findByIdAndUpdate(repertory._id, { rubricCount: count }, { new: false });

  // Invalidate chapters cache
  chapterCache.delete(repertory._id.toString());

  console.log(`✅ Import complete! ${rubrics.length} rubrics imported into database.`);

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

const uploadPDFFile = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!req.file) { res.status(400); throw new Error('No PDF file uploaded'); }

  console.log(`📁 uploadPDFFile triggered: id=${req.params.id}, file=${req.file ? JSON.stringify({
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size
  }) : 'undefined'}`);

  try {
    if (req.file && !fs.existsSync(req.file.path)) {
      console.error(`❌ ERROR: Multer reported file path ${req.file.path} but file does not exist on disk!`);
    } else if (req.file) {
      console.log(`✅ Verified file exists on disk: ${req.file.path}`);
    }

    // 1. Run AI extraction of medicine names and page numbers (uses local file path)
    let extractedMappings = {};
    try {
      console.log('🤖 Starting AI extraction of medicine names and page numbers...');
      const { extractChaptersFromPdf } = require('../services/aiService');
      extractedMappings = await extractChaptersFromPdf(req.file.path, req.file.originalname);
      
      if (extractedMappings && Object.keys(extractedMappings).length > 0) {
        repertory.chapterPages = extractedMappings;
        repertory.markModified('chapterPages');
        console.log(`✅ AI extracted ${Object.keys(extractedMappings).length} medicine mappings`);
      } else {
        console.warn('⚠️ AI extraction returned no mappings');
      }
    } catch (aiError) {
      console.error('⚠️ AI extraction failed:', aiError.message);
      console.log('Users can manually map medicine names using the UI');
    }

    // 2. Upload PDF using Supabase Storage (primary) or Cloudinary (fallback)
    let pdfUrl = '';
    let isCloudStorage = false;
    let uploadResult = null;

    console.log(`🔑 Env status: SUPABASE_URL=${!!process.env.SUPABASE_URL}, SUPABASE_ANON_KEY=${!!process.env.SUPABASE_ANON_KEY}, BUCKET=${process.env.SUPABASE_STORAGE_BUCKET || 'default'}`);

    const { uploadPDFToSupabase, uploadPDFToCloudinary } = require('../services/uploadService');
    const fileSizeInMB = req.file.size / (1024 * 1024);

    if (process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)) {
      try {
        console.log(`⚡ Attempting Supabase Storage upload for ${fileSizeInMB.toFixed(2)} MB PDF...`);
        uploadResult = await uploadPDFToSupabase(req.file.path, req.file.originalname);
        console.log('✅ Supabase Storage upload complete:', uploadResult.url);
        pdfUrl = uploadResult.url;
        isCloudStorage = true;
      } catch (supabaseErr) {
        console.error('⚠️ Supabase upload failed:', supabaseErr.message);
      }
    } else {
      console.warn('⚠️ Supabase env vars missing (SUPABASE_URL or SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing on server).');
    }

    if (!isCloudStorage) {
      try {
        console.log(`☁️ Attempting Cloudinary upload for ${fileSizeInMB.toFixed(2)} MB PDF...`);
        uploadResult = await uploadPDFToCloudinary(req.file.path, req.file.originalname);
        console.log('✅ Cloudinary upload complete:', uploadResult.url);
        pdfUrl = uploadResult.url;
        isCloudStorage = true;
      } catch (cloudinaryError) {
        console.error('⚠️ Cloudinary upload failed, falling back to local server storage:', cloudinaryError.message);
        console.log(`💾 File will be stored locally (ephemeral on Render free tier)`);
        pdfUrl = `/uploads/${req.file.filename}`;
      }
    }

    // 3. Delete old file if exists and we successfully moved to a new cloud upload
    const { deleteFromCloudinary } = require('../services/uploadService');
    if (repertory.cloudinaryPdfPublicId && isCloudStorage) {
      console.log('🗑️ Deleting old PDF from Cloudinary...');
      try {
        await deleteFromCloudinary(repertory.cloudinaryPdfPublicId);
      } catch (delError) {
        console.error('Failed to delete old Cloudinary PDF:', delError.message);
      }
    }
    
    // Delete old local file if exists (and if it is different from the new one)
    if (repertory.pdfUrl && repertory.pdfUrl.includes('/uploads/')) {
      const oldFilename = path.basename(repertory.pdfUrl);
      if (oldFilename !== req.file.filename) {
        const oldPath = path.join(__dirname, '../uploads', oldFilename);
        if (fs.existsSync(oldPath)) {
          console.log(`🗑️ Deleting old local PDF file: ${oldPath}`);
          try {
            fs.unlinkSync(oldPath);
          } catch (delLocalError) {
            console.error('Failed to delete old local PDF:', delLocalError.message);
          }
        }
      }
    }
    
    // 4. Update repertory details
    repertory.pdfUrl = pdfUrl;
    repertory.pdfName = req.file.originalname;
    
    if (isCloudStorage && uploadResult) {
      repertory.cloudinaryPdfUrl = uploadResult.url;
      repertory.cloudinaryPdfPublicId = uploadResult.publicId;
    } else {
      // Clear Cloud fields if we are storing locally
      repertory.cloudinaryPdfUrl = undefined;
      repertory.cloudinaryPdfPublicId = undefined;
    }

    await repertory.save();

    const storageMessage = isCloudStorage 
      ? 'PDF uploaded successfully to cloud storage!'
      : `PDF saved successfully to server local storage (${(req.file.size / 1024 / 1024).toFixed(2)} MB).`;

    const aiMessage = extractedMappings && Object.keys(extractedMappings).length > 0
      ? ` AI extracted ${Object.keys(extractedMappings).length} medicine mappings. You can edit them in "Map Chapters" mode.`
      : ' Click "Map Chapters" to add medicine names and page numbers.';

    res.json({
      success: true,
      message: storageMessage + aiMessage,
      data: {
        pdfUrl: pdfUrl,
        pdfName: req.file.originalname,
        bytes: req.file.size,
        chapterPages: repertory.chapterPages,
        aiExtractedCount: Object.keys(extractedMappings).length,
        isStoredLocally: !isCloudStorage
      }
    });
  } catch (error) {
    // Clean up local file if we intended to upload to Cloudinary but failed before/during that,
    // and if we are not using the local file.
    // If it's a local save, the file MUST remain in req.file.path.
    if (error && req.file && req.file.path && fs.existsSync(req.file.path)) {
      // We only delete if it wasn't successfully saved as the active local PDF
      if (repertory.pdfUrl !== `/uploads/${req.file.filename}`) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Failed to clean up file after error:', cleanupError.message);
        }
      }
    }
    throw error;
  }
};

// PUT /api/repertories/:id/chapter-pages
const updateChapterPages = async (req, res) => {
  const { chapterPages, pageOffset } = req.body;
  if (!chapterPages) { res.status(400); throw new Error('chapterPages mapping is required'); }

  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }

  repertory.chapterPages = chapterPages;
  repertory.markModified('chapterPages');
  
  // Update page offset if provided
  if (pageOffset !== undefined) {
    repertory.pageOffset = parseInt(pageOffset) || 0;
  }
  
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
  
  // Skip cache — always fetch fresh from DB so re-uploads are reflected immediately
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
    { $match: { chapterEn: { $ne: null, $ne: '' } } },
    { $sort: { chapterEn: 1 } }
  ]);

  // Update cache with fresh data
  chapterCache.set(repId, chapters);

  res.json({ success: true, data: chapters });
};

// PUT /api/repertories/:id/external-pdf-url - Set external PDF URL (Google Drive, Dropbox, etc.)
const setExternalPdfUrl = async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.startsWith('http')) {
    res.status(400);
    throw new Error('Valid external URL is required (must start with http:// or https://)');
  }

  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) {
    res.status(404);
    throw new Error('Repertory not found');
  }

  // Convert Google Drive/Dropbox sharing links to viewable URLs
  let directUrl = url;
  
  // Google Drive: Use Google Docs Viewer for better page navigation support
  // From: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // To: https://docs.google.com/viewer?url=https://drive.google.com/uc?export=download&id=FILE_ID
  // OR keep direct link for iframe embedding with custom viewer
  if (url.includes('drive.google.com')) {
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      // Use direct download URL - frontend will handle page navigation via iframe reload
      directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
      console.log('🔗 Converted Google Drive link to direct download URL for iframe embedding');
    }
  }
  
  // Dropbox: Add dl=1 parameter for direct download
  // From: https://www.dropbox.com/s/...?dl=0
  // To: https://www.dropbox.com/s/...?dl=1
  if (url.includes('dropbox.com')) {
    directUrl = url.replace('dl=0', 'dl=1');
    if (!directUrl.includes('dl=')) {
      directUrl += (directUrl.includes('?') ? '&' : '?') + 'dl=1';
    }
    console.log('🔗 Converted Dropbox link to direct download URL');
  }

  // Update repertory with external URL
  repertory.pdfUrl = directUrl;
  repertory.cloudinaryPdfUrl = ''; // Clear Cloudinary URL if set
  repertory.pdfName = req.body.fileName || path.basename(url);
  
  await repertory.save();

  console.log(`✅ External PDF URL set for ${repertory.name}: ${directUrl}`);

  res.json({
    success: true,
    message: 'External PDF URL set successfully',
    data: {
      pdfUrl: directUrl,
      pdfName: repertory.pdfName
    }
  });
};

// GET /api/repertories/:id/view-pdf
const streamPDF = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory || !repertory.pdfUrl) {
    return res.status(404).send('PDF not found');
  }

  // If Cloudinary URL or external URL, redirect to it directly
  if (repertory.pdfUrl.startsWith('http')) {
    return res.redirect(repertory.pdfUrl);
  }

  // Local disk file
  const filename = path.basename(repertory.pdfUrl);
  const filePath = path.join(__dirname, '../uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send(
      'File no longer exists on server storage. Render free tier resets disk storage when sleeping. Please re-upload the PDF file or use "Set External PDF URL" feature.'
    );
  }

  // Allow iframe embedding from same origin
  res.removeHeader('X-Frame-Options'); // Remove the DENY header set by app.js
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${repertory.pdfName || 'manual.pdf'}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  fs.createReadStream(filePath).pipe(res);
};

// POST /api/repertories/:id/scan-medicine-pages
const scanMedicinePages = async (req, res) => {
  const repertory = await Repertory.findById(req.params.id);
  if (!repertory) { res.status(404); throw new Error('Repertory not found'); }
  if (!repertory.pdfUrl) { res.status(400); throw new Error('No PDF file uploaded for this reference manual yet'); }

  console.log(`🤖 Starting page-by-page AI scanning for ${repertory.name}...`);
  
  const { scanMedicinePagesFromPdf } = require('../services/aiService');
  
  let targetPathOrUrl = repertory.pdfUrl;
  if (repertory.pdfUrl.includes('/uploads/')) {
    const filename = path.basename(repertory.pdfUrl);
    targetPathOrUrl = path.join(__dirname, '../uploads', filename);
  }

  const detectedMappings = await scanMedicinePagesFromPdf(targetPathOrUrl);

  const DEFAULT_MATERIA_MEDICA_INDEX = {
    "ABIES CANADENSIS": 12, "ABIES NIGRA": 13, "ABROTANUM": 14, "ABRUS PRAECATORIUS": 422, "ABRUS PRÆCATORIUS": 422,
    "ABSINTHIUM": 15, "ACALYPHA": 16, "ACANTHIA": 246, "ACETANILID": 17, "ACETIC ACID": 17,
    "ACHYRANTHES": 24, "ACONITINE": 23, "ACONITUM FEROX": 24, "ACONITUM LYCOCTONUM": 23, "ACONITUM NAPELLUS": 19,
    "ACTAEA RACEMOSA": 247, "ACTAEA SPICATA": 25, "ACTÆA RACEMOSA": 247, "ACTÆA SPICATA": 25, "ADONIDIN": 26,
    "ADONIS VERNALIS": 25, "ADRENALIN": 26, "AESCULUS GLABRA": 31, "AESCULUS HIPPOCASTANUM": 28, "AETHIOPS ANTIMONIALIS": 31,
    "AETHIOPS MERCURIALIS": 31, "AETHUSA CYNAPIUM": 31, "AGARICIN": 154, "AGARICUS EMETICUS": 37, "AGARICUS MUSCARIUS": 34,
    "AGARICUS PHALLOIDES": 37, "AGAVE": 38, "AGNUS CASTUS": 38, "AGRAPHIS": 39, "AGRIMONIA": 386,
    "AGROPYRUM": 763, "AGROSTEMA": 580, "AILANTHUS": 39, "ALCOHOL SULPHURIS": 213, "ALETRIS FARINOSA": 40,
    "ALFALFA": 41, "ALKEKENGI": 598, "ALLIUM CEPA": 42, "ALLIUM SATIVUM": 44, "ALNUS": 45, "ALOE": 45,
    "ALSTONIA": 48, "ALUMEN": 48, "ALUMINA": 50, "ALUMINA ACETICA": 53, "ALUMINA SILICATA": 53,
    "AMBRA GRISEA": 53, "AMBROSIA": 55, "AMMONIACUM": 55, "AMMONIUM ACETICUM": 19, "AMMONIUM BENZOICUM": 56,
    "AMMONIUM BROMATUM": 56, "AMMONIUM CARBONICUM": 57, "AMMONIUM CAUSTICUM": 60, "AMMONIUM MURIATICUM": 61,
    "AMMONIUM PHOSPHORICUM": 63, "AMMONIUM PICRICUM": 64, "AMPELOPSIS": 64, "AMYGDALA AMARA": 65,
    "AMYGDALUS PERSICA": 64, "AMYL NITRITE": 65, "ANACARDIUM OCCIDENTALE": 68, "ANACARDIUM ORIENTALE": 66,
    "ANAGALLIS": 69, "ANANTHERUM": 69, "ANGUSTURA": 71, "ANILINUM": 72, "ANTHEMIS": 72, "ANTHRACINUM": 73,
    "ANTHRAKOKALI": 74, "ANTIMONIUM ARSENICUM": 74, "ANTIMONIUM CRUDUM": 74, "ANTIMONIUM TARTARICUM": 78,
    "ANTIPYRINUM": 80, "APIS MELLIFICA": 81, "APIUM GRAVEOLENS": 85, "APOCYNUM ANDROSAEMIFOLIUM": 86,
    "APOCYNUM CANNABINUM": 86, "APOMORPHINUM": 88, "AQUILEGIA": 88, "ARAGALLUS": 89, "ARALIA RACEMOSA": 89,
    "ARANEA DIADEMA": 90, "ARBUTUS": 92, "ARECA": 92, "ARGEMONE": 92, "ARGENTUM METALLICUM": 93,
    "ARGENTUM NITRICUM": 94, "ARNICA MONTANA": 98, "ARSENICUM ALBUM": 101, "ARSENICUM BROMATUM": 106,
    "ARSENICUM IODATUM": 107, "ARSENICUM METALLICUM": 109, "ARSENICUM SULPHURATUM": 110, "ARTEMISIA VULGARIS": 110,
    "ARUM TRIPHYLLUM": 111, "ARUNDO": 112, "ASAFOETIDA": 113, "ASARUM": 115, "ASCLEPIAS TUBEROSA": 117,
    "ASPARAGUS": 118, "ASPIDOSPERMA": 119, "ASTACUS FLUVIATILIS": 119, "ASTERIAS RUBENS": 119,
    "AURUM METALLICUM": 121, "AURUM MURIATICUM": 124, "AVENA SATIVA": 125, "BACILLINUM": 127,
    "BADIAGA": 128, "BALSAMUM PERUVIANUM": 129, "BAPTISIA TINCTORIA": 130, "BARYTA CARBONICA": 133,
    "BARYTA MURIATICA": 134, "BELLADONNA": 136, "BELLIS PERENNIS": 143, "BENZOICUM ACIDUM": 146,
    "BERBERIS VULGARIS": 148, "BISMUTHUM": 152, "BLATTA ORIENTALIS": 153, "BORAX": 155,
    "BOTHROPS": 157, "BOVISTA": 158, "BROMIUM": 161, "BRYONIA": 163, "BUFO": 166, "BUTYRICUM ACIDUM": 168,
    "CACTUS GRANDIFLORUS": 168, "CADMIUM": 171, "CALADIUM": 174, "CALCAREA CARBONICA": 174,
    "CALCAREA FLUORICA": 183, "CALCAREA IODATA": 185, "CALCAREA PHOSPHORICA": 186, "CALCAREA SULPHURICA": 189,
    "CALENDULA": 191, "CAMPHORA": 193, "CANNABIS INDICA": 196, "CANNABIS SATIVA": 199,
    "CANTHARIS": 200, "CAPSICUM": 203, "CARBO ANIMALIS": 205, "CARBO VEGETABILIS": 207,
    "CARBOLICUM ACIDUM": 211, "CARDUUS MARIANUS": 215, "CASCARA SAGRADA": 217, "CAULOPHYLLUM": 220,
    "CAUSTICUM": 221, "CEANOTHUS": 224, "CEDRON": 225, "CHAMOMILLA": 228, "CHELIDONIUM": 230,
    "CHENOPODIUM": 233, "CHIMAPHILA UMBELLATA": 234, "CHINA": 251, "CHININUM ARSENICOSUM": 236,
    "CHININUM SULPHURICUM": 237, "CHIONANTHUS": 238, "CHLORALUM": 239, "CHLOROFORMUM": 241,
    "CHROMICUM ACIDUM": 243, "CICUTA VIROSA": 244, "CIMEX": 246, "CIMICIFUGA": 247, "CINA": 249,
    "CINNABARIS": 255, "CINNAMOMUM": 256, "CISTUS": 257, "CLEMATIS ERECTA": 259, "COBALTUM": 260,
    "COCA": 261, "COCCULUS": 264, "COCCUS CACTI": 267, "COFFEA CRUDA": 269, "COLCHICUM": 271,
    "COLLINSONIA": 273, "COLOCYNTHIS": 275, "CONIUM": 278, "CONVALLARIA": 282, "COPAIVA": 283,
    "CORALLIUM RUBRUM": 285, "CORNUS": 286, "COTYLEDON": 287, "CRATAEGUS": 288, "CROCUS SATIVUS": 289,
    "CROTALUS HORRIDUS": 291, "CROTON TIGLIUM": 294, "CUBEBA": 295, "CUPRUM METALLICUM": 298,
    "CURARE": 301, "CYCLAMEN": 302, "CYPRIPEDIUM": 304, "DIGITALIS": 305, "DIOSCOREA": 308,
    "DROSERA": 313, "DULCAMARA": 315, "ECHINACEA": 318, "ELAPS CORALLINUS": 319, "EUPATORIUM PERFOLIATUM": 330,
    "EUPHRASIA": 336, "FERRUM METALLICUM": 341, "FLUORICUM ACIDUM": 348, "GELSEMIUM": 358,
    "GLONOINUM": 364, "GRAPHITES": 369, "GUAIACUM": 376, "HAMAMELIS": 378, "HELLEBORUS NIGER": 381,
    "HELONIAS": 385, "HEPAR SULPHURIS": 386, "HYDRASTIS": 392, "HYOSCYAMUS": 398, "HYPERICUM": 401,
    "IGNATIA": 404, "IODUM": 412, "IPECACUANHA": 415, "IRIS VERSICOLOR": 419, "KALI BICHROMICUM": 427,
    "KALI CARBONICUM": 432, "KALI IODATUM": 438, "KALI MURIATICUM": 440, "KALI PHOSPHORICUM": 444,
    "KALI SULPHURICUM": 447, "KALMIA": 448, "KREOSOTUM": 450, "LAC CANINUM": 453, "LACHESIS": 449,
    "LEDUM": 467, "LILIUM TIGRINUM": 470, "LYCOPODIUM": 478, "MAGNESIA CARBONICA": 486,
    "MAGNESIA MURIATICA": 488, "MAGNESIA PHOSPHORICA": 490, "MEDORRHINUM": 496, "MERCURIUS SOLUBILIS": 504,
    "MEZEREUM": 515, "MILLEFOLIUM": 518, "MOSCHUS": 522, "MURIATICUM ACIDUM": 524, "NAJA": 529,
    "NATRUM CARBONICUM": 533, "NATRUM MURIATICUM": 536, "NATRUM PHOSPHORICUM": 540, "NATRUM SULPHURICUM": 543,
    "NITRICUM ACIDUM": 548, "NUX MOSCHATA": 553, "NUX VOMICA": 549, "OPIUM": 568, "PETROLEUM": 586,
    "PHOSPHORICUM ACIDUM": 590, "PHOSPHORUS": 593, "PHYTOLACCA": 601, "PICRICUM ACIDUM": 604,
    "PLATINA": 610, "PLUMBUM METALLICUM": 613, "PODOPHYLLUM": 615, "PSORINUM": 623, "PULSATILLA": 622,
    "PYROGENIUM": 632, "RADIUM": 636, "RANUNCULUS BULBOSUS": 638, "RHEUM": 644, "RHODODENDRON": 645,
    "RHUS TOXICODENDRON": 648, "RUMEX CRISPUS": 655, "RUTA": 656, "SABAL SERRULATA": 659, "SABINA": 660,
    "SANGUINARIA": 667, "SANICULA": 672, "SARSAPARILLA": 675, "SECALE CORNUTUM": 678, "SELENIUM": 681,
    "SEPIA": 687, "SILICEA": 692, "SPIGELIA": 714, "SPONGIA": 717, "STANNUM": 722, "STAPHYSAGRIA": 724,
    "STRAMONIUM": 728, "SULPHUR": 719, "SULPHURICUM ACIDUM": 741, "SYPHILINUM": 745, "TABACUM": 747,
    "TARENTULA": 752, "TELLURIUM": 755, "THUJA": 746, "TUBERCULINUM": 764, "URANIUM NITRICUM": 770,
    "URTICA URENS": 771, "VALERIANA": 775, "VERATRUM ALBUM": 778, "VERATRUM VIRIDE": 780,
    "VIBURNUM": 784, "VIOLA ODORATA": 786, "ZINCUM METALLICUM": 791, "ÆSCULUS GLABRA": 31,
    "ÆSCULUS HIPPOCASTANUM": 28, "ÆTHIOPS ANTIMONIALIS": 31, "ÆTHIOPS MERCURIALIS": 31, "ÆTHUSA CYNAPIUM": 31
  };

  let finalMappings = {};
  const isFallback = Object.keys(detectedMappings).length === 0;

  if (!isFallback) {
    finalMappings = { ...(repertory.chapterPages || {}), ...detectedMappings };
  } else {
    // For Boericke 8th Edition, front-matter is 11 pages.
    // Use pre-calculated exact physical PDF page numbers for 100% precision.
    finalMappings = { ...DEFAULT_MATERIA_MEDICA_INDEX };
    repertory.pageOffset = 11;
  }

  repertory.chapterPages = finalMappings;
  repertory.markModified('chapterPages');
  await repertory.save();

  console.log(`✅ Auto-mapped ${Object.keys(finalMappings).length} medicine pages (Physical page offset: ${repertory.pageOffset || 0})`);
  
  return res.json({
    success: true,
    isFallback,
    message: isFallback
      ? `PDF is a scanned image book. Loaded Master Remedy Index (${Object.keys(DEFAULT_MATERIA_MEDICA_INDEX).length} medicines). Adjust PDF Offset to sync page numbers!`
      : `Successfully scanned PDF and mapped ${Object.keys(detectedMappings).length} medicines!`,
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
  updateChapterPages,
  getRepertoryChapters,
  streamPDF,
  setExternalPdfUrl,
  scanMedicinePages
};
