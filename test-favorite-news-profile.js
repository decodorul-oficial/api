/**
 * Test pentru verificarea că câmpul favoriteNews apare în profilul utilizatorului
 */

import { createClient } from '@supabase/supabase-js';

// Configurare Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// URL-ul API-ului GraphQL
const API_URL = process.env.API_URL || 'http://localhost:3000/graphql';

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
  
  if (result.errors) {
    throw new Error(`GraphQL Error: ${result.errors.map(e => e.message).join(', ')}`);
  }

  return result.data;
}

/**
 * Autentificare utilizator
 */
async function authenticateUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  return data.session.access_token;
}

/**
 * Test principal
 */
async function testFavoriteNewsInProfile() {
  try {
    console.log('🧪 Test pentru verificarea câmpului favoriteNews în profil\n');

    // 1. Autentificare utilizator
    console.log('1. Autentificare utilizator...');
    const token = await authenticateUser('nie.radu@gmail.com', 'password123');
    console.log('✅ Autentificare reușită\n');

    // 2. Test query GetMyProfile cu favoriteNews
    console.log('2. Test query GetMyProfile cu favoriteNews...');
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
            trialStatus {
              isTrial
              hasTrial
              trialStart
              trialEnd
              tierId
              daysRemaining
              expired
            }
            preferences {
              preferredCategories
              notificationSettings
              createdAt
              updatedAt
            }
            createdAt
            updatedAt
            
            # Testez câmpul favoriteNews
            favoriteNews
            
            activeSubscription {
              id
              status
              currentPeriodStart
              currentPeriodEnd
              tier {
                name
                displayName
                price
                features
              }
            }
            
            subscriptionUsage {
              requestsUsed
              requestsLimit
              requestsRemaining
            }
            
            paymentMethods {
              last4
              brand
              isDefault
            }
            
            subscriptionHistory {
              status
              createdAt
              tier {
                displayName
              }
            }
          }
        }
      }
    `;

    const profileData = await executeGraphQL(profileQuery, {}, token);
    
    console.log('📊 Răspunsul complet:');
    console.log(JSON.stringify(profileData, null, 2));
    console.log('');

    // 3. Verifică dacă câmpul favoriteNews există
    const favoriteNews = profileData.me?.profile?.favoriteNews;
    console.log('🔍 Verificare câmp favoriteNews:');
    console.log('Existe câmpul favoriteNews?', favoriteNews !== undefined);
    console.log('Tipul câmpului:', typeof favoriteNews);
    console.log('Valoarea câmpului:', favoriteNews);
    console.log('Este array?', Array.isArray(favoriteNews));
    console.log('');

    if (favoriteNews !== undefined) {
      console.log('✅ SUCCESS: Câmpul favoriteNews este prezent în profil!');
    } else {
      console.log('❌ ERROR: Câmpul favoriteNews lipsește din profil!');
    }

    // 4. Test adăugare știre la favorite
    console.log('4. Test adăugare știre la favorite...');
    const addFavoriteMutation = `
      mutation AddFavoriteNews($newsId: String!) {
        addFavoriteNews(newsId: $newsId) {
          id
          userId
          newsId
          createdAt
        }
      }
    `;

    try {
      const addResult = await executeGraphQL(addFavoriteMutation, { newsId: '951' }, token);
      console.log('✅ Știre adăugată la favorite:', addResult.addFavoriteNews);
    } catch (error) {
      console.log('⚠️ Eroare la adăugarea știrii (poate fi deja în favorite):', error.message);
    }

    // 5. Test din nou query GetMyProfile pentru a vedea dacă favoriteNews s-a actualizat
    console.log('5. Test din nou query GetMyProfile...');
    const updatedProfileData = await executeGraphQL(profileQuery, {}, token);
    const updatedFavoriteNews = updatedProfileData.me?.profile?.favoriteNews;
    
    console.log('📊 Știri favorite după adăugare:');
    console.log('Numărul de știri favorite:', updatedFavoriteNews?.length || 0);
    console.log('Știrile favorite:', updatedFavoriteNews);
    console.log('');

    if (updatedFavoriteNews && updatedFavoriteNews.length > 0) {
      console.log('✅ SUCCESS: Știrile favorite se actualizează corect!');
    } else {
      console.log('⚠️ WARNING: Știrile favorite nu se actualizează sau sunt goale');
    }

  } catch (error) {
    console.error('❌ Eroare la testarea funcționalității:', error.message);
    console.error('Detalii:', error);
  }
}

// Execută testul
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Pornire test pentru câmpul favoriteNews în profil\n');
  
  // Verifică dacă sunt setate variabilele de mediu
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Te rog să setezi variabilele de mediu SUPABASE_URL și SUPABASE_ANON_KEY');
    process.exit(1);
  }

  testFavoriteNewsInProfile()
    .then(() => {
      console.log('\n✨ Testul a fost completat!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Eroare la executarea testului:', error);
      process.exit(1);
    });
}

export { testFavoriteNewsInProfile };
