require('dotenv').config({ path: '../.env' });
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

console.log("API Key loaded:", process.env.GEMINI_API_KEY ? "Yes (length: " + process.env.GEMINI_API_KEY.length + ")" : "No");

async function run() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not defined");
    return;
  }

  // Create a small test file
  const testFilePath = path.join(__dirname, 'test_temp.txt');
  fs.writeFileSync(testFilePath, 'Hello Gemini File API test content!');

  try {
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    console.log("Uploading file...");
    const uploadResult = await fileManager.uploadFile(testFilePath, {
      mimeType: "text/plain",
      displayName: "Test Temp Text File",
    });

    console.log("✅ Upload successful!");
    console.log("URI:", uploadResult.file.uri);
    console.log("Name:", uploadResult.file.name);

    console.log("Deleting file...");
    await fileManager.deleteFile(uploadResult.file.name);
    console.log("✅ Deletion successful!");
  } catch (err) {
    console.error("❌ Gemini File API Error:", err);
  } finally {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

run();
