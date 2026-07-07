require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const testAPIKey = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'NEW_GEMINI_KEY_HERE' || apiKey === '') {
    console.log('❌ No API key found in .env');
    console.log('\nAdd your API key to server/.env:');
    console.log('GEMINI_API_KEY=your_key_here');
    return;
  }
  
  console.log('✓ API key found:', apiKey.substring(0, 10) + '...');
  console.log('\nTesting API key with Gemini...\n');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('Sending test prompt...');
    const result = await model.generateContent('Say hello in one word');
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ SUCCESS! API key works!');
    console.log('Response:', text);
    console.log('\n✅ Your API key is correctly configured!');
    console.log('The issue is in Render.com deployment.');
    
  } catch (error) {
    console.log('❌ API KEY TEST FAILED');
    console.log('\nError:', error.message);
    
    if (error.message.includes('403')) {
      console.log('\n🔧 FIX: Enable Generative Language API');
      console.log('1. Go to: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com');
      console.log('2. Make sure correct project is selected (top dropdown)');
      console.log('3. Click "ENABLE"');
      console.log('4. Wait 2-3 minutes');
      console.log('5. Re-run this test');
    } else if (error.message.includes('404')) {
      console.log('\n🔧 FIX: Your API key is for v1beta (old)');
      console.log('1. Go to: https://aistudio.google.com/app/apikey');
      console.log('2. CREATE NEW API KEY (not reuse)');
      console.log('3. Select "Create API key in new project"');
      console.log('4. Copy the key');
      console.log('5. Update server/.env');
    } else {
      console.log('\n🔧 FIX: Unknown error');
      console.log('Full error:', error);
    }
  }
};

testAPIKey();
