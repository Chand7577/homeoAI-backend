const Groq = require('groq-sdk');
const OpenAI = require('openai');

let aiClient = null;
let model = null;
let isReady = false;
let usingProvider = null; // 'groq' or 'openai'

/**
 * Unified adapter for both Groq and OpenAI that mimics Gemini's interface
 */
class UnifiedModelAdapter {
  constructor(client, modelName, provider) {
    this.client = client;
    this.modelName = modelName;
    this.provider = provider;
  }

  async generateContent({ contents, generationConfig }) {
    // Extract the text prompt from Gemini-style contents array
    const messages = contents.map(c => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n')
    })).filter(m => m.content.trim());

    let completion;
    
    if (this.provider === 'openai') {
      // OpenAI API call
      completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: generationConfig?.temperature ?? 0.3,
        response_format: generationConfig?.responseMimeType === 'application/json'
          ? { type: 'json_object' }
          : undefined,
        max_tokens: generationConfig?.maxOutputTokens || 8000,
      });
    } else {
      // Groq API call (fallback)
      completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: generationConfig?.temperature ?? 0.3,
        response_format: generationConfig?.responseMimeType === 'application/json'
          ? { type: 'json_object' }
          : undefined,
        max_tokens: generationConfig?.maxOutputTokens || 8000,
      });
    }

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
    // Try OpenAI first (preferred for Kent OCR)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      aiClient = new OpenAI({ apiKey: openaiKey });
      // gpt-4o-mini: fast, affordable, 128k context, great for structured extraction
      model = new UnifiedModelAdapter(aiClient, 'gpt-4o-mini', 'openai');
      usingProvider = 'openai';
      isReady = true;
      console.log('✅ OpenAI (GPT-4o-mini) initialized successfully.');
      return true;
    }

    // Fallback to Groq if OpenAI not available
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      aiClient = new Groq({ apiKey: groqKey });
      model = new UnifiedModelAdapter(aiClient, 'llama-3.3-70b-versatile', 'groq');
      usingProvider = 'groq';
      isReady = true;
      console.log('✅ Groq AI (Llama 3.3 70B) initialized successfully.');
      return true;
    }

    console.warn('⚠️ No AI API key found (OPENAI_API_KEY or GROQ_API_KEY).');
    isReady = false;
    return false;
  } catch (error) {
    console.error('❌ AI initialization failed:', error.message);
    isReady = false;
    return false;
  }
};

const getModel = () => model;
const isAIReady = () => isReady;
const getProvider = () => usingProvider;

module.exports = { initAI, getModel, isAIReady, getProvider };
