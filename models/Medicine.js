const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  
  // Alternative names and abbreviations
  alternativeNames: [{ type: String, trim: true }],
  
  // Medicine grading system (1 = low grade, 2 = medium grade, 3 = high grade)
  defaultGrade: { 
    type: Number, 
    min: 1, 
    max: 3, 
    default: 1 
  },
  
  // Medicine details
  description: { 
    type: String, 
    default: '' 
  },
  
  descriptionHindi: { 
    type: String, 
    default: '' 
  },
  
  // Clinical information
  source: { 
    type: String, 
    default: '' // e.g., "Animal", "Plant", "Mineral", "Nosode"
  },
  
  commonName: { 
    type: String, 
    default: '' 
  },
  
  // Key indications and characteristics
  keySymptoms: [{ type: String }],
  
  modalities: {
    aggravation: [{ type: String }], // Conditions that worsen symptoms
    amelioration: [{ type: String }] // Conditions that improve symptoms
  },
  
  // Potency recommendations
  commonPotencies: [{ type: String }], // e.g., ["6C", "30C", "200C"]
  
  // Usage statistics
  rubricsCount: { 
    type: Number, 
    default: 0 
  },
  
  prescriptionsCount: { 
    type: Number, 
    default: 0 
  },
  
  // Meta information
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  // Search optimization
  searchText: { 
    type: String, 
    default: '' 
  },
  
  // Creation tracking
  createdBy: { 
    type: String, 
    default: 'system' 
  },
  
}, { timestamps: true });

// Build search text before saving
MedicineSchema.pre('save', async function() {
  const parts = [
    this.name,
    this.commonName,
    ...(this.alternativeNames || []),
    ...(this.keySymptoms || []),
    this.source,
    this.description,
    this.descriptionHindi
  ].filter(Boolean);
  
  this.searchText = parts.join(' ').toLowerCase();
});

// Indexes for better performance
MedicineSchema.index({ searchText: 'text' });
MedicineSchema.index({ isActive: 1 });
MedicineSchema.index({ defaultGrade: 1 });

module.exports = mongoose.model('Medicine', MedicineSchema);