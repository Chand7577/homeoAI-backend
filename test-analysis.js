require('dotenv').config();
const mongoose = require('mongoose');
const { runAnalysis } = require('./services/aiService');
const Repertory = require('./models/Repertory');

async function testAnalysis() {
  try {
    // Use the correct MongoDB URI from .env (MONGO_URI, not MONGODB_URI)
    const mongoUri = process.env.MONGO_URI || 'mongodb://amrit:12345@ac-elas1fp-shard-00-00.mchavx4.mongodb.net:27017,ac-elas1fp-shard-00-01.mchavx4.mongodb.net:27017,ac-elas1fp-shard-00-02.mchavx4.mongodb.net:27017/?ssl=true&replicaSet=atlas-n4fsmu-shard-0&authSource=admin&appName=Cluster0';
    
    console.log('🔗 Connecting to MongoDB...');
    console.log(`📍 Using URI: ${mongoUri.replace(/:[^:@]+@/, ':****@')}`); // Hide password
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get the first repertory (mastersheet)
    const repertory = await Repertory.findOne();
    if (!repertory) {
      console.error('❌ No repertory found in database');
      process.exit(1);
    }

    console.log(`📚 Using repertory: ${repertory.name} (ID: ${repertory._id})\n`);

    // Test with 9 symptoms
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

    console.log('🔍 Testing analysis with 9 symptoms:');
    testSymptoms.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('');

    console.log('⏳ Running analysis...\n');
    const startTime = Date.now();
    
    const result = await runAnalysis({
      symptoms: testSymptoms,
      repertoryId: repertory._id,
      repertoryName: repertory.name
    });

    const duration = Date.now() - startTime;

    console.log('='.repeat(70));
    console.log('📊 ANALYSIS RESULTS');
    console.log('='.repeat(70));
    console.log(`⏱️  Total time: ${duration}ms`);
    console.log(`🤖 AI used: ${result.aiUsed ? 'YES' : 'NO (keyword fallback)'}`);
    console.log(`✅ Total matched rubrics: ${result.matchedRubrics.length}`);
    console.log(`💊 Medicines found: ${result.medicineDistribution.length}`);
    console.log('');

    // Check if all symptoms got results
    console.log('📋 SYMPTOM MATCH BREAKDOWN:');
    console.log('-'.repeat(70));
    
    const symptomMatchCount = {};
    testSymptoms.forEach(s => {
      symptomMatchCount[s] = 0;
    });

    result.matchedRubrics.forEach(match => {
      const symptom = match.symptom;
      if (symptomMatchCount.hasOwnProperty(symptom)) {
        symptomMatchCount[symptom]++;
      }
    });

    let allSymptomsCovered = true;
    testSymptoms.forEach((symptom, index) => {
      const count = symptomMatchCount[symptom];
      const status = count > 0 ? '✅' : '❌';
      console.log(`${status} ${index + 1}. "${symptom}"`);
      if (count > 0) {
        console.log(`   → Matched rubric: ${result.matchedRubrics.find(r => r.symptom === symptom)?.rubric?.en || 'N/A'}`);
        console.log(`   → Confidence: ${result.matchedRubrics.find(r => r.symptom === symptom)?.confidence}%`);
        const medicineCount = Object.keys(result.matchedRubrics.find(r => r.symptom === symptom)?.medicines || {}).length;
        console.log(`   → Medicines: ${medicineCount}`);
      } else {
        console.log(`   → NO MATCH FOUND`);
        allSymptomsCovered = false;
      }
      console.log('');
    });

    console.log('='.repeat(70));
    if (allSymptomsCovered) {
      console.log('✅ SUCCESS: All 9 symptoms returned matches!');
    } else {
      console.log('⚠️  WARNING: Some symptoms did not return matches!');
    }
    console.log('='.repeat(70));

    // Show top 10 medicines
    if (result.medicineDistribution.length > 0) {
      console.log('\n💊 TOP 10 RECOMMENDED MEDICINES:');
      console.log('-'.repeat(70));
      result.medicineDistribution.slice(0, 10).forEach((med, i) => {
        console.log(`${i + 1}. ${med.name}`);
        console.log(`   Score: ${med.totalScore} | Rubrics: ${med.rubricsCount} | Avg Grade: ${(med.totalScore / med.rubricsCount).toFixed(2)}`);
      });
    }

    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testAnalysis();
