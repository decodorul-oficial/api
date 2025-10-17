/**
 * Test simplu pentru debugging-ul resolver-ului
 */

// Simulează serviciile
const mockFavoriteNewsService = {
  getFavoriteNewsIds: async (userId) => {
    console.log(`🔍 FavoriteNewsService.getFavoriteNewsIds called with userId: ${userId}`);
    return ['951', '952', '953'];
  }
};

// Simulează resolver-ul pentru User.profile
const userProfileResolver = (parent, args, context) => {
  console.log('🔍 User.profile resolver called');
  console.log('Parent:', JSON.stringify(parent, null, 2));
  console.log('Context user:', context.user);
  
  // Returnează un obiect care să permită resolver-ii pentru Profile să se execute
  const result = {
    ...parent.profile,
    // Adaugă câmpurile necesare pentru ca resolver-ii Profile să funcționeze
    id: parent.profile?.id || parent.id,
    subscriptionTier: parent.profile?.subscriptionTier || 'free',
    displayName: parent.profile?.displayName,
    avatarUrl: parent.profile?.avatarUrl,
    createdAt: parent.profile?.createdAt || new Date().toISOString(),
    updatedAt: parent.profile?.updatedAt
  };
  
  console.log('✅ User.profile resolver result:', JSON.stringify(result, null, 2));
  return result;
};

// Simulează resolver-ul pentru Profile.favoriteNews
const profileFavoriteNewsResolver = async (parent, args, context) => {
  console.log('🔍 Profile.favoriteNews resolver called');
  console.log('Parent:', JSON.stringify(parent, null, 2));
  console.log('Context user:', context.user);
  
  if (!context.user) {
    console.log('❌ No user in context, returning empty array');
    return [];
  }
  
  try {
    const result = await mockFavoriteNewsService.getFavoriteNewsIds(context.user.id);
    console.log('✅ getFavoriteNewsIds returned:', result);
    return result;
  } catch (error) {
    console.error('❌ Error in getFavoriteNewsIds:', error);
    return [];
  }
};

// Test principal
async function testResolverChain() {
  console.log('🧪 Test pentru lanțul de resolver-i\n');

  // Simulează datele de la UserService
  const mockUser = {
    id: 'b96d32ab-2729-4c22-ae4a-db1b05faeaf7',
    email: 'nie.radu@gmail.com',
    profile: {
      id: 'b96d32ab-2729-4c22-ae4a-db1b05faeaf7',
      subscriptionTier: 'pro',
      displayName: 'Nie Radu Alexandru',
      avatarUrl: 'https://lucide.dev/icons/crown',
      createdAt: '2025-09-21T11:38:32.78041+00:00',
      updatedAt: '2025-09-21T11:39:41.236234+00:00'
    }
  };

  const mockContext = {
    user: {
      id: 'b96d32ab-2729-4c22-ae4a-db1b05faeaf7',
      email: 'nie.radu@gmail.com'
    }
  };

  console.log('1. Executare User.profile resolver...');
  const profileData = userProfileResolver(mockUser, {}, mockContext);
  console.log('');

  console.log('2. Executare Profile.favoriteNews resolver...');
  const favoriteNews = await profileFavoriteNewsResolver(profileData, {}, mockContext);
  console.log('');

  console.log('3. Rezultat final:');
  const finalResult = {
    me: {
      id: mockUser.id,
      email: mockUser.email,
      profile: {
        ...profileData,
        favoriteNews: favoriteNews
      }
    }
  };

  console.log(JSON.stringify(finalResult, null, 2));
  console.log('');

  // Verifică dacă câmpul favoriteNews există
  const hasFavoriteNews = finalResult.me.profile.favoriteNews !== undefined;
  const isArray = Array.isArray(finalResult.me.profile.favoriteNews);
  const hasData = finalResult.me.profile.favoriteNews.length > 0;

  console.log('🔍 Verificări:');
  console.log('Existe câmpul favoriteNews?', hasFavoriteNews);
  console.log('Este array?', isArray);
  console.log('Are date?', hasData);
  console.log('Numărul de știri favorite:', finalResult.me.profile.favoriteNews.length);
  console.log('');

  if (hasFavoriteNews && isArray && hasData) {
    console.log('✅ SUCCESS: Lanțul de resolver-i funcționează corect!');
  } else {
    console.log('❌ ERROR: Lanțul de resolver-i nu funcționează corect!');
  }
}

// Execută testul
testResolverChain()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });
