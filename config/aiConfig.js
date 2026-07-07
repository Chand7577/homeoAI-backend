const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');

let vertexAI = null;
let model = null;
let isReady = false;

const initAI = () => {
  try {
    // Path to service account JSON key
    const keyFilePath = path.join(__dirname, '..', 'vertex-ai-key.json');
    
    // Check if key file exists
    const fs = require('fs');
    if (!fs.existsSync(keyFilePath)) {
      console.warn('⚠️ Vertex AI key file not found. Using keyword matching for symptom analysis.');
      isReady = false;
      return false;
    }

    // Read and parse the service account key
    const serviceAccountKey = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
    
    // Initialize Vertex AI with service account credentials
    vertexAI = new VertexAI({
      project: serviceAccountKey.project_id,
      location: 'us-central1', // Use us-central1 for Gemini models
      googleAuthOptions: {
        credentials: serviceAccountKey
      }
    });

    // Get Gemini 1.5 Flash model (fast and cost-effective)
    model = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    isReady = true;
    console.log('✅ Vertex AI (Gemini 1.5 Flash) initialized successfully for symptom analysis.');
    console.log(`   Project: ${serviceAccountKey.project_id}`);
    console.log('   Location: us-central1');
    return true;
  } catch (error) {
    console.error('❌ Vertex AI initialization failed:', error.message);
    console.warn('⚠️ Falling back to keyword matching for symptom analysis.');
    isReady = false;
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => isReady;

module.exports = { initAI, getModel, isAIReady };
