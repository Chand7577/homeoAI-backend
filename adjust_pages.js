require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const RepertorySchema = new mongoose.Schema({
  name: String,
  type: String,
  chapterPages: {
    type: Map,
    of: Number
  }
});
const Repertory = mongoose.model('Repertory', RepertorySchema);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Find "Boericke's Pocket Manual" or "Pocket Manual of Homoeopathic Materia Medica"
  const reps = await Repertory.find({ 
    name: { $in: ["Boericke's Pocket Manual", "Pocket Manual of Homoeopathic Materia Medica"] } 
  });
  
  for (const rep of reps) {
    if (rep.chapterPages) {
      console.log(`Reverting ${rep.name}...`);
      
      const newMap = new Map();
      for (const [key, val] of rep.chapterPages.entries()) {
        if (typeof val === 'number') {
          newMap.set(key, val + 5); // ADD 5 BACK
        } else {
          newMap.set(key, val);
        }
      }
      
      rep.chapterPages = newMap;
      await rep.save();
      console.log(`Reverted ${rep.name} (shifted all pages by +5 back to original)`);
    }
  }
  
  process.exit(0);
}

main();
