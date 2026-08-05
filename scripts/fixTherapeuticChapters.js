const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Rubric = require('../models/Rubric');
const Repertory = require('../models/Repertory');

// Known Homeopathic / Medical Chapter Rules
const CHAPTER_RULES = [
  { name: 'Head', keywords: ['headache', 'head', 'migraine', 'vertigo', 'scalp', 'temple', 'forehead', 'occiput', 'vertex', 'hair', 'dandruff', 'alopecia', 'baldness'] },
  { name: 'Mind', keywords: ['anxiety', 'fear', 'phobia', 'depression', 'anger', 'grief', 'weeping', 'restless', 'mind', 'memory', 'confusion', 'delusion', 'hysteria', 'compulsive', 'shock', 'emotional', 'mental', 'sadness', 'irritability', 'mania', 'burnout', 'forgetful', 'mood'] },
  { name: 'Eye', keywords: ['eye', 'vision', 'cornea', 'eyelid', 'tear', 'cataract', 'conjunctiv', 'stye', 'nystagmus', 'blepharitis', 'ptosis'] },
  { name: 'Ear', keywords: ['ear', 'hearing', 'tinnitus', 'earache', 'otitis', 'eustachian', 'mastoid', 'wax'] },
  { name: 'Nose', keywords: ['nose', 'coryza', 'sneezing', 'nasal', 'sinus', 'epistaxis', 'polyp'] },
  { name: 'Face', keywords: ['face', 'jaw', 'lip', 'facial', 'cheek', 'trigeminal', 'bell’s'] },
  { name: 'Mouth', keywords: ['mouth', 'tongue', 'tooth', 'teeth', 'gum', 'taste', 'saliva', 'salivation', 'uvula', 'stomatitis', 'thrush', 'dental'] },
  { name: 'Throat', keywords: ['throat', 'tonsil', 'pharynx', 'swallow', 'larynx', 'hoarseness', 'gag', 'voice', 'hawking'] },
  { name: 'Stomach', keywords: ['stomach', 'nausea', 'vomit', 'eructation', 'heartburn', 'appetite', 'thirst', 'gastric', 'acidity', 'eating', 'food', 'hunger', 'craving', 'aversion', 'digestive'] },
  { name: 'Abdomen', keywords: ['abdomen', 'abdominal', 'flatulence', 'colic', 'liver', 'spleen', 'navel', 'umbilicus', 'bloating', 'gas', 'ascites', 'inguinal', 'flank', 'appendicitis', 'hepatitis', 'enteritis', 'colitis', 'pancreas', 'pancreatic'] },
  { name: 'Rectum', keywords: ['stool', 'diarrhea', 'constipation', 'rectum', 'rectal', 'hemorrhoid', 'fissure', 'anus', 'worm', 'tenesmus', 'prolapse'] },
  { name: 'Bladder & Urinary', keywords: ['urin', 'bladder', 'kidney', 'urethra', 'cystitis', 'prostat', 'renal', 'urethritis', 'dysuria'] },
  { name: 'Respiration & Cough', keywords: ['cough', 'respirat', 'asthma', 'breath', 'expectorat', 'bronchitis', 'wheezing', 'dyspnea', 'sputum', 'snoring', 'suffocation', 'emphysema', 'pneumonia'] },
  { name: 'Chest & Heart', keywords: ['chest', 'lung', 'heart', 'palpitat', 'pulse', 'cardiac', 'pleurisy', 'sternum', 'nipple', 'cardio', 'angina', 'pericarditis', 'endocarditis', 'valvular', 'mitral', 'aortic'] },
  { name: 'Back & Spine', keywords: ['back', 'lumbar', 'spine', 'cervical', 'sacrum', 'scapula', 'neck', 'coccyx', 'dorsal'] },
  { name: 'Extremities', keywords: ['extremit', 'leg', 'arm', 'knee', 'foot', 'feet', 'hand', 'shoulder', 'joint', 'gout', 'rheumatism', 'thigh', 'ankle', 'wrist', 'finger', 'toe', 'sciatica', 'elbow', 'carpal', 'hip', 'limb', 'calf', 'locomotors'] },
  { name: 'Skin', keywords: ['skin', 'itch', 'erupt', 'eczema', 'ulcer', 'psoriasis', 'wart', 'boil', 'abscess', 'hives', 'rash', 'acne', 'pigment', 'freckle', 'wound', 'cellulitis', 'pimples', 'vesicles', 'papules', 'crust'] },
  { name: 'Fever & Chill', keywords: ['fever', 'chill', 'perspirat', 'sweat', 'heat', 'typhoid', 'influenza', 'febrile'] },
  { name: 'Sleep', keywords: ['sleep', 'dream', 'insomnia', 'drowsiness', 'yawning', 'hypersomnia'] },
  { name: 'Blood & Glands', keywords: ['blood', 'gland', 'thyroid', 'axillary', 'parotid', 'lymph', 'anaemia', 'circulation', 'hematology', 'endocrine', 'hormonal', 'pituitary'] },
  { name: 'Male Genitalia', keywords: ['penis', 'testicular', 'prostate', 'erectile', 'spermatic', 'hydrocele', 'varicocele', 'erection'] },
  { name: 'Female Genitalia', keywords: ['uterus', 'uterine', 'ovary', 'ovarian', 'menses', 'dysmenorrhoea', 'leucorrhoea', 'pms', 'menopause', 'vaginal', 'vulvar', 'pelvic', 'coition', 'breast', 'mastitis', 'reproductive', 'postpartum'] },
  { name: 'Nervous System', keywords: ['nerve', 'nervous', 'neuralgia', 'paralysis', 'tremor', 'seizure', 'epilepsy', 'convulsion', 'parkinson', 'ataxia', 'gait', 'spasm', 'chorea', 'numbness', 'tingling'] },
  { name: 'Generalities', keywords: ['general', 'exhaustion', 'faintness', 'dizziness', 'weakness', 'worse', 'better', 'modalities', 'emergency', 'cancer', 'fibrosis'] }
];

function inferChapter(text) {
  if (!text) return 'Generalities';
  const t = text.toLowerCase();
  
  for (const rule of CHAPTER_RULES) {
    if (rule.keywords.some(kw => t.includes(kw))) {
      return rule.name;
    }
  }

  // Fallback to title-cased first word if reasonably short
  const firstWord = text.split(/[\s<>\-:,_]/)[0].trim();
  if (firstWord.length >= 3 && firstWord.length <= 18) {
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }

  return 'Generalities';
}

async function fixTherapeuticChapters() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected.');

    // Find Therapeutic repertory by name
    const rep = await Repertory.findOne({ name: { $regex: /therapeu/i } });
    if (!rep) {
      console.error('❌ Could not find "Therapeutic" repertory in database.');
      process.exit(1);
    }

    console.log(`📌 Found Repertory: "${rep.name}" (ID: ${rep._id})`);

    const rubrics = await Rubric.find({ repertoryId: rep._id });
    console.log(`📦 Found ${rubrics.length} rubric records to clean.`);

    let updatedCount = 0;
    const bulkOps = [];

    for (const doc of rubrics) {
      const rawText = doc.chapter?.en || doc.rubric?.en || '';
      const cleanChapterName = inferChapter(rawText);
      const cleanRubricEn = doc.chapter?.en || doc.rubric?.en || 'Unspecified rubric';

      // Build search text
      const searchParts = [
        cleanChapterName,
        cleanRubricEn,
        doc.subrubric?.en,
        ...(doc.modalities?.aggravation || []),
        ...(doc.modalities?.amelioration || [])
      ].filter(Boolean);

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              'chapter.en': cleanChapterName,
              'chapter.hi': cleanChapterName,
              'rubric.en': cleanRubricEn,
              searchText: searchParts.join(' ').toLowerCase()
            }
          }
        }
      });

      if (bulkOps.length >= 1000) {
        await Rubric.bulkWrite(bulkOps);
        updatedCount += bulkOps.length;
        console.log(`⚡ Updated ${updatedCount}/${rubrics.length} records...`);
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await Rubric.bulkWrite(bulkOps);
      updatedCount += bulkOps.length;
    }

    console.log(`✅ Successfully cleaned and updated all ${updatedCount} rubric records for "${rep.name}".`);

    // Verify remaining distinct chapters
    const distinctChapters = await Rubric.distinct('chapter.en', { repertoryId: rep._id });
    console.log(`🎉 Distinct chapters count after fix: ${distinctChapters.length}`);
    console.log(`📋 Chapters list:\n`, distinctChapters.sort());

  } catch (err) {
    console.error('❌ Error during execution:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

fixTherapeuticChapters();
