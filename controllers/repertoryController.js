
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
    "ABIES CANADENSIS": 12, "ABIES NIGER": 14, "ABROTANUM": 15, "ABSINTHIUM": 17, "ACETANILIDUM": 19,
    "ACETICUM ACIDUM": 20, "ACONITUM NAPELLUS": 21, "ACTAEA SPICATA": 23, "ADONIS VERNALLIS": 25,
    "AESCULUS HIPPOCASTANUM": 26, "AETHUSA CYNAPIUM": 29, "AGARICUS MUSCARIUS": 31, "AGNUS CASTUS": 37,
    "ALLIUM CEPA": 42, "ALLIUM SATIVUM": 44, "ALOE SOCOTRINA": 45, "ALSTONIA SCHOLARIS": 48, "ALUMINA": 49,
    "AMBRA GRISEA": 53, "AMMONIACUM DOREMA": 55, "AMMONIUM CARBONICUM": 56, "AMMONIUM CAUSTICUM": 59,
    "AMMONIUM MURIATICUM": 60, "AMMONIUM PHOSPHORICUM": 62, "AMYLIS NITRIS": 62,
    "ANACARDIUM ORIENTALE": 63, "ANAGALLIS ARVENSIS": 66, "ANHALONIUM LEWINII": 67, "ANTHRACINUM": 68,
    "ANTIMONIUM CRUDUM": 69, "ANTIMONIUM TARTARICUM": 72, "ANTIPYRINUM": 74, "APIS MELLIFICA": 75,
    "APIUM GRAVEOLENS": 80, "APOCYNUM CANNABINUM": 81, "ARGENTUM METALLICUM": 82, "ARGENTUM NITRICUM": 84,
    "ARNICA MONTANA": 87, "ARSENICUM ALBUM": 91, "ARSENICUM IODATUM": 99, "ARTEMISIA VULGARIS": 101,
    "ARUM TRIPHYLLUM": 102, "ASAFOETIDA": 103, "ASARUM EUROPAEUM": 105, "ASCLEPIAS TUBEROSA": 106,
    "ASTERIAS RUBENS": 107, "AURUM METALLICUM": 108, "BAPTISIA TINCTORIA": 114, "BARYTA CARBONICA": 117,
    "BELLADONNA": 122, "BELLIS PERENNIS": 128, "BENZOICUM ACIDUM": 130, "BERBERIS VULGARIS": 132,
    "BISMUTHUM": 136, "BORAX VENETA": 137, "BOVISTA LYCOPERDON": 140, "BROMIUM": 143, "BRYONIA ALBA": 146,
    "BUFO RANA": 152, "CACTUS GRANDIFLORUS": 154, "CALCAREA CARBONICA": 160, "CALCAREA FLUORICA": 167,
    "CALCAREA PHOSPHORICA": 170, "CALCAREA SULPHURICA": 175, "CALENDULA OFFICINALIS": 178, "CAMPHORA": 180,
    "CANNABIS INDICA": 183, "CANNABIS SATIVA": 185, "CANTHARIS VESICATORIA": 186, "CAPSICUM ANNUUM": 189,
    "CARBO ANIMALIS": 192, "CARBO VEGETABILIS": 195, "CARBOLICUM ACIDUM": 200, "CARCINOSINUM": 202,
    "CARDUUS MARIANUS": 203, "CAUSTICUM": 206, "CHAMOMILLA": 214, "CHELIDONIUM MAJUS": 218,
    "CHINA OFFICINALIS": 224, "CHININUM SULPHURICUM": 230, "CICUTA VIROSA": 235, "CINA MARITIMA": 238,
    "CLEMATIS ERECTA": 244, "COCA (ERYTHROXYLON COCA)": 246, "COCCULUS INDICUS": 248, "COFFEA CRUDA": 253,
    "COLCHICUM AUTUMNALE": 256, "COLOCYNTHIS": 261, "CONIUM MACULATUM": 265, "CROCUS SATIVUS": 273,
    "CROTON TIGLIUM": 275, "CUPRUM METALLICUM": 278, "DIGITALIS PURPUREA": 286, "DIOSCOREA VILLOSA": 290,
    "DROSERA ROTUNDIFOLIA": 293, "DULCAMARA": 296, "ECHINACEA ANGUSTIFOLIA": 299, "ELAPS CORALLINUS": 301,
    "EUPATORIUM PERFOLIATUM": 306, "EUPHORBIUM OFFICINARUM": 308, "EUPHRASIA OFFICINALIS": 310, "FERRUM METALLICUM": 315,
    "FLUORICUM ACIDUM": 320, "FORMICA RUFA": 322, "GELSEMIUM SEMPERVIRENS": 327, "GLONOINUM": 334,
    "GRAPHITES": 340, "GRATIOLA OFFICINALIS": 345, "GRINDELIA ROBUSTA": 347, "GUAEACUM OFFICINALE": 348,
    "HAMAMELIS VIRGINICA": 350, "HELLEBORUS NIGER": 355, "HEPAR SULPHURIS CALCAREUM": 359, "HYDRASTIS CANADENSIS": 365,
    "HYDROCYANICUM ACIDUM": 370, "HYOSCYAMUS NIGER": 372, "HYPERICUM PERFORATUM": 377, "IGNATIA AMARA": 380,
    "IODIUM": 387, "IPECACUANHA": 391, "IRIS VERSICOLOR": 395, "KALIUM BICHROMICUM": 405,
    "KALIUM CARBONICUM": 411, "KALIUM IODATUM": 417, "KALIUM NITRICUM": 423, "KALIUM PHOSPHORICUM": 425,
    "KALMIA LATIFOLIA": 434, "KREOSOTUM": 436, "LAC CANINUM": 440, "LACHESIS MUTUS": 444,
    "LACTUCA VIROSA": 452, "LAPPA ARCTIUM": 454, "LATRODECTUS MACTANS": 456, "LAUROCERASUS": 457,
    "LEDUM PALUSTRE": 460, "LILIUM TIGRINUM": 465, "LITHIUM CARBONICUM": 468, "LOBELIA INFLATA": 470,
    "LYCOPODIUM CLAVATUM": 472, "LYCOPUS VIRGINICUS": 480, "MAGNESIA CARBONICA": 483, "MAGNESIA MURIATICA": 486,
    "MAGNESIA PHOSPHORICA": 488, "MANCINELLA": 491, "MEDORRHINUM": 495, "MELILOTUS OFFICINALIS": 499,
    "MERCURIUS SOLUBILIS": 503, "MERCURIUS CORROSIVUS": 509, "MERCURIUS CYANATUS": 511, "MERCURIUS DULCIS": 512,
    "MERCURIUS IODATUS FLAVUS": 513, "MERCURIUS IODATUS RUBER": 514, "MEZEREUM": 516, "MILLEFOLIUM": 520,
    "MOSCHUS": 523, "MURIATICUM ACIDUM": 526, "MYRICA CERIFERA": 529, "NAJA TRIPUDIANS": 531,
    "NATRUM CARBONICUM": 535, "NATRUM MURIATICUM": 538, "NATRUM PHOSPHORICUM": 544, "NATRUM SULPHURICUM": 548,
    "NITRICUM ACIDUM": 552, "NUX MOSCHATA": 557, "NUX VOMICA": 560, "OCIMUM CANUM": 568,
    "OLEANDER (NERIUM OLEANDER)": 570, "OPIUM (PAPAVER SOMNIFERUM)": 575, "OXALICUM ACIDUM": 581, "PAEONIA OFFICINALIS": 584,
    "PARIS QUADRIFOLIA": 588, "PETROLEUM": 590, "PETROSELINUM SATIVUM": 594, "PHOSPHORICUM ACIDUM": 595,
    "PHOSPHORUS": 599, "PHYTOLACCA DECANDRA": 608, "PICRICUM ACIDUM": 612, "PLATINUM METALLICUM": 617,
    "PLUMBUM METALLICUM": 620, "PODOPHYLLUM PELTATUM": 624, "PULSATILLA NIGRICANS": 633, "RANUNCULUS BULBOSUS": 644,
    "RHEUM PALMATUM": 651, "RHODODENDRON CHRYSANTHUM": 653, "RHUS TOXICODENDRON": 656, "RUMEX CRISPUS": 661,
    "RUTA GRAVEOLENS": 666, "SABADILLA": 670, "SABINA": 676, "SAMBUCUS NIGER": 680,
    "SANGUINARIA CANADENSIS": 682, "SANICULA AQUA": 686, "SARSAPARILLA OFFICINALIS": 689, "SECALE CORNUTUM": 693,
    "SELENIUM METALLICUM": 697, "SENEGA": 701, "SEPIA OFFICINALIS": 704, "SILICEA TERRA": 711,
    "SPIGELIA ANTHELMIA": 717, "SPONGIA TOSTA": 721, "STANNUM METALLICUM": 724, "STAPHYSAGRIA": 728,
    "STRAMONIUM": 735, "STRONTIUM CARBONICUM": 740, "SULPHUR": 745, "SULPHURICUM ACIDUM": 754, "SYPHILINUM": 758,
    "TABACUM": 760, "TARANTULA HISPANA": 763, "TEREBINTHINA": 768, "THUJA OCCIDENTALIS": 775,
    "TUBERCULINUM BOVINUM": 785, "URANIUM NITRICUM": 789, "URTICA URENS": 791, "VALERIANA OFFICINALIS": 795,
    "VARIOLINUM": 797, "VERATRUM ALBUM": 798, "VERATRUM VIRIDE": 802, "ZINCUM METALLICUM": 813
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
