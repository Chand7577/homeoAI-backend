const mongoose = require('mongoose');

const RubricSchema = new mongoose.Schema({
  repertoryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Repertory', 
    required: true,
    index: true
  },
  chapter: {
    en: { type: String, required: true },   // e.g. "Mind"
    hi: { type: String, default: '' },      // e.g. "मन"
  },
  rubric: {
    en: { type: String, required: true },   // e.g. "Anger, easily provoked"
    hi: { type: String, default: '' },      // e.g. "क्रोध, आसानी से भड़कना"
  },
  subrubric: {
    en: { type: String, default: '' },      // e.g. "morning; from contradiction"
    hi: { type: String, default: '' },
  },
  modalities: {
    aggravation: [{ type: String }],        // ["morning", "noise", "cold"]
    amelioration: [{ type: String }],       // ["open air", "warmth"]
  },
  synonyms: {
    en: [{ type: String }],                 // ["irritable", "wrathful"]
    hi: [{ type: String }],                 // ["चिड़चिड़ा"]
  },
  // medicines: { "Nux Vomica": 3, "Lycopodium": 2, "Sepia": 1 }
  medicines: {
    type: Map,
    of: Number,
    default: {}
  },
  // Pre-computed search text for fast keyword fallback
  searchText: { type: String, default: '' },
}, { timestamps: true });

// Build searchText before saving for keyword fallback
RubricSchema.pre('save', function(next) {
  const parts = [
    this.chapter?.en, this.chapter?.hi,
    this.rubric?.en, this.rubric?.hi,
    this.subrubric?.en, this.subrubric?.hi,
    ...(this.synonyms?.en || []),
    ...(this.synonyms?.hi || []),
    ...(this.modalities?.aggravation || []),
    ...(this.modalities?.amelioration || []),
  ].filter(Boolean);
  this.searchText = parts.join(' ').toLowerCase();
  next();
});

RubricSchema.index({ repertoryId: 1, 'chapter.en': 1, 'rubric.en': 1 });
RubricSchema.index({ searchText: 'text' });

module.exports = mongoose.model('Rubric', RubricSchema);
