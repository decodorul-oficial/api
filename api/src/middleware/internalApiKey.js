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
  const showFull = process.env.DEBUG_INTERNAL_API_KEY === 'true';

  function mask(value) {
    if (!value) return '(missing)';
    const str = String(value);
    if (showFull) return str;
    if (str.length <= 8) return `${str[0]}***${str[str.length - 1]} (len=${str.length})`;
    return `${str.slice(0, 4)}***${str.slice(-4)} (len=${str.length})`;
  }

  return function internalApiKeyMiddleware(req, res, next) {
    try {
      // Header-urile sunt case-insensitive în Node; folosim forma standardizată
      const providedHeader = req.headers['x-internal-api-key'];
      const providedKey = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;

      const clientIP = req.headers['cf-connecting-ip']
        || req.headers['x-real-ip']
        || (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim())
        || req.ip
        || (req.connection && req.connection.remoteAddress);
      const userAgent = req.headers['user-agent'];
      const host = req.headers['host'];

      // Log de debug pentru verificarea cheilor
      console.warn(
        `[INTERNAL_API_KEY] host=${host} ip=${clientIP} ua=${userAgent} provided=${mask(providedKey)} expected=${mask(expectedKey)}`
      );

      // Dacă nu avem o cheie configurată în environment, refuzăm accesul în mod explicit
      // (în producție validateEnvironment va și bloca lipsa acesteia)
      if (!expectedKey || !providedKey || String(providedKey) !== String(expectedKey)) {
        console.warn('[INTERNAL_API_KEY] Access denied: invalid or missing key');
        return res.status(403).json({ error: 'Access Denied' });
      }

      console.log('[INTERNAL_API_KEY] Access granted');
      return next();
    } catch (_) {
      console.warn('[INTERNAL_API_KEY] Exception while validating key');
      return res.status(403).json({ error: 'Access Denied' });
    }
  };
}

export default {
  createInternalApiKeyMiddleware
};


