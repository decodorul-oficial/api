/**
 * Middleware pentru rate limiting
 * Respectă principiul Dependency Inversion prin injectarea dependențelor
 * Respectă principiul Single Responsibility prin focusarea doar pe rate limiting
 * 
 * NOTĂ DE PERFORMANȚĂ ȘI SCALABILITATE:
 * Logica de verificare a limitei, bazată pe interogarea usage_logs, este potrivită pentru un trafic moderat.
 * Pentru o scalabilitate la trafic foarte mare, acest mecanism poate fi înlocuit cu un sistem de caching rapid,
 * precum Redis, fără a modifica restul arhitecturii, datorită decuplării modulului.
 */

import { GraphQLError } from 'graphql';
import { 
  getRequestLimit, 
  hasUnlimitedRequests, 
  getSubscriptionTierConfig 
} from '../config/subscriptions.js';

/**
 * Middleware pentru rate limiting bazat pe planul de abonament
 * @param {Object} userRepository - Repository-ul pentru utilizatori injectat
 * @returns {Function} Middleware function pentru Apollo Server
 */
export function createRateLimiterMiddleware(userRepository) {
  return async (requestContext) => {
    try {
      const { contextValue } = requestContext;

      // Verificăm dacă request-ul are o cheie internă din whitelist pentru a ignora rate limiting
      const req = contextValue.req;
      if (req) {
        const whitelist = process.env.WHITELIST_INTERNAL_API_KEY;
        if (whitelist) {
          const allowedKeys = whitelist.split(',').map(k => k.trim()).filter(Boolean);
          const providedHeader = req.headers['x-internal-api-key'] || req.headers['internal_api_key'];
          const providedKey = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;

          // DEBUG: Log red for received key
          if (providedKey) {
            console.log('\x1b[31m[DEBUG GQL RATE LIMIT] Received Key:', providedKey, '| Whitelist:', allowedKeys.join(','), '\x1b[0m');
          } else {
             console.log('\x1b[31m[DEBUG GQL RATE LIMIT] No Internal API Key provided in headers\x1b[0m');
          }

          if (providedKey && allowedKeys.includes(providedKey)) {
            return;
          }
        }
      }
      
      // Dacă nu există utilizator autentificat, nu aplicăm rate limiting
      if (!contextValue.user) {
        return;
      }

      const userId = contextValue.user.id;
      const subscriptionTier = contextValue.user.profile.subscriptionTier;

      // Verifică dacă utilizatorul are cereri nelimitate
      if (hasUnlimitedRequests(subscriptionTier)) {
        // Loghează cererea asincron pentru utilizatorii cu cereri nelimitate
        userRepository.logRequest(userId).catch(error => {
          console.error('Eroare la logarea cererii pentru utilizator nelimitat:', error);
        });
        return;
      }

      // Obține limita pentru tier-ul de abonament
      const requestLimit = getRequestLimit(subscriptionTier);
      if (requestLimit === null) {
        // Caz de siguranță - dacă nu se poate determina limita, permitem cererea
        console.warn(`Nu s-a putut determina limita pentru tier-ul: ${subscriptionTier}`);
        return;
      }

      // Obține numărul de cereri din ultimele 24 de ore
      const requestCount = await userRepository.getRequestCountLast24Hours(userId);

      // Verifică dacă limita a fost depășită
      if (requestCount >= requestLimit) {
        const tierConfig = getSubscriptionTierConfig(subscriptionTier);
        throw Object.assign(new GraphQLError('RATE_LIMIT_EXCEEDED'), {
          extensions: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Ați depășit limita de ${requestLimit} de cereri pe zi pentru planul '${tierConfig.name}'. Puteți face upgrade la un plan superior pentru mai multe cereri.`,
            limit: requestLimit,
            current: requestCount,
            tier: subscriptionTier
          }
        });
      }

      // Loghează cererea asincron (fără await pentru a nu adăuga latență)
      userRepository.logRequest(userId).catch(error => {
        console.error('Eroare la logarea cererii:', error);
      });

    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      
      // Pentru alte erori, logăm dar permitem cererea să continue
      // Nu vrem să blocăm utilizatorii din cauza problemelor tehnice cu rate limiting
      console.error('Eroare în middleware-ul de rate limiting:', error);
    }
  };
}

/**
 * Funcție helper pentru verificarea rate limit-ului în resolver-i
 * @param {Object} context - Contextul GraphQL
 * @param {Object} userRepository - Repository-ul pentru utilizatori
 * @returns {Promise<void>}
 */
export async function checkRateLimit(context, userRepository) {
  if (!context.user) {
    return; // Nu aplicăm rate limiting pentru utilizatorii neautentificați
  }

  const userId = context.user.id;
  const subscriptionTier = context.user.profile.subscriptionTier;

  if (hasUnlimitedRequests(subscriptionTier)) {
    return;
  }

  const requestLimit = getRequestLimit(subscriptionTier);
  if (requestLimit === null) {
    return;
  }

  const requestCount = await userRepository.getRequestCountLast24Hours(userId);

  if (requestCount >= requestLimit) {
    const tierConfig = getSubscriptionTierConfig(subscriptionTier);
    throw Object.assign(new GraphQLError('RATE_LIMIT_EXCEEDED'), {
      extensions: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Ați depășit limita de ${requestLimit} de cereri pe zi pentru planul '${tierConfig.name}'`,
        limit: requestLimit,
        current: requestCount,
        tier: subscriptionTier
      }
    });
  }
}

/**
 * Funcție pentru obținerea informațiilor despre rate limit pentru un utilizator
 * @param {Object} context - Contextul GraphQL
 * @param {Object} userRepository - Repository-ul pentru utilizatori
 * @returns {Promise<Object>} Informații despre rate limit
 */
export async function getRateLimitInfo(context, userRepository) {
  if (!context.user) {
    return {
      hasUnlimitedRequests: false,
      requestLimit: 0,
      currentRequests: 0,
      remainingRequests: 0,
      tier: 'anonymous'
    };
  }

  const userId = context.user.id;
  const subscriptionTier = context.user.profile.subscriptionTier;
  const tierConfig = getSubscriptionTierConfig(subscriptionTier);

  if (hasUnlimitedRequests(subscriptionTier)) {
    return {
      hasUnlimitedRequests: true,
      requestLimit: null,
      currentRequests: 0,
      remainingRequests: null,
      tier: subscriptionTier,
      tierName: tierConfig.name
    };
  }

  const requestLimit = getRequestLimit(subscriptionTier);
  const currentRequests = await userRepository.getRequestCountLast24Hours(userId);
  const remainingRequests = Math.max(0, requestLimit - currentRequests);

  return {
    hasUnlimitedRequests: false,
    requestLimit,
    currentRequests,
    remainingRequests,
    tier: subscriptionTier,
    tierName: tierConfig.name
  };
}

/**
 * Funcție pentru throttling suplimentar pe bază de IP (opțional)
 * Această funcție poate fi implementată pentru a adăuga un strat secundar de protecție
 * împotriva atacurilor de tip DoS sau a tentativelor agresive de scraping
 * 
 * @param {string} ipAddress - Adresa IP a clientului
 * @param {Object} cacheService - Serviciul de cache (Redis, etc.)
 * @returns {Promise<boolean>} True dacă cererea este permisă
 */
export async function checkIpThrottling(ipAddress, cacheService) {
  // Implementare opțională pentru throttling pe bază de IP
  // Această funcție poate fi integrată în viitor cu un sistem de cache rapid
  return true; // Pentru moment, permitem toate cererile
}

/**
 * Funcție pentru testarea și validarea rate limiting-ului
 * Utilizată pentru debugging și monitorizare
 * 
 * @param {Object} userRepository - Repository-ul pentru utilizatori
 * @param {string} userId - ID-ul utilizatorului de testat
 * @returns {Promise<Object>} Informații despre rate limiting pentru debugging
 */
export async function debugRateLimit(userRepository, userId) {
  try {
    const requestCount = await userRepository.getRequestCountLast24Hours(userId);
    const profile = await userRepository.getProfileById(userId);
    
    return {
      userId,
      requestCount,
      subscriptionTier: profile?.subscription_tier || 'unknown',
      timestamp: new Date().toISOString(),
      isUnlimited: profile?.subscription_tier === 'enterprise'
    };
  } catch (error) {
    console.error('Eroare la debugging rate limit:', error);
    return {
      userId,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

export default {
  createRateLimiterMiddleware,
  checkRateLimit,
  getRateLimitInfo,
  checkIpThrottling,
  debugRateLimit
};
