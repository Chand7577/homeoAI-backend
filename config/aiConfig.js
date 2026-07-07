const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;
let isReady = false;

const initAI = () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found in environment variables. Using keyword matching for symptom analysis.');
      isReady = false;
      return false;
    }

    // Initialize Google Generative AI with API key
    genAI = new GoogleGenerativeAI(apiKey);

    // Get Gemini 3.5 Flash model (fast and cost-effective)
    model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
    });

    isReady = true;
    console.log('✅ Gemini AI (Gemini 3.5 Flash) initialized successfully for symptom analysis.');
    return true;
  } catch (error) {
    console.error('❌ Gemini AI initialization failed:', error.message);
    console.warn('⚠️ Falling back to keyword matching for symptom analysis.');
    isReady = false;
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => isReady;

module.exports = { initAI, getModel, isAIReady };
