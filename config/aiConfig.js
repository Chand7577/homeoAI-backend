const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;
let isReady = false;

const initAI = () => {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'NEW_GEMINI_KEY_HERE') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // gemini-1.5-flash: reliably free (1500 req/day), no billing required
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    isReady = true;
    console.log('✅ Gemini AI initialized successfully for symptom analysis.');
    return true;
  } else {
    console.warn('⚠️ GEMINI_API_KEY not found or invalid. Using keyword matching for symptom analysis.');
    isReady = false;
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => isReady;

module.exports = { initAI, getModel, isAIReady };
