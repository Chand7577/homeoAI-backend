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
      const modelsToTry = Array.from(new Set([this.modelName, 'gemini-2.0-flash', 'gemini-2.0-flash-lite']));
      let lastError = null;

      for (const mName of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const model = this.client.getGenerativeModel({ 
              model: mName,
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
          } catch (err) {
            lastError = err;
            const isTransient = err.message.includes('503') || err.message.includes('high demand') || err.message.includes('Service Unavailable') || err.message.includes('429');
            if (isTransient && attempt < 2) {
              console.warn(`[AI Adapter] ⚠️ Gemini (${mName}) returned: ${err.message}. Retrying in ${2000 * attempt}ms...`);
              await new Promise(r => setTimeout(r, 2000 * attempt));
            } else if (isTransient) {
              console.warn(`[AI Adapter] ⚠️ Model ${mName} rate-limited or unavailable. Trying next fallback...`);
              break;
            } else {
              throw err;
            }
          }
        }
      }

      // If Gemini quota/rate limits prevent execution and OpenAI is available, fail over to OpenAI (GPT-4o-mini)
      if (openaiAdapter && openaiAdapter !== this) {
        console.warn(`[AI Adapter] 🔄 Gemini models rate-limited (${lastError?.message}). Auto-failing over to OpenAI (GPT-4o-mini)...`);
        return await openaiAdapter.generateContent({ contents, generationConfig });
      }

      throw lastError;
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
    // NOTE: Current Gemini API key (AQ.Ab8RN6JtKhT7...) does not work with Gemini API.
    // Gemini initialization is disabled until a valid key is provided.
    // Using Groq as primary AI provider (faster and working).
    const geminiKey = process.env.GEMINI_API_KEY;
    const enableGemini = process.env.ENABLE_GEMINI !== 'false'; // Auto enable if key exists unless explicitly false
    
    if (geminiKey && enableGemini) {
      const aiClient = new GoogleGenerativeAI(geminiKey);
      const geminiModel = process.env.GEMINI_ANALYSIS_MODEL || 'gemini-flash-latest';
      geminiAdapter = new UnifiedModelAdapter(aiClient, geminiModel, 'gemini');
      defaultAdapter = defaultAdapter || geminiAdapter;
      isReady = true;
      console.log(`✅ Google Gemini ${geminiModel} initialized successfully.`);
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
// IMPORTANT: Groq is primary because current Gemini key doesn't work
// Groq (llama-3.3-70b) responds in ~800ms vs Gemini 8-10s
// To use Gemini: Get valid key + set ENABLE_GEMINI=true
const getAnalysisModel = () => groqAdapter || geminiAdapter || openaiAdapter || defaultAdapter;
const getVisionModel = () => geminiAdapter || openaiAdapter || defaultAdapter; // Prefer Gemini for Vision
const isAIReady = () => isReady;
const getProvider = () => defaultAdapter?.provider;

module.exports = { initAI, getModel, getAnalysisModel, getVisionModel, isAIReady, getProvider };
