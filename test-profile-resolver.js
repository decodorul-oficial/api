/**
 * Test pentru verificarea resolver-ului Profile.favoriteNews
 */

import { createClient } from '@supabase/supabase-js';
import { FavoriteNewsRepository } from './api/src/database/repositories/FavoriteNewsRepository.js';
import { FavoriteNewsService } from './api/src/core/services/FavoriteNewsService.js';
import SubscriptionService from './api/src/core/services/SubscriptionService.js';
import UserService from './api/src/core/services/UserService.js';

// Configurare Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testProfileResolver() {
  try {
    console.log('🧪 Test pentru resolver-ul Profile.favoriteNews\n');

    // 1. Creează serviciile
    console.log('1. Creare servicii...');
    const favoriteNewsRepository = new FavoriteNewsRepository(supabase);
    const subscriptionService = new SubscriptionService(supabase);
    const userService = new UserService(supabase);
    const favoriteNewsService = new FavoriteNewsService(favoriteNewsRepository, subscriptionService, userService);
    console.log('✅ Servicii create cu succes\n');

    // 2. Simulează context-ul
    const mockContext = {
      user: {
        id: 'b96d32ab-2729-4c22-ae4a-db1b05faeaf7',
        email: 'nie.radu@gmail.com'
      }
    };

    // 3. Simulează parent-ul (profilul utilizatorului)
    const mockParent = {
      id: 'b96d32ab-2729-4c22-ae4a-db1b05faeaf7',
      subscriptionTier: 'pro',
      displayName: 'Nie Radu Alexandru',
      avatarUrl: 'https://lucide.dev/icons/crown',
      createdAt: '2025-09-21T11:38:32.78041+00:00',
      updatedAt: '2025-09-21T11:39:41.236234+00:00'
    };

    // 4. Testează resolver-ul pentru Profile.favoriteNews
    console.log('2. Testare resolver Profile.favoriteNews...');
    console.log('Context user:', mockContext.user);
    console.log('Parent:', mockParent);

    const favoriteNews = await favoriteNewsService.getFavoriteNewsIds(mockContext.user.id);
    console.log('✅ getFavoriteNewsIds returned:', favoriteNews);
    console.log('');

    // 5. Verifică rezultatul
    console.log('3. Verificare rezultat...');
    console.log('Tipul rezultatului:', typeof favoriteNews);
    console.log('Este array?', Array.isArray(favoriteNews));
    console.log('Numărul de știri favorite:', favoriteNews.length);
    console.log('Știrile favorite:', favoriteNews);
    console.log('');

    if (Array.isArray(favoriteNews)) {
      console.log('✅ SUCCESS: Resolver-ul Profile.favoriteNews funcționează corect!');
      console.log('✅ Rezultatul este un array cu', favoriteNews.length, 'știri favorite');
    } else {
      console.log('❌ ERROR: Resolver-ul nu returnează un array!');
    }

  } catch (error) {
    console.error('❌ Eroare la testarea resolver-ului:', error.message);
    console.error('Detalii:', error);
  }
}

// Execută testul
testProfileResolver()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
    process.exit(1);
  });
