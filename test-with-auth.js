/**
 * Test cu autentificare reală pentru verificarea câmpului favoriteNews
 */

// URL-ul API-ului GraphQL
const API_URL = 'http://localhost:4000/graphql';

// Credențiale hardcodate pentru testare
const SUPABASE_URL = 'https://your-project-id.supabase.co'; // Va fi înlocuit cu valoarea reală
const SUPABASE_ANON_KEY = 'your-anon-key-here'; // Va fi înlocuit cu valoarea reală

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
 * Autentificare utilizator cu fetch direct la Supabase
 */
async function authenticateUser(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Authentication failed: ${data.error_description}`);
  }

  return data.access_token;
}

/**
 * Test principal
 */
async function testWithAuth() {
  try {
    console.log('🧪 Test cu autentificare reală pentru câmpul favoriteNews\n');

    // 1. Autentificare utilizator
    console.log('1. Autentificare utilizator...');
    let token;
    try {
      token = await authenticateUser('radu.nie@gmail.com', 'Diverse06@@');
      console.log('✅ Autentificare reușită');
    } catch (error) {
      console.log('⚠️ Eroare la autentificare:', error.message);
      console.log('Continuăm cu testul fără autentificare...');
      token = null;
    }
    console.log('');

    // 2. Test query GetMyProfile
    console.log('2. Test query GetMyProfile...');
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
            isNewsletterSubscribed
            createdAt
            updatedAt
            
            # Testez câmpul favoriteNews
            favoriteNews
            
            trialStatus {
              isTrial
              hasTrial
              trialStart
              trialEnd
              tierId
              daysRemaining
              expired
            }
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
        console.log('Numărul de știri favorite:', favoriteNews.length);
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
    console.error('Detalii:', error);
  }
}

// Execută testul
testWithAuth()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });
