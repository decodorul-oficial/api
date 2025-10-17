/**
 * Test script pentru verificarea bypass-ului CAPTCHA pentru utilizatori autentificați
 * cu abonament trial sau valid
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000/graphql';

// Token de test pentru un utilizator cu trial (înlocuiește cu un token real)
const TEST_TOKEN = process.env.TEST_TOKEN || 'your_test_token_here';

async function testCaptchaBypass() {
  console.log('🧪 Testing CAPTCHA bypass for authenticated users...\n');

  const mutation = `
    mutation CreateComment($input: CreateCommentInput!) {
      createComment(input: $input) {
        id
        content
        user {
          id
          profile {
            subscriptionTier
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      content: "Test comment pentru verificarea bypass-ului CAPTCHA",
      parentType: "STIRE",
      parentId: "1263"
    }
  };

  try {
    console.log('📤 Sending request with authentication token...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response body:', JSON.stringify(result, null, 2));

    if (result.errors) {
      console.log('❌ Errors found:');
      result.errors.forEach(error => {
        console.log(`  - ${error.message} (${error.extensions?.code})`);
      });
      
      if (result.errors.some(e => e.extensions?.code === 'CAPTCHA_REQUIRED')) {
        console.log('\n🚫 CAPTCHA bypass failed - still requiring CAPTCHA for authenticated user');
        return false;
      }
    } else if (result.data?.createComment) {
      console.log('\n✅ CAPTCHA bypass successful - comment created without CAPTCHA');
      return true;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  }
}

async function testWithoutAuth() {
  console.log('\n🧪 Testing CAPTCHA requirement for unauthenticated users...\n');

  const mutation = `
    mutation CreateComment($input: CreateCommentInput!) {
      createComment(input: $input) {
        id
        content
      }
    }
  `;

  const variables = {
    input: {
      content: "Test comment fără autentificare",
      parentType: "STIRE", 
      parentId: "1263"
    }
  };

  try {
    console.log('📤 Sending request without authentication token...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response body:', JSON.stringify(result, null, 2));

    if (result.errors && result.errors.some(e => e.extensions?.code === 'CAPTCHA_REQUIRED')) {
      console.log('\n✅ CAPTCHA correctly required for unauthenticated user');
      return true;
    } else if (result.data?.createComment) {
      console.log('\n❌ CAPTCHA bypass incorrectly applied to unauthenticated user');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting CAPTCHA bypass tests...\n');
  
  const test1 = await testCaptchaBypass();
  const test2 = await testWithoutAuth();
  
  console.log('\n📊 Test Results:');
  console.log(`  - Authenticated user bypass: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  - Unauthenticated user requirement: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 All tests passed! CAPTCHA bypass is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the implementation.');
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testCaptchaBypass, testWithoutAuth, runTests };
