/**
 * Exemplu de utilizare a funcționalității de știri favorite
 * Demonstrează cum să folosești API-ul GraphQL pentru gestionarea știrilor favorite
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
 * Exemplu de utilizare a funcționalității de știri favorite
 */
async function favoriteNewsExample() {
  try {
    console.log('🌟 Exemplu de utilizare a funcționalității de știri favorite\n');

    // 1. Autentificare utilizator
    console.log('1. Autentificare utilizator...');
    const token = await authenticateUser('user@example.com', 'password123');
    console.log('✅ Autentificare reușită\n');

    // 2. Obține profilul utilizatorului cu știrile favorite
    console.log('2. Obținere profil utilizator cu știrile favorite...');
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
            trialStatus {
              isTrial
              hasTrial
              daysRemaining
            }
            activeSubscription {
              id
              status
              tier {
                name
                displayName
              }
            }
          }
        }
      }
    `;

    const profileData = await executeGraphQL(profileQuery, {}, token);
    console.log('Profil utilizator:', JSON.stringify(profileData.me.profile, null, 2));
    console.log('Știri favorite:', profileData.me.profile.favoriteNews);
    console.log('');

    // 3. Adaugă o știre la favorite
    console.log('3. Adăugare știre la favorite...');
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

    const addResult = await executeGraphQL(addFavoriteMutation, { newsId: '951' }, token);
    console.log('✅ Știre adăugată la favorite:', addResult.addFavoriteNews);
    console.log('');

    // 4. Verifică dacă o știre este în favorite
    console.log('4. Verificare dacă știrea este în favorite...');
    const isFavoriteQuery = `
      query IsFavoriteNews($newsId: String!) {
        isFavoriteNews(newsId: $newsId)
      }
    `;

    const isFavoriteResult = await executeGraphQL(isFavoriteQuery, { newsId: '951' }, token);
    console.log('Știrea 951 este în favorite:', isFavoriteResult.isFavoriteNews);
    console.log('');

    // 5. Obține toate știrile favorite
    console.log('5. Obținere toate știrile favorite...');
    const getFavoritesQuery = `
      query GetFavoriteNews($limit: Int, $offset: Int, $orderBy: String, $orderDirection: String) {
        getFavoriteNews(limit: $limit, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection) {
          favoriteNews {
            id
            userId
            newsId
            createdAt
            updatedAt
          }
          pagination {
            totalCount
            hasNextPage
            hasPreviousPage
            currentPage
            totalPages
          }
        }
      }
    `;

    const favoritesResult = await executeGraphQL(getFavoritesQuery, {
      limit: 10,
      offset: 0,
      orderBy: 'createdAt',
      orderDirection: 'DESC'
    }, token);
    console.log('Știri favorite:', JSON.stringify(favoritesResult.getFavoriteNews, null, 2));
    console.log('');

    // 6. Comută statusul unei știri în favorite (toggle)
    console.log('6. Comutare status știre în favorite...');
    const toggleMutation = `
      mutation ToggleFavoriteNews($newsId: String!) {
        toggleFavoriteNews(newsId: $newsId) {
          action
          isFavorite
          message
          favoriteNews {
            id
            newsId
            createdAt
          }
        }
      }
    `;

    const toggleResult = await executeGraphQL(toggleMutation, { newsId: '952' }, token);
    console.log('Rezultat toggle:', toggleResult.toggleFavoriteNews);
    console.log('');

    // 7. Obține statistici despre știrile favorite
    console.log('7. Obținere statistici știri favorite...');
    const statsQuery = `
      query GetFavoriteNewsStats {
        getFavoriteNewsStats {
          totalFavorites
          latestFavoriteDate
        }
      }
    `;

    const statsResult = await executeGraphQL(statsQuery, {}, token);
    console.log('Statistici știri favorite:', statsResult.getFavoriteNewsStats);
    console.log('');

    // 8. Șterge o știre din favorite
    console.log('8. Ștergere știre din favorite...');
    const removeMutation = `
      mutation RemoveFavoriteNews($newsId: String!) {
        removeFavoriteNews(newsId: $newsId)
      }
    `;

    const removeResult = await executeGraphQL(removeMutation, { newsId: '951' }, token);
    console.log('Știre ștearsă din favorite:', removeResult.removeFavoriteNews);
    console.log('');

    // 9. Șterge toate știrile favorite
    console.log('9. Ștergere toate știrile favorite...');
    const clearAllMutation = `
      mutation ClearAllFavoriteNews {
        clearAllFavoriteNews
      }
    `;

    const clearAllResult = await executeGraphQL(clearAllMutation, {}, token);
    console.log('Toate știrile favorite șterse:', clearAllResult.clearAllFavoriteNews);
    console.log('');

    console.log('🎉 Exemplul a fost executat cu succes!');

  } catch (error) {
    console.error('❌ Eroare la executarea exemplului:', error.message);
    console.error('Detalii:', error);
  }
}

/**
 * Exemplu de utilizare cu verificare de abonament
 */
async function subscriptionCheckExample() {
  try {
    console.log('🔒 Exemplu de verificare a abonamentului pentru știri favorite\n');

    // Autentificare utilizator fără abonament
    console.log('1. Autentificare utilizator fără abonament...');
    const token = await authenticateUser('free-user@example.com', 'password123');

    // Încearcă să adauge o știre la favorite
    console.log('2. Încercare de adăugare știre la favorite...');
    try {
      await executeGraphQL(`
        mutation AddFavoriteNews($newsId: String!) {
          addFavoriteNews(newsId: $newsId) {
            id
            newsId
          }
        }
      `, { newsId: '951' }, token);
      console.log('❌ Nu ar trebui să ajungă aici!');
    } catch (error) {
      console.log('✅ Eroare așteptată (utilizator fără abonament):', error.message);
    }

    console.log('\n🎯 Verificarea abonamentului funcționează corect!');

  } catch (error) {
    console.error('❌ Eroare la verificarea abonamentului:', error.message);
  }
}

// Execută exemplele
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('📰 Exemple de utilizare a funcționalității de știri favorite\n');
  
  // Verifică dacă sunt setate variabilele de mediu
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Te rog să setezi variabilele de mediu SUPABASE_URL și SUPABASE_ANON_KEY');
    process.exit(1);
  }

  // Execută exemplele
  favoriteNewsExample()
    .then(() => subscriptionCheckExample())
    .then(() => {
      console.log('\n✨ Toate exemplele au fost executate!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Eroare la executarea exemplelor:', error);
      process.exit(1);
    });
}

export {
  favoriteNewsExample,
  subscriptionCheckExample,
  executeGraphQL,
  authenticateUser
};
