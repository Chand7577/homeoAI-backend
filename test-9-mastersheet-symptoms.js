const axios = require('axios');

const API_URL = 'https://homeoai-backend-83yt.onrender.com/api';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function test9Symptoms() {
  try {
    console.log('='.repeat(70));
    console.log('🧪 TESTING 9 SYMPTOMS WITH MASTERSHEET');
    console.log('='.repeat(70));
    console.log('');

    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    const token = loginResponse.data.token;
    console.log('✅ Login successful!\n');

    // Get Mastersheet repertory
    const repertoriesResponse = await axios.get(`${API_URL}/repertories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const mastersheet = repertoriesResponse.data.data.find(r => r.name === 'Mastersheet');
    if (!mastersheet) {
      console.error('❌ Mastersheet repertory not found!');
      return;
    }

    console.log(`✅ Using Mastersheet repertory`);
    console.log(`   ID: ${mastersheet._id}`);
    console.log(`   Total rubrics: 6,635\n`);

    // Use 9 symptoms that we know exist in Mastersheet
    const nineSymptoms = [
      'Back pain during fever chills',
      'Hormonal insomnia',
      'Back pain during headache',
      'Abdominal pain burning during fever',
      'Chest pain cold exposure',
      'Menopause insomnia',
      'Fever with sleeplessness',
      'Ear pain during headache',
      'Chest pain during cold'
    ];

    console.log('🔍 Testing with 9 symptoms from Mastersheet:');
    nineSymptoms.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
    console.log('\n⏳ Running analysis...\n');

    const startTime = Date.now();
    const analysisResponse = await axios.post(
      `${API_URL}/analysis/run`,
      {
        repertoryId: mastersheet._id,
        symptoms: nineSymptoms,
        patientName: 'Test Patient - 9 Symptoms',
        patientAge: '35',
        patientGender: 'Male'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const duration = Date.now() - startTime;

    const result = analysisResponse.data.data;

    console.log('='.repeat(70));
    console.log('📊 ANALYSIS RESULTS');
    console.log('='.repeat(70));
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`🆔 Analysis ID: ${result.analysisId}`);
    console.log(`🤖 AI used: ${result.aiUsed ? 'YES ✓' : 'NO (keyword fallback)'}`);
    console.log(`✅ Matched rubrics: ${result.matchedRubrics.length}/${nineSymptoms.length}`);
    console.log(`💊 Total medicines: ${result.medicineDistribution.length}`);
    console.log('');

    // Performance breakdown
    if (result.stats && result.stats.timingsMs) {
      console.log('⚡ PERFORMANCE BREAKDOWN:');
      console.log(`   - Candidate search: ${result.stats.timingsMs.candidates}ms`);
      console.log(`   - AI matching: ${result.stats.timingsMs.matching}ms`);
      console.log(`   - Medicine scoring: ${result.stats.timingsMs.enrichmentAndScoring}ms`);
      console.log(`   - Total: ${result.stats.timingsMs.total}ms`);
      console.log('');
    }

    // Build symptom match map
    const symptomMatchMap = new Map();
    result.matchedRubrics.forEach(match => {
      if (!symptomMatchMap.has(match.symptom)) {
        symptomMatchMap.set(match.symptom, match);
      }
    });

    console.log('📋 SYMPTOM-BY-SYMPTOM RESULTS:');
    console.log('-'.repeat(70));
    
    let successCount = 0;
    let totalMedicines = 0;

    nineSymptoms.forEach((symptom, index) => {
      const match = symptomMatchMap.get(symptom);
      const status = match ? '✅' : '❌';
      
      console.log(`${status} ${index + 1}. "${symptom}"`);
      
      if (match) {
        successCount++;
        const medCount = Object.keys(match.medicines || {}).length;
        totalMedicines += medCount;
        
        console.log(`   ├─ Chapter: ${match.chapter?.en || 'N/A'}`);
        console.log(`   ├─ Rubric: ${match.rubric?.en || 'N/A'}`);
        console.log(`   ├─ Confidence: ${match.confidence}%`);
        console.log(`   └─ Medicines: ${medCount}`);
        
        if (medCount > 0) {
          const topMeds = Object.entries(match.medicines)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([name, grade]) => `${name}(${grade})`)
            .join(', ');
          console.log(`      Top 3: ${topMeds}`);
        }
      } else {
        console.log(`   └─ ⚠️  NO MATCH FOUND`);
      }
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('📈 FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Success rate: ${successCount}/${nineSymptoms.length} symptoms (${(successCount/nineSymptoms.length*100).toFixed(1)}%)`);
    console.log(`💊 Total unique medicines: ${result.medicineDistribution.length}`);
    console.log(`📊 Avg medicines per symptom: ${(totalMedicines/successCount).toFixed(1)}`);
    console.log('');
    
    if (successCount === nineSymptoms.length) {
      console.log('🎉 🎉 🎉 SUCCESS! ALL 9 SYMPTOMS MATCHED! 🎉 🎉 🎉');
    } else if (successCount >= 7) {
      console.log('✅ GOOD: Most symptoms matched successfully');
    } else if (successCount >= 5) {
      console.log('⚠️  FAIR: More than half matched');
    } else {
      console.log('❌ POOR: Less than half matched');
    }
    console.log('='.repeat(70));

    // Show top 15 medicines
    if (result.medicineDistribution.length > 0) {
      console.log('');
      console.log('💊 TOP 15 RECOMMENDED MEDICINES (sorted by total score):');
      console.log('-'.repeat(70));
      result.medicineDistribution.slice(0, 15).forEach((med, i) => {
        const avgGrade = (med.totalScore / med.rubricsCount).toFixed(2);
        console.log(`${(i + 1).toString().padStart(2)}. ${med.name.padEnd(25)} | Score: ${med.totalScore.toString().padStart(2)} | Rubrics: ${med.rubricsCount} | Avg: ${avgGrade}`);
      });
      console.log('');
    }

    console.log('✅ Test completed successfully!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ ERROR OCCURRED');
    console.error('='.repeat(70));
    console.error('Message:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('='.repeat(70));
  }
}

test9Symptoms();
