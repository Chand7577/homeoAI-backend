const axios = require('axios');

const API_URL = 'https://homeoai-backend-83yt.onrender.com/api';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function testMastersheet() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    const token = loginResponse.data.token;

    // Get Mastersheet repertory
    const repertoriesResponse = await axios.get(`${API_URL}/repertories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const mastersheet = repertoriesResponse.data.data.find(r => r.name === 'Mastersheet');
    if (!mastersheet) {
      console.error('❌ Mastersheet repertory not found!');
      return;
    }

    console.log(`✅ Using Mastersheet repertory (ID: ${mastersheet._id})`);
    console.log('   Total rubrics: 6,635\n');

    // First, let's search for rubrics containing the failed symptoms
    const failedSymptoms = ['Fever', 'Chill', 'Insomnia', 'Headache'];
    
    console.log('🔍 Step 1: Searching for rubrics in Mastersheet...\n');
    
    const foundRubrics = [];
    
    for (const symptom of failedSymptoms) {
      console.log(`📋 Searching for "${symptom}"...`);
      try {
        const searchResponse = await axios.get(
          `${API_URL}/rubrics?repertoryId=${mastersheet._id}&search=${symptom}&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const rubrics = searchResponse.data.data || [];
        console.log(`   Found ${searchResponse.data.total || 0} rubrics matching "${symptom}"`);
        
        if (rubrics.length > 0) {
          console.log('   Sample rubrics:');
          rubrics.slice(0, 3).forEach((r, i) => {
            const rubricText = r.rubric?.en || r.rubric?.hi || 'N/A';
            const medCount = r.medicines ? Object.keys(r.medicines).length : 0;
            console.log(`      ${i + 1}. ${rubricText.substring(0, 80)}`);
            console.log(`         Chapter: ${r.chapter?.en || 'N/A'} | Medicines: ${medCount}`);
            
            // Store first rubric for testing
            if (i === 0) {
              foundRubrics.push({
                symptom: symptom,
                rubric: rubricText,
                chapter: r.chapter?.en
              });
            }
          });
        } else {
          console.log(`   ⚠️  No rubrics found for "${symptom}"`);
        }
        console.log('');
      } catch (err) {
        console.error(`   ❌ Error searching: ${err.response?.data?.message || err.message}\n`);
      }
    }

    if (foundRubrics.length === 0) {
      console.log('❌ No rubrics found for any of the failed symptoms!');
      return;
    }

    console.log('='.repeat(70));
    console.log('🧪 Step 2: Testing analysis with found rubrics');
    console.log('='.repeat(70));
    console.log('');

    // Now test analysis with the actual rubric texts we found
    const testSymptoms = foundRubrics.map(r => r.rubric);
    
    console.log('Testing with these rubrics:');
    testSymptoms.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.substring(0, 80)}`);
    });
    console.log('\n⏳ Running analysis...\n');

    const startTime = Date.now();
    const analysisResponse = await axios.post(
      `${API_URL}/analysis/run`,
      {
        repertoryId: mastersheet._id,
        symptoms: testSymptoms,
        patientName: 'Test Patient'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const duration = Date.now() - startTime;

    const result = analysisResponse.data.data;

    console.log('='.repeat(70));
    console.log('📊 ANALYSIS RESULTS WITH MASTERSHEET');
    console.log('='.repeat(70));
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`🤖 AI used: ${result.aiUsed ? 'YES' : 'NO'}`);
    console.log(`✅ Matched rubrics: ${result.matchedRubrics.length}/${testSymptoms.length}`);
    console.log(`💊 Medicines found: ${result.medicineDistribution.length}`);
    console.log('');

    const symptomMatchMap = new Map();
    result.matchedRubrics.forEach(match => {
      if (!symptomMatchMap.has(match.symptom)) {
        symptomMatchMap.set(match.symptom, match);
      }
    });

    console.log('📋 DETAILED RESULTS:');
    console.log('-'.repeat(70));
    
    let successCount = 0;
    testSymptoms.forEach((symptom, index) => {
      const match = symptomMatchMap.get(symptom);
      const status = match ? '✅' : '❌';
      
      console.log(`${status} ${index + 1}. "${symptom.substring(0, 60)}..."`);
      
      if (match) {
        successCount++;
        console.log(`   → Chapter: ${match.chapter?.en || 'N/A'}`);
        console.log(`   → Rubric: ${match.rubric?.en || 'N/A'}`);
        console.log(`   → Confidence: ${match.confidence}%`);
        const medCount = Object.keys(match.medicines || {}).length;
        console.log(`   → Medicines: ${medCount}`);
        if (medCount > 0) {
          const topMeds = Object.entries(match.medicines)
            .slice(0, 3)
            .map(([name, grade]) => `${name}(${grade})`)
            .join(', ');
          console.log(`   → Top medicines: ${topMeds}`);
        }
      } else {
        console.log(`   → ⚠️  NO MATCH FOUND`);
      }
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('📈 FINAL SUMMARY:');
    console.log(`   ✅ Success rate: ${successCount}/${testSymptoms.length} (${(successCount/testSymptoms.length*100).toFixed(1)}%)`);
    
    if (successCount === testSymptoms.length) {
      console.log('   🎉 ALL SYMPTOMS MATCHED SUCCESSFULLY!');
    } else {
      console.log(`   ⚠️  ${testSymptoms.length - successCount} symptoms did not match`);
    }
    console.log('='.repeat(70));

    // Show top medicines
    if (result.medicineDistribution.length > 0) {
      console.log('');
      console.log('💊 TOP 10 RECOMMENDED MEDICINES:');
      console.log('-'.repeat(70));
      result.medicineDistribution.slice(0, 10).forEach((med, i) => {
        console.log(`${i + 1}. ${med.name}`);
        console.log(`   Score: ${med.totalScore} | Rubrics: ${med.rubricsCount} | Avg Grade: ${(med.totalScore / med.rubricsCount).toFixed(2)}`);
      });
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMastersheet();
