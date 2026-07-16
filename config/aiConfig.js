const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiAdapter = null;
let groqAdapter = null;
let openaiAdapter = null;
let defaultAdapter = null;
let isReady = false;

class UnifiedModelAdapter {
  constructor(client, modelName, provider) {
    this.client = client;
    this.modelName = modelName;
    this.provider = provider;
  }

  async generateContent({ contents, generationConfig }) {
    if (this.provider === 'gemini') {
      const model = this.client.getGenerativeModel({ 
        model: this.modelName,
        generationConfig: {
          temperature: generationConfig?.temperature ?? 0.3,
          maxOutputTokens: generationConfig?.maxOutputTokens || 8000,
          responseMimeType: generationConfig?.responseMimeType || 'text/plain',
          responseSchema: generationConfig?.responseSchema
        }
      });
      return await model.generateContent({
        contents: contents.map(c => ({ role: c.role, parts: c.parts }))
      });
    }
    
    // For OpenAI and Groq - convert from Gemini format
    const messages = contents.map(c => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts
        // Handle text or image inputs
        .map(p => {
           if (p.text) return p.text;
           if (p.inlineData) {
             return {
               type: 'image_url',
               image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }
             };
           }
           return '';
        })
    })).filter(m => m.content);

    // If using multimodal input on non-gemini, we need to pass the array format
    messages.forEach(m => {
       if (Array.isArray(m.content) && m.content.length === 1 && typeof m.content[0] === 'string') {
         m.content = m.content[0];
       } else if (Array.isArray(m.content)) {
         // Convert all text items inside array to proper OpenAI format
         m.content = m.content.map(c => typeof c === 'string' ? { type: 'text', text: c } : c);
       }
    });

    const options = {
      model: this.modelName,
      messages,
      temperature: generationConfig?.temperature ?? 0.3,
      response_format: generationConfig?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
      max_tokens: generationConfig?.maxOutputTokens || 8000,
    };

    let completion = await this.client.chat.completions.create(options);
    const text = completion.choices[0]?.message?.content || '';

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
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const aiClient = new GoogleGenerativeAI(geminiKey);
      geminiAdapter = new UnifiedModelAdapter(aiClient, 'gemini-3.5-flash', 'gemini');
      defaultAdapter = defaultAdapter || geminiAdapter;
      isReady = true;
      console.log('✅ Google Gemini 3.5 Flash initialized successfully (Vision).');
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const aiClient = new Groq({ apiKey: groqKey });
      groqAdapter = new UnifiedModelAdapter(aiClient, 'llama-3.3-70b-versatile', 'groq');
      defaultAdapter = defaultAdapter || groqAdapter;
      isReady = true;
      console.log('✅ Groq AI (Llama 3.3 70B) initialized successfully (Analysis).');
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const aiClient = new OpenAI({ apiKey: openaiKey });
      openaiAdapter = new UnifiedModelAdapter(aiClient, 'gpt-4o-mini', 'openai');
      defaultAdapter = defaultAdapter || openaiAdapter;
      isReady = true;
      console.log('✅ OpenAI (GPT-4o-mini) initialized successfully.');
    }

    if (!isReady) {
      console.warn('⚠️ No AI API key found (GEMINI, OPENAI, or GROQ).');
    }
    return isReady;
  } catch (error) {
    console.error('❌ AI initialization failed:', error.message);
    isReady = false;
    return false;
  }
};

const getModel = () => defaultAdapter;
const getAnalysisModel = () => groqAdapter || openaiAdapter || defaultAdapter; // Prefer Groq for Analysis
const getVisionModel = () => geminiAdapter || openaiAdapter || defaultAdapter; // Prefer Gemini for Vision
const isAIReady = () => isReady;
const getProvider = () => defaultAdapter?.provider;

module.exports = { initAI, getModel, getAnalysisModel, getVisionModel, isAIReady, getProvider };
