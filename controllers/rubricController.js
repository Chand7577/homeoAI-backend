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

// GET /api/rubrics/medicines
const getMedicines = async (req, res) => {
  const rubrics = await Rubric.find({}, 'chapter rubric subrubric medicines');
  const medicineMap = {};

  rubrics.forEach(r => {
    const meds = r.medicines instanceof Map 
      ? Object.fromEntries(r.medicines) 
      : (r.medicines || {});
    
    Object.entries(meds).forEach(([medName, grade]) => {
      const name = medName.trim();
      if (!name) return;
      if (!medicineMap[name]) {
        medicineMap[name] = {
          name,
          description: `Homeopathic remedy present in the uploaded repertories.`,
          descriptionHindi: `अपलोड की गई रेपरटॉरी में मौजूद होम्योपैथिक दवा।`,
          rubrics: []
        };
      }
      
      const subText = r.subrubric?.en ? `; ${r.subrubric.en}` : '';
      const rubricText = `${r.chapter.en}: ${r.rubric.en}${subText} (Grade ${grade})`;
      
      if (medicineMap[name].rubrics.length < 6) {
        medicineMap[name].rubrics.push(rubricText);
      }
    });
  });

  const data = Object.values(medicineMap).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, data });
};

module.exports = { getRubrics, getChapters, getMedicines, createRubric, updateRubric, deleteRubric };
