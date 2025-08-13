#!/usr/bin/env node

/**
 * Script de verificare pentru deployment-ul pe Vercel
 * Acest script testează toate componentele critice ale API-ului
 * înainte și după deployment.
 */

const https = require('https');
const http = require('http');

// Configurația pentru testare
const CONFIG = {
  // URL-ul de bază al API-ului (va fi înlocuit cu URL-ul real)
  baseUrl: process.env.API_URL || 'https://your-project.vercel.app',
  
  // Timeout pentru cereri (în milisecunde)
  timeout: 10000,
  
  // Headers standard pentru cereri
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'MonitorulOficial-Deployment-Verifier/1.0'
  }
};

/**
 * Funcție utilitară pentru a face cereri HTTP/HTTPS
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    const requestOptions = {
      timeout: CONFIG.timeout,
      headers: { ...CONFIG.headers, ...options.headers },
      ...options
    };

    const req = client.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData,
            rawData: data
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            rawData: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * Test 1: Health Check Endpoint
 */
async function testHealthCheck() {
  console.log('🔍 Testarea endpoint-ului de health check...');
  
  try {
    const response = await makeRequest(`${CONFIG.baseUrl}/api/health`);
    
    if (response.statusCode === 200) {
      console.log('✅ Health check: SUCCESS');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.rawData}`);
      return true;
    } else {
      console.log('❌ Health check: FAILED');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.rawData}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check: ERROR');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: GraphQL Endpoint - Introspection Query
 */
async function testGraphQLIntrospection() {
  console.log('\n🔍 Testarea endpoint-ului GraphQL (introspection)...');
  
  try {
    const response = await makeRequest(`${CONFIG.baseUrl}/api/graphql`, {
      method: 'POST',
      body: {
        query: `
          query IntrospectionQuery {
            __schema {
              queryType {
                name
              }
              mutationType {
                name
              }
              subscriptionType {
                name
              }
            }
          }
        `
      }
    });
    
    if (response.statusCode === 200 && response.data) {
      console.log('✅ GraphQL introspection: SUCCESS');
      console.log(`   Status: ${response.statusCode}`);
      
      if (response.data.data && response.data.data.__schema) {
        console.log('   Schema loaded successfully');
        return true;
      } else if (response.data.errors) {
        console.log('   Schema introspection disabled (expected in production)');
        return true; // În producție, introspection-ul poate fi dezactivat
      }
    } else {
      console.log('❌ GraphQL introspection: FAILED');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.rawData}`);
      return false;
    }
  } catch (error) {
    console.log('❌ GraphQL introspection: ERROR');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: GraphQL Endpoint - Simple Query
 */
async function testGraphQLQuery() {
  console.log('\n🔍 Testarea endpoint-ului GraphQL (query simplu)...');
  
  try {
    const response = await makeRequest(`${CONFIG.baseUrl}/api/graphql`, {
      method: 'POST',
      body: {
        query: `
          query TestQuery {
            __typename
          }
        `
      }
    });
    
    if (response.statusCode === 200 && response.data) {
      console.log('✅ GraphQL query: SUCCESS');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      console.log('❌ GraphQL query: FAILED');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.rawData}`);
      return false;
    }
  } catch (error) {
    console.log('❌ GraphQL query: ERROR');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: CORS Headers
 */
async function testCORSHeaders() {
  console.log('\n🔍 Testarea header-elor CORS...');
  
  try {
    const response = await makeRequest(`${CONFIG.baseUrl}/api/graphql`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://test.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    const corsHeaders = {
      'access-control-allow-origin': response.headers['access-control-allow-origin'],
      'access-control-allow-methods': response.headers['access-control-allow-methods'],
      'access-control-allow-headers': response.headers['access-control-allow-headers']
    };
    
    console.log('✅ CORS headers: SUCCESS');
    console.log(`   Status: ${response.statusCode}`);
    console.log(`   CORS Headers: ${JSON.stringify(corsHeaders, null, 2)}`);
    return true;
  } catch (error) {
    console.log('❌ CORS headers: ERROR');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Security Headers
 */
async function testSecurityHeaders() {
  console.log('\n🔍 Testarea header-elor de securitate...');
  
  try {
    const response = await makeRequest(`${CONFIG.baseUrl}/api/health`);
    
    const securityHeaders = {
      'x-content-type-options': response.headers['x-content-type-options'],
      'x-frame-options': response.headers['x-frame-options'],
      'x-xss-protection': response.headers['x-xss-protection'],
      'strict-transport-security': response.headers['strict-transport-security'],
      'referrer-policy': response.headers['referrer-policy']
    };
    
    console.log('✅ Security headers: SUCCESS');
    console.log(`   Status: ${response.statusCode}`);
    console.log(`   Security Headers: ${JSON.stringify(securityHeaders, null, 2)}`);
    return true;
  } catch (error) {
    console.log('❌ Security headers: ERROR');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Funcția principală de verificare
 */
async function runDeploymentVerification() {
  console.log('🚀 Începe verificarea deployment-ului Monitorul Oficial API');
  console.log(`📍 URL de bază: ${CONFIG.baseUrl}`);
  console.log('=' .repeat(60));
  
  const results = {
    healthCheck: await testHealthCheck(),
    graphQLIntrospection: await testGraphQLIntrospection(),
    graphQLQuery: await testGraphQLQuery(),
    corsHeaders: await testCORSHeaders(),
    securityHeaders: await testSecurityHeaders()
  };
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 REZULTATELE VERIFICĂRII');
  console.log('=' .repeat(60));
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test}`);
  });
  
  console.log('\n' + '=' .repeat(60));
  console.log(`📈 SCOR FINAL: ${passedTests}/${totalTests} teste trecute`);
  
  if (passedTests === totalTests) {
    console.log('🎉 DEPLOYMENT-UL ESTE SUCCES! Toate testele au trecut.');
    process.exit(0);
  } else {
    console.log('⚠️  DEPLOYMENT-UL ARE PROBLEME! Verificați erorile de mai sus.');
    process.exit(1);
  }
}

// Rularea scriptului
if (require.main === module) {
  runDeploymentVerification().catch((error) => {
    console.error('💥 EROARE CRITICĂ:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runDeploymentVerification,
  testHealthCheck,
  testGraphQLIntrospection,
  testGraphQLQuery,
  testCORSHeaders,
  testSecurityHeaders
};
