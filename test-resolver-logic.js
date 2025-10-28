/**
 * Test simplu pentru verificarea logicii resolver-ului favoriteNews
 */

// Simulează context-ul și serviciile
const mockContext = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com'
  }
};

const mockFavoriteNewsService = {
  getFavoriteNewsIds: async (userId) => {
    console.log(`🔍 getFavoriteNewsIds called with userId: ${userId}`);
    return ['951', '952', '953'];
  }
};

// Simulează resolver-ul pentru User.profile
const userProfileResolver = (parent, args, context) => {
  console.log('🔍 User.profile resolver called');
  console.log('Parent:', parent);
  console.log('Context user:', context.user);
  
  // Returnează un obiect care să permită resolver-ii pentru Profile să se execute
  return {
    ...parent.profile,
    // Adaugă câmpurile necesare pentru ca resolver-ii Profile să funcționeze
    id: parent.profile?.id || parent.id,
    subscriptionTier: parent.profile?.subscriptionTier || 'free',
    displayName: parent.profile?.displayName,
    avatarUrl: parent.profile?.avatarUrl,
    createdAt: parent.profile?.createdAt || new Date().toISOString(),
    updatedAt: parent.profile?.updatedAt
  };
};

// Simulează resolver-ul pentru Profile.favoriteNews
const profileFavoriteNewsResolver = async (parent, args, context) => {
  console.log('🔍 Profile.favoriteNews resolver called');
  console.log('Parent:', parent);
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
async function testResolverLogic() {
  console.log('🧪 Test pentru logica resolver-ului favoriteNews\n');

  // Simulează datele de la UserService
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    profile: {
      id: 'test-user-id',
      subscriptionTier: 'pro',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
  };

  console.log('1. Test User.profile resolver...');
  const profileData = userProfileResolver(mockUser, {}, mockContext);
  console.log('✅ User.profile resolver result:', profileData);
  console.log('');

  console.log('2. Test Profile.favoriteNews resolver...');
  const favoriteNews = await profileFavoriteNewsResolver(profileData, {}, mockContext);
  console.log('✅ Profile.favoriteNews resolver result:', favoriteNews);
  console.log('');

  console.log('3. Verificare rezultat final...');
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

  console.log('📊 Rezultat final:');
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
    console.log('✅ SUCCESS: Logica resolver-ului funcționează corect!');
    console.log('✅ Câmpul favoriteNews este prezent și conține date!');
  } else {
    console.log('❌ ERROR: Logica resolver-ului nu funcționează corect!');
  }
}

// Execută testul
testResolverLogic()
  .then(() => {
    console.log('\n✨ Testul a fost completat!');
  })
  .catch((error) => {
    console.error('❌ Eroare la executarea testului:', error);
  });