const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initAI = () => {
  if (!process.env.GEMINI_API_KEY || 
      process.env.GEMINI_API_KEY === 'NEW_GEMINI_KEY_HERE' || 
      process.env.GEMINI_API_KEY === '') {
    console.warn('⚠️  GEMINI_API_KEY not set. AI analysis will use fallback keyword matching.');
    return false;
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // v1beta API only supports these older models
  const modelNames = [
    process.env.GEMINI_MODEL,
    'gemini-pro',              // v1beta stable model
    'gemini-1.0-pro',
    'gemini-1.0-pro-001',
    'gemini-1.0-pro-latest',
    'text-bison-001',
    'models/gemini-pro',       // Try with models/ prefix
    'models/gemini-1.0-pro'
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
  console.log('⚠️  Your API key appears to be for v1beta API');
  console.log('💡 Generate a NEW API key at: https://aistudio.google.com/app/apikey');
  console.log('💡 Ensure "Generative Language API" is enabled');
  console.log('⚠️  Using fallback keyword matching for symptom analysis');
  return false;
};

const getModel = () => model;
const isAIReady = () => model !== null;

module.exports = { initAI, getModel, isAIReady };
