const axios = require('axios');

// Render API URL
const API_URL = 'https://homeoai-backend-83yt.onrender.com/api';

// Admin credentials
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function checkDatabase() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    const token = loginResponse.data.token;
    console.log('✅ Login successful!\n');

    // Get repertories
    console.log('📚 Checking repertories...');
    const repertoriesResponse = await axios.get(`${API_URL}/repertories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`Found ${repertoriesResponse.data.data.length} repertories:\n`);
    
    for (const repertory of repertoriesResponse.data.data) {
      console.log(`📖 ${repertory.name}`);
      console.log(`   ID: ${repertory._id}`);
      console.log(`   Created: ${repertory.createdAt}`);
      console.log('');

      // Get rubrics count for this repertory
      console.log(`   Fetching rubrics for "${repertory.name}"...`);
      try {
        const rubricsResponse = await axios.get(
          `${API_URL}/rubrics?repertoryId=${repertory._id}&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log(`   ✅ Total rubrics: ${rubricsResponse.data.total || 0}`);
        
        if (rubricsResponse.data.data && rubricsResponse.data.data.length > 0) {
          console.log(`   📝 Sample rubrics:`);
          rubricsResponse.data.data.slice(0, 3).forEach((rubric, i) => {
            console.log(`      ${i + 1}. ${rubric.chapter?.en || 'N/A'} - ${rubric.rubric?.en || 'N/A'}`);
            const medCount = rubric.medicines ? Object.keys(rubric.medicines).length : 0;
            console.log(`         Medicines: ${medCount}`);
          });
        } else {
          console.log(`   ⚠️  NO RUBRICS FOUND IN THIS REPERTORY!`);
        }
      } catch (err) {
        console.error(`   ❌ Error fetching rubrics: ${err.response?.data?.message || err.message}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkDatabase();
