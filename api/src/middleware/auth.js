/**
 * Middleware pentru autentificare
 * Respectă principiul Single Responsibility prin focusarea doar pe autentificare
 * Respectă principiul Dependency Inversion prin injectarea serviciului de utilizatori
 */

import { GraphQLError } from 'graphql';

/**
 * Middleware pentru validarea token-ului JWT și setarea contextului utilizatorului
 * @param {Object} userService - Serviciul pentru utilizatori injectat
 * @returns {Function} Middleware function
 */
export function createAuthMiddleware(userService) {
  return async (req, res, next) => {
    try {
      // Extrage token-ul din header-ul Authorization
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Elimină 'Bearer ' din început
      }

      // Validează token-ul și obține utilizatorul
      const user = token ? await userService.validateToken(token) : null;

      // Adaugă utilizatorul la request pentru a fi disponibil în context
      req.user = user;

      next();
    } catch (error) {
      console.error('Eroare în middleware-ul de autentificare:', error);
      // Nu aruncăm eroarea aici, permitem request-ului să continue
      // Autentificarea va fi verificată în resolver-i dacă este necesar
      req.user = null;
      next();
    }
  };
}

/**
 * Funcție helper pentru verificarea autentificării în resolver-i
 * @param {Object} context - Contextul GraphQL
 * @param {boolean} required - Dacă autentificarea este obligatorie
 * @returns {Object|null} Utilizatorul autentificat sau null
 */
export function requireAuth(context, required = true) {
  if (!context.user && required) {
    throw new GraphQLError('Utilizator neautentificat', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
  return context.user;
}

/**
 * Funcție helper pentru verificarea autorizării
 * @param {Object} context - Contextul GraphQL
 * @param {string} userId - ID-ul utilizatorului pentru care se verifică autorizarea
 * @returns {Object} Utilizatorul autentificat
 */
export function requireOwnership(context, userId) {
  const user = requireAuth(context);
  
  if (user.id !== userId) {
    throw new GraphQLError('Nu aveți permisiunea de a accesa această resursă', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
  
  return user;
}

/**
 * Funcție helper pentru verificarea rolului utilizatorului
 * @param {Object} context - Contextul GraphQL
 * @param {Array<string>} allowedRoles - Rolurile permise
 * @returns {Object} Utilizatorul autentificat
 */
export function requireRole(context, allowedRoles) {
  const user = requireAuth(context);
  
  if (!allowedRoles.includes(user.profile.subscriptionTier)) {
    throw new GraphQLError('Nu aveți permisiunea de a efectua această operațiune', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
  
  return user;
}

export default {
  createAuthMiddleware,
  requireAuth,
  requireOwnership,
  requireRole
};
