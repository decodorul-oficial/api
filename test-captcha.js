/**
 * Test pentru implementarea reCAPTCHA v3
 * Acest script testează middleware-ul captcha și integrarea cu API-ul
 */

import fetch from 'node-fetch';

// Configurația pentru test
const API_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword123';

/**
 * Testează signup fără captcha token
 */
async function testSignupWithoutCaptcha() {
  console.log('🧪 Test 1: SignUp fără captcha token...');
  
  const mutation = `
    mutation SignUp($input: SignUpInput!) {
      signUp(input: $input) {
        token
        user {
          id
          email
        }
      }
    }
  `;

  const variables = {
    input: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      recaptchaToken: "test_token_12345"
    }
  };

  try {
    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: mutation,
        variables
      })
    });

    const result = await response.json();
    
    if (result.errors && result.errors[0].extensions?.code === 'CAPTCHA_REQUIRED') {
      console.log('✅ Test 1 PASSED: Captcha token required error returned');
      return true;
    } else {
      console.log('❌ Test 1 FAILED: Expected captcha error, got:', result);
      return false;
    }
  } catch (error) {
    console.log('❌ Test 1 FAILED: Network error:', error.message);
    return false;
  }
}

/**
 * Testează signup cu captcha token invalid
 */
async function testSignupWithInvalidCaptcha() {
  console.log('🧪 Test 2: SignUp cu captcha token invalid...');
  
  const mutation = `
    mutation SignUp($input: SignUpInput!) {
      signUp(input: $input) {
        token
        user {
          id
          email
        }
      }
    }
  `;

  const variables = {
    input: {
      email: TEST_EMAIL + '2',
      password: TEST_PASSWORD,
      recaptchaToken: "invalid_token_12345"
    }
  };

  try {
    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Captcha-Token': 'invalid_token_12345'
      },
      body: JSON.stringify({
        query: mutation,
        variables
      })
    });

    const result = await response.json();
    
    if (result.errors && result.errors[0].extensions?.code === 'CAPTCHA_INVALID') {
      console.log('✅ Test 2 PASSED: Invalid captcha error returned');
      return true;
    } else {
      console.log('❌ Test 2 FAILED: Expected captcha invalid error, got:', result);
      return false;
    }
  } catch (error) {
    console.log('❌ Test 2 FAILED: Network error:', error.message);
    return false;
  }
}

/**
 * Testează signin fără captcha token
 */
async function testSigninWithoutCaptcha() {
  console.log('🧪 Test 3: SignIn fără captcha token...');
  
  const mutation = `
    mutation SignIn($input: SignInInput!) {
      signIn(input: $input) {
        token
        user {
          id
          email
        }
      }
    }
  `;

  const variables = {
    input: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      recaptchaToken: "test_token_12345"
    }
  };

  try {
    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: mutation,
        variables
      })
    });

    const result = await response.json();
    
    if (result.errors && result.errors[0].extensions?.code === 'CAPTCHA_REQUIRED') {
      console.log('✅ Test 3 PASSED: Captcha token required error returned');
      return true;
    } else {
      console.log('❌ Test 3 FAILED: Expected captcha error, got:', result);
      return false;
    }
  } catch (error) {
    console.log('❌ Test 3 FAILED: Network error:', error.message);
    return false;
  }
}

/**
 * Testează o operațiune care nu necesită captcha
 */
async function testNonSensitiveOperation() {
  console.log('🧪 Test 4: Operațiune care nu necesită captcha...');
  
  const query = `
    query {
      getStiri(limit: 5) {
        stiri {
          id
          title
        }
        pagination {
          totalCount
        }
      }
    }
  `;

  try {
    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query
      })
    });

    const result = await response.json();
    
    if (result.data && result.data.getStiri) {
      console.log('✅ Test 4 PASSED: Non-sensitive operation works without captcha');
      return true;
    } else {
      console.log('❌ Test 4 FAILED: Expected data, got:', result);
      return false;
    }
  } catch (error) {
    console.log('❌ Test 4 FAILED: Network error:', error.message);
    return false;
  }
}

/**
 * Testează health endpoint
 */
async function testHealthEndpoint() {
  console.log('🧪 Test 5: Health endpoint...');
  
  try {
    const response = await fetch(`${API_URL}/health`);
    const result = await response.json();
    
    if (result.status === 'healthy') {
      console.log('✅ Test 5 PASSED: Health endpoint works');
      return true;
    } else {
      console.log('❌ Test 5 FAILED: Health endpoint returned:', result);
      return false;
    }
  } catch (error) {
    console.log('❌ Test 5 FAILED: Network error:', error.message);
    return false;
  }
}

/**
 * Rulează toate testele
 */
async function runAllTests() {
  console.log('🚀 Pornire teste reCAPTCHA v3...\n');
  
  const tests = [
    testHealthEndpoint,
    testNonSensitiveOperation,
    testSignupWithoutCaptcha,
    testSignupWithInvalidCaptcha,
    testSigninWithoutCaptcha
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    console.log(''); // Linie goală între teste
  }

  console.log('📊 Rezultate teste:');
  console.log(`✅ ${passed}/${total} teste au trecut`);
  
  if (passed === total) {
    console.log('🎉 Toate testele au trecut! Implementarea captcha funcționează corect.');
  } else {
    console.log('⚠️  Unele teste au eșuat. Verifică configurația și implementarea.');
  }

  return passed === total;
}

// Rulează testele dacă scriptul este executat direct
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Eroare la rularea testelor:', error);
    process.exit(1);
  });
}

export { runAllTests };
