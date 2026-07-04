const axios = require('axios');

const BASE_URL = 'https://homeoai-backend-83yt.onrender.com/api';

async function testChatContactsEndpoint() {
  console.log('🔐 Testing Chat Contacts Endpoint Fix\n');

  try {
    // Step 1: Login as admin
    console.log('1️⃣ Logging in as admin...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@gmail.com',
      password: 'admin'
    }, {
      withCredentials: true,
      validateStatus: () => true
    });

    if (!loginRes.data.success) {
      console.error('❌ Login failed:', loginRes.data.message);
      return;
    }

    console.log('✅ Login successful');
    console.log('   User:', loginRes.data.user.name);
    console.log('   Role:', loginRes.data.user.role);
    console.log('   Cookie:', loginRes.headers['set-cookie']?.[0]?.split(';')[0] || 'No cookie');

    // Extract cookie
    const cookie = loginRes.headers['set-cookie']?.[0];
    if (!cookie) {
      console.error('❌ No cookie received from login');
      return;
    }

    // Step 2: Call getChatContacts endpoint
    console.log('\n2️⃣ Calling /api/auth/chat-contacts...');
    const contactsRes = await axios.get(`${BASE_URL}/auth/chat-contacts`, {
      headers: {
        Cookie: cookie
      },
      withCredentials: true,
      validateStatus: () => true
    });

    console.log('   HTTP Status:', contactsRes.status);

    if (contactsRes.status === 500) {
      console.error('❌ 500 Internal Server Error - Backend crashed');
      console.error('   Response:', JSON.stringify(contactsRes.data, null, 2));
      return;
    }

    if (!contactsRes.data.success) {
      console.error('❌ Request failed:', contactsRes.data.message);
      return;
    }

    console.log('✅ Chat contacts fetched successfully!');
    console.log('\n📋 Contacts List:');
    console.log('   Total contacts:', contactsRes.data.users.length);
    
    if (contactsRes.data.users.length === 0) {
      console.log('   ⚠️  No patients found (this could be normal if no patients exist)');
    } else {
      console.log('\n   Contacts:');
      contactsRes.data.users.forEach((user, idx) => {
        console.log(`   ${idx + 1}. ${user.name} (${user.email})`);
        console.log(`      Role: ${user.role}`);
        console.log(`      Status: ${user.status}`);
        console.log(`      Active: ${user.isActive}`);
        if (user.lastMessage) {
          console.log(`      Last message: "${user.lastMessage}"`);
          console.log(`      Last message time: ${new Date(user.lastMessageTime).toLocaleString()}`);
        }
        console.log('');
      });
    }

    console.log('✅ Test completed successfully - No 500 error!');

  } catch (error) {
    console.error('❌ Test failed with error:');
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error:', error.message);
    }
  }
}

testChatContactsEndpoint();
