/**
 * Exemplu practic de utilizare a sistemului de rate limiting
 * Demonstrează cum funcționează sistemul în practică
 */

import { createRateLimiterMiddleware, getRateLimitInfo, debugRateLimit } from '../src/middleware/rateLimiter.js';
import { getRequestLimit, hasUnlimitedRequests } from '../src/config/subscriptions.js';

// Mock pentru repository-ul de utilizatori
const mockUserRepository = {
  getRequestCountLast24Hours: async (userId) => {
    // Simulează diferite scenarii
    const scenarios = {
      'user-free-25': 25,    // Utilizator free cu 25 cereri
      'user-free-100': 100,  // Utilizator free la limita maximă
      'user-pro-1000': 1000, // Utilizator pro cu 1000 cereri
      'user-enterprise': 0   // Utilizator enterprise (nu contează)
    };
    return scenarios[userId] || 0;
  },
  
  logRequest: async (userId) => {
    console.log(`📝 Cerere logată pentru utilizatorul: ${userId}`);
  },
  
  getProfileById: async (userId) => {
    const profiles = {
      'user-free-25': { subscription_tier: 'free' },
      'user-free-100': { subscription_tier: 'free' },
      'user-pro-1000': { subscription_tier: 'pro' },
      'user-enterprise': { subscription_tier: 'enterprise' }
    };
    return profiles[userId];
  }
};

// Funcție pentru testarea rate limiting-ului
async function testRateLimiting() {
  console.log('🚀 Testarea sistemului de rate limiting\n');

  // Test 1: Utilizator free sub limită
  console.log('📋 Test 1: Utilizator free sub limită (25/100 cereri)');
  try {
    const middleware = createRateLimiterMiddleware(mockUserRepository);
    const context1 = {
      user: {
        id: 'user-free-25',
        profile: { subscriptionTier: 'free' }
      }
    };
    
    await middleware({ contextValue: context1 });
    console.log('✅ Cererea permisă pentru utilizatorul free sub limită\n');
  } catch (error) {
    console.log('❌ Eroare neașteptată:', error.message, '\n');
  }

  // Test 2: Utilizator free la limită
  console.log('📋 Test 2: Utilizator free la limită (100/100 cereri)');
  try {
    const middleware = createRateLimiterMiddleware(mockUserRepository);
    const context2 = {
      user: {
        id: 'user-free-100',
        profile: { subscriptionTier: 'free' }
      }
    };
    
    await middleware({ contextValue: context2 });
    console.log('❌ Eroare: Cererea ar fi trebuit să fie blocată\n');
  } catch (error) {
    if (error.extensions?.code === 'RATE_LIMIT_EXCEEDED') {
      console.log('✅ Cererea blocată corect pentru utilizatorul free la limită');
      console.log(`   Mesaj: ${error.message}\n`);
    } else {
      console.log('❌ Eroare neașteptată:', error.message, '\n');
    }
  }

  // Test 3: Utilizator pro sub limită
  console.log('📋 Test 3: Utilizator pro sub limită (1000/5000 cereri)');
  try {
    const middleware = createRateLimiterMiddleware(mockUserRepository);
    const context3 = {
      user: {
        id: 'user-pro-1000',
        profile: { subscriptionTier: 'pro' }
      }
    };
    
    await middleware({ contextValue: context3 });
    console.log('✅ Cererea permisă pentru utilizatorul pro sub limită\n');
  } catch (error) {
    console.log('❌ Eroare neașteptată:', error.message, '\n');
  }

  // Test 4: Utilizator enterprise (nelimitat)
  console.log('📋 Test 4: Utilizator enterprise (cereri nelimitate)');
  try {
    const middleware = createRateLimiterMiddleware(mockUserRepository);
    const context4 = {
      user: {
        id: 'user-enterprise',
        profile: { subscriptionTier: 'enterprise' }
      }
    };
    
    await middleware({ contextValue: context4 });
    console.log('✅ Cererea permisă pentru utilizatorul enterprise (nelimitat)\n');
  } catch (error) {
    console.log('❌ Eroare neașteptată:', error.message, '\n');
  }

  // Test 5: Informații despre rate limiting
  console.log('📋 Test 5: Informații despre rate limiting');
  try {
    const context5 = {
      user: {
        id: 'user-free-25',
        profile: { subscriptionTier: 'free' }
      }
    };
    
    const rateLimitInfo = await getRateLimitInfo(context5, mockUserRepository);
    console.log('📊 Informații rate limiting:');
    console.log(`   Tier: ${rateLimitInfo.tierName} (${rateLimitInfo.tier})`);
    console.log(`   Limita: ${rateLimitInfo.requestLimit} cereri/zi`);
    console.log(`   Cereri curente: ${rateLimitInfo.currentRequests}`);
    console.log(`   Cereri rămase: ${rateLimitInfo.remainingRequests}`);
    console.log(`   Nelimitat: ${rateLimitInfo.hasUnlimitedRequests}\n`);
  } catch (error) {
    console.log('❌ Eroare la obținerea informațiilor:', error.message, '\n');
  }

  // Test 6: Debug rate limiting
  console.log('📋 Test 6: Debug rate limiting');
  try {
    const debugInfo = await debugRateLimit(mockUserRepository, 'user-free-25');
    console.log('🔍 Debug info:');
    console.log(`   User ID: ${debugInfo.userId}`);
    console.log(`   Request Count: ${debugInfo.requestCount}`);
    console.log(`   Subscription Tier: ${debugInfo.subscriptionTier}`);
    console.log(`   Is Unlimited: ${debugInfo.isUnlimited}`);
    console.log(`   Timestamp: ${debugInfo.timestamp}\n`);
  } catch (error) {
    console.log('❌ Eroare la debug:', error.message, '\n');
  }

  // Test 7: Configurația planurilor
  console.log('📋 Test 7: Configurația planurilor de abonament');
  console.log('📋 Planuri disponibile:');
  
  const tiers = ['free', 'pro', 'enterprise'];
  tiers.forEach(tier => {
    const limit = getRequestLimit(tier);
    const unlimited = hasUnlimitedRequests(tier);
    console.log(`   ${tier.toUpperCase()}: ${unlimited ? '∞' : limit} cereri/zi`);
  });
  
  console.log('\n✅ Testarea completă a sistemului de rate limiting finalizată!');
}

// Funcție pentru demonstrarea utilizării în practică
async function demonstrateUsage() {
  console.log('\n🎯 Demonstrarea utilizării în practică\n');

  // Exemplu 1: Verificarea rate limit-ului înainte de o operațiune costisivă
  console.log('📋 Exemplu 1: Verificarea rate limit-ului înainte de o operațiune costisivă');
  
  const expensiveOperation = async (userId, userRepository) => {
    // Verifică rate limit-ul înainte de operațiune
    const context = {
      user: {
        id: userId,
        profile: { subscriptionTier: 'free' }
      }
    };
    
    try {
      const rateLimitInfo = await getRateLimitInfo(context, userRepository);
      
      if (rateLimitInfo.remainingRequests <= 0 && !rateLimitInfo.hasUnlimitedRequests) {
        throw new Error('Rate limit exceeded');
      }
      
      // Simulează o operațiune costisivă
      console.log(`   🚀 Executând operațiunea costisivă pentru ${userId}`);
      console.log(`   📊 Cereri rămase: ${rateLimitInfo.remainingRequests || '∞'}`);
      
      // Loghează cererea
      await userRepository.logRequest(userId);
      
    } catch (error) {
      console.log(`   ❌ Operațiunea blocată: ${error.message}`);
    }
  };

  // Testează cu diferiți utilizatori
  await expensiveOperation('user-free-25', mockUserRepository);
  await expensiveOperation('user-free-100', mockUserRepository);
  await expensiveOperation('user-enterprise', mockUserRepository);
}

// Rulează exemplele
if (import.meta.url === `file://${process.argv[1]}`) {
  testRateLimiting()
    .then(() => demonstrateUsage())
    .catch(error => {
      console.error('❌ Eroare în rularea exemplelor:', error);
      process.exit(1);
    });
}

export { testRateLimiting, demonstrateUsage };
