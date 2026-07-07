require('dotenv').config();
const { OpenAI } = require('openai');

const testOpenAI = async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === '') {
    console.log('❌ No OPENAI_API_KEY found');
    return;
  }
  
  console.log('✓ API key found:', apiKey.substring(0, 20) + '...');
  console.log('\nTesting OpenAI API...\n');
  
  try {
    const openai = new OpenAI({ apiKey });
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Say hello in one word" }
      ]
    });
    
    console.log('✅ SUCCESS! OpenAI API works!');
    console.log('Response:', completion.choices[0].message.content);
    console.log('\n✅ Your OpenAI API key is correctly configured!');
    console.log('Now update Render.com environment variable:');
    console.log('  OPENAI_API_KEY=your_key');
    
  } catch (error) {
    console.log('❌ API KEY TEST FAILED');
    console.log('\nError:', error.message);
  }
};

testOpenAI();
