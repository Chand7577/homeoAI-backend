const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initAI = () => {
  if (!process.env.GEMINI_API_KEY || 
      process.env.GEMINI_API_KEY === 'NEW_GEMINI_KEY_HERE' || 
      process.env.GEMINI_API_KEY === '') {
    console.warn('⚠️  GEMINI_API_KEY not set. Using keyword matching.');
    return false;
  }
  
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Use gemini-1.5-flash (requires newer API key from aistudio.google.com)
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    model = genAI.getGenerativeModel({ model: modelName });
    console.log(`✅ Gemini ${modelName} configured (will validate on first use)`);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    console.log('⚠️  Using keyword matching instead');
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => model !== null;

module.exports = { initAI, getModel, isAIReady };
