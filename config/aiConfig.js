const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initAI = () => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'NEW_GEMINI_KEY_HERE') {
    console.warn('⚠️  GEMINI_API_KEY not set. AI analysis will use fallback keyword matching.');
    return false;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // Use gemini-pro (stable model) or gemini-1.5-flash-latest
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
  try {
    model = genAI.getGenerativeModel({ model: modelName });
    console.log(`✅ Gemini ${modelName} AI initialized`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    console.log('⚠️  Using fallback keyword matching for symptom analysis');
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => model !== null;

module.exports = { initAI, getModel, isAIReady };
