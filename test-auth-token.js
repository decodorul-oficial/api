/**
 * Test pentru obținerea unui token de autentificare și testarea query-ului
 */

// Să obțin valorile din .env fără să folosesc source
import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const env = {};
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('=')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=');
        env[key.trim()] = value.trim();
      }
    });
    
    return env;
  } catch (error) {
    console.error('Eroare la citirea fișierului .env:', error.message);
    return {};
  }
}

const env = loadEnv();

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// URL-ul API-ului GraphQL
const API_URL = 'http://localhost:4000/graphql';

/**
 * Execută o query GraphQL
 */
async function executeGraphQL(query, variables = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();
  return result;
}

/**
 * Autentificare utilizator cu Supabase REST API
 */
async function authenticateUser(email, password) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY nu sunt setate în .env');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Authentication failed: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

/**
 * Test principal
 */
async function testWithRealAuth() {
  try {
    console.log('🧪 Test cu autentificare reală pentru câmpul favoriteNews\n');
    console.log('SUPABASE_URL:', SUPABASE_URL);
    console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
    console.log('');

    // 1. Autentificare utilizator
    console.log('1. Autentificare utilizator...');
    const token = await authenticateUser('radu.nie@gmail.com', 'Diverse06@@');
    console.log('✅ Autentificare reușită');
    console.log('Token (primele 20 caractere):', token ? token.substring(0, 20) + '...' : 'Token is undefined');
    console.log('');

    // 2. Test query GetMyProfile
    console.log('2. Test query GetMyProfile cu câmpul favoriteNews...');
    const profileQuery = `
      query GetMyProfile {
        me {
          id
          email
          profile {
            id
            subscriptionTier
            displayName
            avatarUrl
            createdAt
            updatedAt
            
            # Testez câmpul favoriteNews
            favoriteNews
          }
        }
      }
    `;

    const result = await executeGraphQL(profileQuery, {}, token);
    
    console.log('📊 Răspunsul complet:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // 3. Verifică dacă câmpul favoriteNews există
    if (result.data && result.data.me && result.data.me.profile) {
      const favoriteNews = result.data.me.profile.favoriteNews;
      console.log('🔍 Verificare câmp favoriteNews:');
      console.log('Existe câmpul favoriteNews?', favoriteNews !== undefined);
      console.log('Tipul câmpului:', typeof favoriteNews);
      console.log('Valoarea câmpului:', favoriteNews);
      console.log('Este array?', Array.isArray(favoriteNews));
      console.log('');

      if (favoriteNews !== undefined) {
        console.log('✅ SUCCESS: Câmpul favoriteNews este prezent în profil!');
        console.log('Numărul de știri favorite:', Array.isArray(favoriteNews) ? favoriteNews.length : 'N/A');
      } else {
        console.log('❌ ERROR: Câmpul favoriteNews lipsește din profil!');
      }
    } else if (result.errors) {
      console.log('❌ Erori GraphQL:');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
      });
    } else {
      console.log('❌ ERROR: Răspunsul nu conține datele așteptate!');
    }

  } catch (error) {
    console.error('❌ Eroare la testarea funcționalității:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Execută testul
testWithRealAuth()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });
