const axios = require('axios');

// Render API URL (correct URL from frontend config)
const API_URL = 'https://homeoai-backend-83yt.onrender.com/api';

// Admin credentials
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function testAnalysisAPI() {
  try {
    console.log('='.repeat(70));
    console.log('🧪 TESTING ANALYSIS API ON RENDER');
    console.log('='.repeat(70));
    console.log('');

    // Step 1: Login to get token
    console.log('🔐 Step 1: Logging in as admin...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    const token = loginResponse.data.token;
    console.log('✅ Login successful!');
    console.log(`👤 User: ${loginResponse.data.user.name} (${loginResponse.data.user.email})`);
    console.log('');

    // Step 2: Get repertories to find repertoryId
    console.log('📚 Step 2: Fetching repertories...');
    const repertoriesResponse = await axios.get(`${API_URL}/repertories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (repertoriesResponse.data.data.length === 0) {
      console.error('❌ No repertories found in database!');
      return;
    }

    // Find a repertory with rubrics (prefer Mastersheet, KENT, or Therapeu)
    const repertoriesWithRubrics = ['Mastersheet', 'KENT', 'Therapeu', 'Classical'];
    let repertory = repertoriesResponse.data.data.find(r => 
      repertoriesWithRubrics.includes(r.name)
    );

    // Fallback to first repertory if none found
    if (!repertory) {
      repertory = repertoriesResponse.data.data[0];
    }

    console.log(`✅ Using repertory: ${repertory.name}`);
    console.log(`   ID: ${repertory._id}`);
    console.log('');

    // First check if this repertory has rubrics
    console.log('🔍 Checking if repertory has rubrics...');
    const rubricCheckResponse = await axios.get(
      `${API_URL}/rubrics?repertoryId=${repertory._id}&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const totalRubrics = rubricCheckResponse.data.total || 0;
    console.log(`✅ Repertory has ${totalRubrics} rubrics`);
    
    if (totalRubrics === 0) {
      console.error(`❌ ERROR: Repertory "${repertory.name}" is EMPTY! Cannot test analysis.`);
      console.error('   Please select a different repertory or upload rubrics first.');
      return;
    }
    console.log('');

    // Step 3: Run analysis with 9 symptoms
    const testSymptoms = [
      'headache with nausea',
      'burning pain in stomach',
      'anxiety at night',
      'restlessness',
      'weakness in legs',
      'thirst for cold water',
      'fever with chills',
      'sleeplessness',
      'irritability'
    ];

    console.log('🔍 Step 3: Running analysis with 9 symptoms:');
    testSymptoms.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
    console.log('');

    console.log('⏳ Sending analysis request to Render...');
    const startTime = Date.now();

    const analysisResponse = await axios.post(
      `${API_URL}/analysis/run`,
      {
        repertoryId: repertory._id,
        symptoms: testSymptoms,
        patientName: 'Test Patient',
        patientAge: '30',
        patientGender: 'Male'
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const duration = Date.now() - startTime;
    const result = analysisResponse.data.data;

    console.log('='.repeat(70));
    console.log('📊 ANALYSIS RESULTS FROM RENDER');
    console.log('='.repeat(70));
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`🆔 Analysis ID: ${result.analysisId}`);
    console.log(`📚 Repertory: ${result.repertoryName}`);
    console.log(`🤖 AI used: ${result.aiUsed ? 'YES' : 'NO (keyword fallback)'}`);
    console.log(`✅ Total matched rubrics: ${result.matchedRubrics.length}`);
    console.log(`💊 Medicines found: ${result.medicineDistribution.length}`);
    console.log('');

    // Performance stats
    if (result.stats && result.stats.timingsMs) {
      console.log('⚡ PERFORMANCE BREAKDOWN:');
      console.log(`   - Candidate search: ${result.stats.timingsMs.candidates}ms`);
      console.log(`   - AI matching: ${result.stats.timingsMs.matching}ms`);
      console.log(`   - Medicine scoring: ${result.stats.timingsMs.enrichmentAndScoring}ms`);
      console.log(`   - Total: ${result.stats.timingsMs.total}ms`);
      console.log('');
    }

    // Check if all symptoms got results
    console.log('📋 SYMPTOM MATCH BREAKDOWN:');
    console.log('-'.repeat(70));

    const symptomMatchMap = new Map();
    result.matchedRubrics.forEach(match => {
      if (!symptomMatchMap.has(match.symptom)) {
        symptomMatchMap.set(match.symptom, []);
      }
      symptomMatchMap.get(match.symptom).push(match);
    });

    let allSymptomsCovered = true;
    let symptomsWithMatches = 0;
    let symptomsWithoutMatches = 0;

    testSymptoms.forEach((symptom, index) => {
      const matches = symptomMatchMap.get(symptom);
      const hasMatch = matches && matches.length > 0;
      const status = hasMatch ? '✅' : '❌';

      console.log(`${status} ${index + 1}. "${symptom}"`);

      if (hasMatch) {
        symptomsWithMatches++;
        const match = matches[0];
        console.log(`   → Chapter: ${match.chapter?.en || 'N/A'}`);
        console.log(`   → Rubric: ${match.rubric?.en || 'N/A'}`);
        console.log(`   → Confidence: ${match.confidence}%`);
        const medicineCount = Object.keys(match.medicines || {}).length;
        console.log(`   → Medicines: ${medicineCount}`);
        if (medicineCount > 0) {
          const topMeds = Object.entries(match.medicines).slice(0, 3).map(([name, grade]) => `${name}(${grade})`).join(', ');
          console.log(`   → Top medicines: ${topMeds}`);
        }
      } else {
        symptomsWithoutMatches++;
        console.log(`   → ⚠️  NO MATCH FOUND`);
        allSymptomsCovered = false;
      }
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('📈 SUMMARY:');
    console.log(`   Total symptoms tested: ${testSymptoms.length}`);
    console.log(`   ✅ Symptoms with matches: ${symptomsWithMatches}`);
    console.log(`   ❌ Symptoms without matches: ${symptomsWithoutMatches}`);
    console.log('');

    if (allSymptomsCovered) {
      console.log('🎉 SUCCESS: All 9 symptoms returned matches!');
    } else {
      console.log('⚠️  WARNING: Some symptoms did not return matches!');
      console.log('   This could indicate:');
      console.log('   - Symptoms not in the mastersheet/repertory');
      console.log('   - AI matching confidence too low');
      console.log('   - Database query not finding relevant rubrics');
    }
    console.log('='.repeat(70));

    // Show top 10 medicines
    if (result.medicineDistribution.length > 0) {
      console.log('');
      console.log('💊 TOP 10 RECOMMENDED MEDICINES:');
      console.log('-'.repeat(70));
      result.medicineDistribution.slice(0, 10).forEach((med, i) => {
        console.log(`${i + 1}. ${med.name}`);
        console.log(`   Score: ${med.totalScore} | Rubrics: ${med.rubricsCount} | Avg Grade: ${(med.totalScore / med.rubricsCount).toFixed(2)}`);
      });
      console.log('');
    }

    console.log('✅ Test completed successfully!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ ERROR OCCURRED:');
    console.error('='.repeat(70));
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data.message || error.response.statusText}`);
      console.error(`Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`Message: ${error.message}`);
      console.error(`Stack:`, error.stack);
    }
    console.error('='.repeat(70));
  }
}

// Run the test
console.log('');
testAnalysisAPI();
