const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initAI = () => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'NEW_GEMINI_KEY_HERE') {
    console.warn('⚠️  GEMINI_API_KEY not set. AI analysis will use fallback keyword matching.');
    return false;
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Use the correct v1 API model names (not v1beta)
  const modelNames = [
    process.env.GEMINI_MODEL,
    'gemini-pro',           // Stable v1 model
    'gemini-1.0-pro-latest',
    'gemini-1.0-pro'
  ].filter(Boolean);
  
  for (const modelName of modelNames) {
    try {
      model = genAI.getGenerativeModel({ model: modelName });
      console.log(`✅ Gemini ${modelName} AI initialized`);
      return true;
    } catch (error) {
      console.warn(`⚠️  Model ${modelName} not available: ${error.message}`);
    }
  }
  
  console.error('❌ Failed to initialize any Gemini model');
  console.log('⚠️  Using fallback keyword matching for symptom analysis');
  return false;
};

const getModel = () => model;
const isAIReady = () => model !== null;

module.exports = { initAI, getModel, isAIReady };
