/**
 * Middleware pentru autentificare server-to-server folosind o cheie statică (API Key)
 * Verifică header-ul `X-Internal-API-Key` împotriva variabilei de mediu `INTERNAL_API_KEY`.
 * Dacă cheia lipsește sau este invalidă, răspunde cu 403 și oprește procesarea.
 */

/**
 * Creează middleware-ul pentru validarea cheii interne API
 * @returns {Function} Middleware Express
 */
export function createInternalApiKeyMiddleware() {
  const expectedKey = process.env.INTERNAL_API_KEY;

  return function internalApiKeyMiddleware(req, res, next) {
    try {
      // Header-urile sunt case-insensitive în Node; folosim forma standardizată
      const providedKey = req.headers['x-internal-api-key'];

      // Dacă nu avem o cheie configurată în environment, refuzăm accesul în mod explicit
      // (în producție validateEnvironment va și bloca lipsa acesteia)
      if (!expectedKey || !providedKey || String(providedKey) !== String(expectedKey)) {
        return res.status(403).json({ error: 'Access Denied' });
      }

      return next();
    } catch (_) {
      return res.status(403).json({ error: 'Access Denied' });
    }
  };
}

export default {
  createInternalApiKeyMiddleware
};


