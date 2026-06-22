const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initAI = () => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    console.warn('⚠️  GEMINI_API_KEY not set. AI analysis will use fallback keyword matching.');
    return false;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  model = genAI.getGenerativeModel({ model: modelName });
  console.log(`✅ Gemini ${modelName} AI initialized`);
  return true;
};

const getModel = () => model;
const isAIReady = () => model !== null;

module.exports = { initAI, getModel, isAIReady };
