/**
 * Test simplu pentru verificarea câmpului favoriteNews
 */

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
 * Test principal
 */
async function testFavoriteNews() {
  try {
    console.log('🧪 Test pentru verificarea câmpului favoriteNews\n');

    // 1. Test query GetMyProfile fără autentificare (ar trebui să returneze eroare)
    console.log('1. Test query GetMyProfile fără autentificare...');
    const profileQuery = `
      query GetMyProfile {
        me {
          id
          email
          profile {
            id
            subscriptionTier
            displayName
            favoriteNews
          }
        }
      }
    `;

    const result = await executeGraphQL(profileQuery);
    
    console.log('📊 Răspunsul:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // Verifică dacă există erori de autentificare
    if (result.errors && result.errors.some(e => e.message.includes('neautentificat'))) {
      console.log('✅ SUCCESS: Serverul returnează eroarea de autentificare corect!');
    } else {
      console.log('❌ ERROR: Serverul nu returnează eroarea de autentificare!');
    }

    // 2. Test query cu un token invalid
    console.log('2. Test query cu token invalid...');
    const resultWithInvalidToken = await executeGraphQL(profileQuery, {}, 'invalid-token');
    
    console.log('📊 Răspunsul cu token invalid:');
    console.log(JSON.stringify(resultWithInvalidToken, null, 2));
    console.log('');

    // 3. Test query pentru a verifica dacă schema include câmpul favoriteNews
    console.log('3. Test query pentru schema...');
    const schemaQuery = `
      query {
        __schema {
          types {
            name
            fields {
              name
              type {
                name
              }
            }
          }
        }
      }
    `;

    const schemaResult = await executeGraphQL(schemaQuery);
    
    // Caută tipul Profile în schema
    const profileType = schemaResult.data?.__schema?.types?.find(type => type.name === 'Profile');
    
    if (profileType) {
      console.log('✅ Tipul Profile găsit în schema');
      
      // Caută câmpul favoriteNews în tipul Profile
      const favoriteNewsField = profileType.fields?.find(field => field.name === 'favoriteNews');
      
      if (favoriteNewsField) {
        console.log('✅ Câmpul favoriteNews găsit în tipul Profile!');
        console.log('Tipul câmpului:', favoriteNewsField.type);
      } else {
        console.log('❌ ERROR: Câmpul favoriteNews nu este găsit în tipul Profile!');
        console.log('Câmpurile disponibile:', profileType.fields?.map(f => f.name));
      }
    } else {
      console.log('❌ ERROR: Tipul Profile nu este găsit în schema!');
    }

  } catch (error) {
    console.error('❌ Eroare la testarea funcționalității:', error.message);
    console.error('Detalii:', error);
  }
}

// Execută testul
testFavoriteNews()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });
