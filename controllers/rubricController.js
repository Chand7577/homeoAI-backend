const Rubric = require('../models/Rubric');
const Repertory = require('../models/Repertory');

// GET /api/rubrics?repertoryId=&chapter=&page=&limit=
const getRubrics = async (req, res) => {
  const { repertoryId, chapter, search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (repertoryId) filter.repertoryId = repertoryId;
  if (chapter !== undefined) filter['chapter.en'] = chapter;
  if (search) filter.searchText = new RegExp(search.toLowerCase(), 'i');

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [rubrics, total] = await Promise.all([
    Rubric.find(filter).skip(skip).limit(parseInt(limit)).sort({ 'chapter.en': 1, 'rubric.en': 1 }),
    Rubric.countDocuments(filter)
  ]);

  res.json({ success: true, data: rubrics, total, page: parseInt(page), limit: parseInt(limit) });
};

// GET /api/rubrics/chapters?repertoryId=
const getChapters = async (req, res) => {
  const { repertoryId } = req.query;
  if (!repertoryId) { res.status(400); throw new Error('repertoryId is required'); }
  
  // Only look at the repertory's chapterPages map keys (never the excel rubrics)
  let chapters = [];
  const repertory = await Repertory.findById(repertoryId);
  if (repertory) {
    const srcMap = repertory.chapterPages instanceof Map 
      ? Object.fromEntries(repertory.chapterPages) 
      : (repertory.chapterPages || {});
      
    const keys = Object.keys(srcMap);
    if (keys.length > 0) {
      chapters = keys;
    } else {
      // Fallback: Default standard Boericke's Repertory chapters
      chapters = [
        "MIND", "HEAD", "EYES", "EARS", "NOSE", "FACE", "MOUTH", "THROAT", 
        "STOMACH", "ABDOMEN", "RECTUM", "URINARY ORGANS", "MALE SEXUAL ORGANS", 
        "FEMALE SEXUAL ORGANS", "RESPIRATORY ORGANS", "CIRCULATORY ORGANS", 
        "BACK", "EXTREMITIES", "SLEEP", "FEVER", "SKIN", "GENERALITIES", "MODALITIES"
      ];
    }
  }

  res.json({ success: true, data: chapters.sort() });
};

// POST /api/rubrics
const createRubric = async (req, res) => {
  const rubric = await Rubric.create(req.body);
  res.status(201).json({ success: true, data: rubric });
};

// PUT /api/rubrics/:id
const updateRubric = async (req, res) => {
  const rubric = await Rubric.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!rubric) { res.status(404); throw new Error('Rubric not found'); }
  res.json({ success: true, data: rubric });
};

// DELETE /api/rubrics/:id
const deleteRubric = async (req, res) => {
  await Rubric.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Rubric deleted' });
};

// GET /api/rubrics/medicines - Optimized with aggregation
const getMedicines = async (req, res) => {
  const { limit = 100, page = 1 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Use aggregation pipeline for better performance
  const medicines = await Rubric.aggregate([
    // Only get necessary fields
    { $project: { 'chapter.en': 1, 'rubric.en': 1, 'subrubric.en': 1, medicines: 1 } },
    // Unwind medicines map
    { $project: {
        chapter: '$chapter.en',
        rubric: '$rubric.en',
        subrubric: '$subrubric.en',
        medicinesArray: { $objectToArray: '$medicines' }
      }
    },
    { $unwind: '$medicinesArray' },
    // Group by medicine name
    { $group: {
        _id: '$medicinesArray.k',
        rubrics: {
          $push: {
            chapter: '$chapter',
            rubric: '$rubric',
            subrubric: '$subrubric',
            grade: '$medicinesArray.v'
          }
        },
        totalRubrics: { $sum: 1 }
      }
    },
    // Sort by name
    { $sort: { _id: 1 } },
    // Add pagination
    { $skip: skip },
    { $limit: parseInt(limit) },
    // Format output
    { $project: {
        _id: 0,
        name: '$_id',
        description: 'Homeopathic remedy present in the uploaded repertories.',
        descriptionHindi: 'अपलोड की गई रेपरटॉरी में मौजूद होम्योपैथिक दवा।',
        rubrics: {
          $map: {
            input: { $slice: ['$rubrics', 6] }, // Limit to 6 rubrics
            as: 'r',
            in: {
              $concat: [
                '$$r.chapter', ': ', '$$r.rubric',
                { $cond: [{ $gt: [{ $strLenCP: '$$r.subrubric' }, 0] }, { $concat: ['; ', '$$r.subrubric'] }, ''] },
                ' (Grade ', { $toString: '$$r.grade' }, ')'
              ]
            }
          }
        },
        totalRubrics: '$totalRubrics'
      }
    }
  ]);

  // Get total count for pagination
  const totalCount = await Rubric.aggregate([
    { $project: { medicinesArray: { $objectToArray: '$medicines' } } },
    { $unwind: '$medicinesArray' },
    { $group: { _id: '$medicinesArray.k' } },
    { $count: 'total' }
  ]);

  const total = totalCount.length > 0 ? totalCount[0].total : 0;

  res.json({ 
    success: true, 
    data: medicines,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    }
  });
};

module.exports = { getRubrics, getChapters, getMedicines, createRubric, updateRubric, deleteRubric };
