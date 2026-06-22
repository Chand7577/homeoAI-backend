const mongoose = require('mongoose');
require('dotenv').config();
const Repertory = require('../models/Repertory');

const correctMappings = {
  "Materia Medica": 15,
  "Repertory": 826,
  "MIND": 828,
  "HEAD": 866,
  "EYES": 896,
  "EARS": 910,
  "NOSE": 922,
  "FACE": 931,
  "MOUTH": 940,
  "THROAT": 955,
  "STOMACH": 972,
  "ABDOMEN": 995,
  "RECTUM": 1013,
  "URINARY ORGANS": 1025,
  "MALE SEXUAL ORGANS": 1040,
  "FEMALE SEXUAL ORGANS": 1051,
  "RESPIRATORY ORGANS": 1070,
  "CIRCULATORY ORGANS": 1097,
  "BACK": 1102,
  "EXTREMITIES": 1116,
  "SLEEP": 1149,
  "FEVER": 1156,
  "SKIN": 1168,
  "GENERALITIES": 1193,
  "MODALITIES": 1216,
  "ACONITUM NAPELLUS": 16,
  "BELLADONNA": 291,
  "BRYONIA ALBA": 324,
  "CALCAREA CARBONICA": 346,
  "LACHESIS": 520,
  "LYCOPODIUM CLAVATUM": 540,
  "NUX VOMICA": 590,
  "PULSATILLA": 645,
  "SULPHUR": 704
};

async function fixDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/homoeopathy');

  const reps = await Repertory.find();
  console.log("Repertories found:", reps.length);
  for (const rep of reps) {
    console.log(`Rep: ${rep.name}, pdfName: ${rep.pdfName}`);
    if (rep.pdfName && (rep.pdfName.includes('Boericke') || rep.pdfName.includes('Pocket-Manual') || rep.pdfName.includes('pdf'))) {
      console.log(`Updating ${rep.name}...`);
      rep.chapterPages = correctMappings;
      rep.markModified('chapterPages');
      await rep.save();
      console.log(`Updated successfully.`);
    }
  }

  console.log("Done!");
  process.exit(0);
}

fixDB();
