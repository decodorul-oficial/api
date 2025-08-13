/**
 * Configurația pentru planurile de abonament
 * Respectă principiul Open/Closed - ușor de extins cu noi planuri fără a modifica logica existentă
 * 
 * NOTĂ DE PERFORMANȚĂ:
 * Această configurație este optimizată pentru trafic moderat. Pentru trafic foarte mare,
 * se recomandă implementarea unui sistem de cache rapid (Redis) pentru rate limiting.
 */

/**
 * Definirea planurilor de abonament cu limitele lor
 * @type {Object.<string, {requestsPerDay: number|null, name: string, description: string}>}
 */
export const SUBSCRIPTION_TIERS = {
  free: {
    requestsPerDay: 100,
    name: 'Free',
    description: 'Plan gratuit cu limită de 100 de cereri pe zi'
  },
  pro: {
    requestsPerDay: 5000,
    name: 'Pro',
    description: 'Plan profesional cu 5000 de cereri pe zi'
  },
  enterprise: {
    requestsPerDay: null, // null = fără limită
    name: 'Enterprise',
    description: 'Plan enterprise cu cereri nelimitate'
  }
};

/**
 * Valoarea implicită pentru utilizatorii noi
 */
export const DEFAULT_SUBSCRIPTION_TIER = 'free';

/**
 * Verifică dacă un tier de abonament este valid
 * @param {string} tier - Tier-ul de abonament de verificat
 * @returns {boolean} - True dacă tier-ul este valid
 */
export function isValidSubscriptionTier(tier) {
  return Object.keys(SUBSCRIPTION_TIERS).includes(tier);
}

/**
 * Obține configurația pentru un tier de abonament
 * @param {string} tier - Tier-ul de abonament
 * @returns {Object|null} - Configurația tier-ului sau null dacă nu există
 */
export function getSubscriptionTierConfig(tier) {
  return SUBSCRIPTION_TIERS[tier] || null;
}

/**
 * Verifică dacă un tier are cereri nelimitate
 * @param {string} tier - Tier-ul de abonament
 * @returns {boolean} - True dacă tier-ul are cereri nelimitate
 */
export function hasUnlimitedRequests(tier) {
  const config = getSubscriptionTierConfig(tier);
  return config ? config.requestsPerDay === null : false;
}

/**
 * Obține limita de cereri pentru un tier
 * @param {string} tier - Tier-ul de abonament
 * @returns {number|null} - Limita de cereri sau null pentru nelimitat
 */
export function getRequestLimit(tier) {
  const config = getSubscriptionTierConfig(tier);
  return config ? config.requestsPerDay : null;
}

export default {
  SUBSCRIPTION_TIERS,
  DEFAULT_SUBSCRIPTION_TIER,
  isValidSubscriptionTier,
  getSubscriptionTierConfig,
  hasUnlimitedRequests,
  getRequestLimit
};
