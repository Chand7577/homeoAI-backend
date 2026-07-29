const axios = require('axios');

const API_URL = 'https://homeoai-backend-83yt.onrender.com/api';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function testExactSymptoms() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    const token = loginResponse.data.token;

    // Get KENT repertory
    const repertoriesResponse = await axios.get(`${API_URL}/repertories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const kentRepertory = repertoriesResponse.data.data.find(r => r.name === 'KENT');
    if (!kentRepertory) {
      console.error('❌ KENT repertory not found!');
      return;
    }

    console.log(`✅ Using KENT repertory (ID: ${kentRepertory._id})\n`);

    // Test with symptoms that match Kent rubric names exactly
    const exactSymptoms = [
      'Anxiety',
      'Restlessness',
      'Irritability',
      'Fever',
      'Chill',
      'Thirst',
      'Insomnia',
      'Headache',
      'Nausea'
    ];

    console.log('🧪 Testing with EXACT Kent rubric names:');
    exactSymptoms.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
    console.log('\n⏳ Running analysis...\n');

    const analysisResponse = await axios.post(
      `${API_URL}/analysis/run`,
      {
        repertoryId: kentRepertory._id,
        symptoms: exactSymptoms,
        patientName: 'Test Patient'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const result = analysisResponse.data.data;

    console.log('='.repeat(70));
    console.log('📊 RESULTS WITH EXACT RUBRIC NAMES');
    console.log('='.repeat(70));
    console.log(`✅ Matched: ${result.matchedRubrics.length}/${exactSymptoms.length}`);
    console.log(`💊 Medicines: ${result.medicineDistribution.length}`);
    console.log('');

    const symptomMatchMap = new Map();
    result.matchedRubrics.forEach(match => {
      if (!symptomMatchMap.has(match.symptom)) {
        symptomMatchMap.set(match.symptom, match);
      }
    });

    exactSymptoms.forEach((symptom, index) => {
      const match = symptomMatchMap.get(symptom);
      const status = match ? '✅' : '❌';
      console.log(`${status} ${index + 1}. "${symptom}"`);
      if (match) {
        console.log(`   → ${match.chapter?.en} - ${match.rubric?.en}`);
        console.log(`   → Confidence: ${match.confidence}% | Medicines: ${Object.keys(match.medicines || {}).length}`);
      }
    });

    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testExactSymptoms();
