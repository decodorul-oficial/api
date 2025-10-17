/**
 * Middleware pentru autentificare
 * Respectă principiul Single Responsibility prin focusarea doar pe autentificare
 * Respectă principiul Dependency Inversion prin injectarea serviciului de utilizatori
 */

import { GraphQLError } from 'graphql';

/**
 * Utilitar pentru extragerea valorii din header-ul Cookie
 * @param {string} cookieHeader - Header-ul Cookie
 * @param {string} name - Numele cookie-ului
 * @returns {string|undefined} Valoarea cookie-ului sau undefined
 */
function getCookieValue(cookieHeader, name) {
  try {
    if (!cookieHeader || !name) return undefined;
    const cookies = String(cookieHeader).split(';');
    for (const part of cookies) {
      const [k, v] = part.split('=');
      if (k && k.trim() === name) {
        return decodeURIComponent((v || '').trim());
      }
    }
  } catch (_) {}
  return undefined;
}

/**
 * Middleware pentru validarea token-ului JWT și setarea contextului utilizatorului
 * @param {Object} userService - Serviciul pentru utilizatori injectat
 * @returns {Function} Middleware function
 */
export function createAuthMiddleware(userService) {
  return async (req, res, next) => {
    try {
      let token = null;

      // 1. Încearcă să extragă token-ul din header-ul Authorization (Bearer)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Elimină 'Bearer ' din început
      }

      // 2. Dacă nu există token în Authorization, încearcă să-l extragă din cookies Supabase
      if (!token) {
        const supabaseToken = getCookieValue(req.headers.cookie, 'sb-kwgfkcxlgxikmzdpxulp-auth-token');
        if (supabaseToken) {
          try {
            // Decodifică obiectul JSON din cookie
            const tokenObject = JSON.parse(Buffer.from(supabaseToken, 'base64').toString());
            
            // Extrage access_token din obiect
            if (tokenObject.access_token) {
              token = tokenObject.access_token;
              console.log('✅ Access token extras din cookie Supabase pentru utilizatorul:', tokenObject.user?.id);
            } else {
              console.log('⚠️ Nu s-a găsit access_token în obiectul din cookie');
            }
          } catch (error) {
            console.warn('Eroare la decodificarea obiectului din cookie:', error);
          }
        } else {
          console.log('ℹ️ Nu s-a găsit token Supabase în cookies');
        }
      }

      // Validează token-ul și obține utilizatorul
      const user = token ? await userService.validateToken(token) : null;
      
      if (token && !user) {
        console.log('⚠️ Token validat dar utilizatorul nu a fost găsit');
      } else if (user) {
        console.log('✅ Utilizator autentificat cu succes:', user.id);
        
        // Check trial status and update user profile if needed
        try {
          const trialStatus = await userService.checkTrialStatus(user.id);
          user.trialStatus = trialStatus;
          
          // If trial expired, update subscription tier
          if (trialStatus.expired) {
            user.profile.subscriptionTier = 'free';
          }
        } catch (error) {
          console.error('Error checking trial status:', error);
          // Don't fail authentication if trial check fails
        }
      } else {
        console.log('ℹ️ Nu există token pentru autentificare');
      }

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

/**
 * Funcție helper pentru verificarea trial-ului utilizatorului
 * @param {Object} context - Contextul GraphQL
 * @param {boolean} allowTrial - Dacă trial-ul este permis
 * @returns {Object} Utilizatorul autentificat cu informații despre trial
 */
export function requireTrialOrSubscription(context, allowTrial = true) {
  const user = requireAuth(context);
  
  // Check if user is in trial
  const isInTrial = user.trialStatus?.isTrial || false;
  const hasValidSubscription = ['pro', 'enterprise'].includes(user.profile.subscriptionTier);
  
  if (!hasValidSubscription && !(allowTrial && isInTrial)) {
    throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
      extensions: { 
        code: 'SUBSCRIPTION_REQUIRED',
        trialStatus: user.trialStatus
      }
    });
  }
  
  return user;
}

export default {
  createAuthMiddleware,
  requireAuth,
  requireOwnership,
  requireRole,
  requireTrialOrSubscription
};
