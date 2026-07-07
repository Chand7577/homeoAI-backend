const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const result = await model.generateContent("Hello!");
    console.log("Success with gemini-3.5-flash:", result.response.text());
  } catch (err) {
    console.error("Error with gemini-3.5-flash:", err.message);
  }
}

run();