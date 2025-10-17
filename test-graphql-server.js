/**
 * Test simplu pentru verificarea serverului GraphQL
 */

// Simulează un request GraphQL
const testQuery = `
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

console.log('🧪 Test pentru serverul GraphQL');
console.log('Query de test:');
console.log(testQuery);
console.log('');

// Verifică dacă serverul rulează
const API_URL = process.env.API_URL || 'http://localhost:4000/graphql';

async function testGraphQLServer() {
  try {
    console.log('1. Testare conectare la serverul GraphQL...');
    console.log('URL:', API_URL);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: testQuery,
      }),
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Răspuns primit:');
    console.log(JSON.stringify(result, null, 2));

    // Verifică dacă există erori
    if (result.errors) {
      console.log('❌ Erori GraphQL:');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
        if (error.locations) {
          console.log('   Locations:', error.locations);
        }
        if (error.path) {
          console.log('   Path:', error.path);
        }
      });
    } else {
      console.log('✅ Nu există erori GraphQL');
      
      // Verifică dacă câmpul favoriteNews există
      const favoriteNews = result.data?.me?.profile?.favoriteNews;
      if (favoriteNews !== undefined) {
        console.log('✅ Câmpul favoriteNews este prezent!');
        console.log('Valoarea:', favoriteNews);
      } else {
        console.log('❌ Câmpul favoriteNews lipsește!');
      }
    }

  } catch (error) {
    console.error('❌ Eroare la testarea serverului:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Sfat: Asigură-te că serverul GraphQL rulează pe portul 3000');
      console.log('   Poți rula serverul cu: npm start sau node api/src/index.js');
    }
  }
}

// Execută testul
testGraphQLServer()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });
