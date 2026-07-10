const Groq = require('groq-sdk');

let groqClient = null;
let model = null;
let isReady = false;

/**
 * Groq adapter that mimics the Gemini model.generateContent() interface
 * so aiService.js needs zero changes.
 */
class GroqModelAdapter {
  constructor(client, modelName) {
    this.client = client;
    this.modelName = modelName;
  }

  async generateContent({ contents, generationConfig }) {
    // Extract the text prompt from Gemini-style contents array
    // Skip any inlineData (PDF base64) parts — Groq is text-only
    const messages = contents.map(c => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n')
    })).filter(m => m.content.trim());

    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      temperature: generationConfig?.temperature ?? 0.3,
      response_format: generationConfig?.responseMimeType === 'application/json'
        ? { type: 'json_object' }
        : undefined,
      max_tokens: 4096,
    });

    const text = completion.choices[0]?.message?.content || '';

    // Return a Gemini-compatible response shape
    return {
      response: {
        candidates: [{ content: { parts: [{ text }] } }],
        text: () => text
      }
    };
  }
}

const initAI = () => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GROQ_API_KEY not found. Using keyword matching for symptom analysis.');
      isReady = false;
      return false;
    }

    groqClient = new Groq({ apiKey });

    // llama-3.3-70b-versatile: best free model for clinical reasoning
    model = new GroqModelAdapter(groqClient, 'llama-3.3-70b-versatile');

    isReady = true;
    console.log('✅ Groq AI (Llama 3.3 70B) initialized successfully for symptom analysis.');
    return true;
  } catch (error) {
    console.error('❌ Groq AI initialization failed:', error.message);
    console.warn('⚠️ Falling back to keyword matching.');
    isReady = false;
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => isReady;

module.exports = { initAI, getModel, isAIReady };
