/**
 * Middleware pentru validarea reCAPTCHA v3
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe validarea captcha
 * Respectă principiul Dependency Inversion prin injectarea dependențelor
 */

import axios from 'axios';
import { GraphQLError } from 'graphql';

/**
 * Configurația pentru reCAPTCHA
 */
const RECAPTCHA_CONFIG = {
  verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
  minScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5'),
  secretKey: process.env.RECAPTCHA_SECRET_KEY,
  timeout: 5000 // 5 secunde timeout
};

/**
 * Operațiuni sensibile care necesită validare captcha
 */
const SENSITIVE_OPERATIONS = [
  'signUp',
  'signIn', 
  'createComment',
  'changePassword',
  'resetPassword',
  'forgotPassword'
];

/**
 * Verifică dacă o operațiune necesită validare captcha
 * @param {Object} req - Request object
 * @returns {boolean} True dacă operațiunea necesită captcha
 */
function shouldVerifyCaptcha(req) {
  // Verifică dacă captcha este activat
  if (!RECAPTCHA_CONFIG.secretKey) {
    console.warn('⚠️ reCAPTCHA secret key not configured - skipping captcha validation');
    return false;
  }

  // Verifică dacă este request GraphQL
  if (!req.body || !req.body.query) {
    return false;
  }

  // Verifică dacă conține operațiuni sensibile
  const query = req.body.query.toLowerCase();
  const hasSensitiveOperation = SENSITIVE_OPERATIONS.some(operation => 
    query.includes(operation.toLowerCase())
  );

  if (!hasSensitiveOperation) {
    return false;
  }

  // Pentru operațiuni sensibile, verifică dacă utilizatorul este autentificat
  // și are un abonament valid sau trial activ
  if (req.user) {
    const user = req.user;
    const isInTrial = user.trialStatus?.isTrial || false;
    const hasValidSubscription = ['pro', 'enterprise'].includes(user.profile?.subscriptionTier);
    
    // Dacă utilizatorul are abonament valid sau trial activ, nu necesită captcha
    if (hasValidSubscription || isInTrial) {
      console.log('✅ [CAPTCHA] Skipping captcha for authenticated user with valid subscription/trial:', {
        userId: user.id,
        subscriptionTier: user.profile?.subscriptionTier,
        isInTrial,
        operation: query.match(/(\w+)\s*\(/)?.[1] || 'unknown'
      });
      return false;
    }
  }

  return true;
}

/**
 * Extrage token-ul captcha din header-uri sau din input-ul GraphQL
 * @param {Object} req - Request object
 * @returns {string|null} Token-ul captcha sau null
 */
function extractCaptchaToken(req) {
  // Încearcă să extragă din header-ul standard (pentru compatibilitate)
  const headerToken = req.headers['x-captcha-token'] || req.headers['x-recaptcha-token'];
  
  if (headerToken) {
    return headerToken;
  }

  // Încearcă să extragă din input-ul GraphQL (metoda principală)
  if (req.body && req.body.variables && req.body.variables.input) {
    const input = req.body.variables.input;
    
    // Verifică pentru recaptchaToken în input
    if (input.recaptchaToken) {
      return input.recaptchaToken;
    }
    
    // Verifică pentru captchaToken în input (pentru compatibilitate)
    if (input.captchaToken) {
      return input.captchaToken;
    }
  }

  // Verifică pentru captchaToken direct în variables (pentru compatibilitate)
  if (req.body && req.body.variables && req.body.variables.captchaToken) {
    return req.body.variables.captchaToken;
  }

  return null;
}

/**
 * Verifică token-ul captcha cu Google reCAPTCHA API
 * @param {string} token - Token-ul captcha
 * @param {string} ip - IP-ul clientului
 * @returns {Promise<Object>} Rezultatul validării
 */
async function verifyCaptchaToken(token, ip) {
  try {
    const response = await axios.post(RECAPTCHA_CONFIG.verifyUrl, {
      secret: RECAPTCHA_CONFIG.secretKey,
      response: token,
      remoteip: ip
    }, {
      timeout: RECAPTCHA_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { success, score, action, 'error-codes': errorCodes } = response.data;

    return {
      success,
      score: parseFloat(score) || 0,
      action,
      errorCodes: errorCodes || [],
      isValid: success && (parseFloat(score) || 0) >= RECAPTCHA_CONFIG.minScore
    };
  } catch (error) {
    console.error('❌ reCAPTCHA verification error:', error.message);
    return {
      success: false,
      score: 0,
      action: null,
      errorCodes: ['network-error'],
      isValid: false,
      error: error.message
    };
  }
}

/**
 * Loghează evenimentele captcha pentru monitoring
 * @param {Object} req - Request object
 * @param {Object} result - Rezultatul validării captcha
 * @param {boolean} blocked - Dacă request-ul a fost blocat
 */
function logCaptchaEvent(req, result, blocked = false) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const operation = req.body?.query?.match(/(\w+)\s*\(/)?.[1] || 'unknown';

  const logData = {
    timestamp: new Date().toISOString(),
    ip: clientIP,
    userAgent,
    operation,
    captchaScore: result.score,
    captchaAction: result.action,
    captchaSuccess: result.success,
    blocked,
    errorCodes: result.errorCodes
  };

  if (blocked) {
    console.warn('🚫 [CAPTCHA] Request blocked:', logData);
  } else {
    console.log('✅ [CAPTCHA] Request allowed:', logData);
  }
}

/**
 * Creează middleware-ul captcha
 * @returns {Function} Middleware function
 */
export function createCaptchaMiddleware() {
  return async (req, res, next) => {
    try {
      // Verifică dacă operațiunea necesită captcha
      if (!shouldVerifyCaptcha(req)) {
        return next();
      }

      // Extrage token-ul captcha
      const captchaToken = extractCaptchaToken(req);
      
      if (!captchaToken) {
        const error = {
          success: false,
          score: 0,
          action: null,
          errorCodes: ['missing-token'],
          isValid: false
        };
        
        logCaptchaEvent(req, error, true);
        
        return res.status(400).json({
          error: 'Captcha token required',
          code: 'CAPTCHA_REQUIRED',
          message: 'Pentru această operațiune este necesară validarea captcha'
        });
      }

      // Verifică token-ul cu Google
      const clientIP = req.ip || req.connection.remoteAddress;
      const result = await verifyCaptchaToken(captchaToken, clientIP);

      // Loghează evenimentul
      logCaptchaEvent(req, result, !result.isValid);

      // Verifică rezultatul
      if (!result.isValid) {
        let errorMessage = 'Validarea captcha a eșuat';
        
        if (result.errorCodes.includes('missing-input-secret')) {
          errorMessage = 'Configurația captcha este invalidă';
        } else if (result.errorCodes.includes('invalid-input-secret')) {
          errorMessage = 'Cheia secretă captcha este invalidă';
        } else if (result.errorCodes.includes('missing-input-response')) {
          errorMessage = 'Token-ul captcha lipsește';
        } else if (result.errorCodes.includes('invalid-input-response')) {
          errorMessage = 'Token-ul captcha este invalid';
        } else if (result.errorCodes.includes('bad-request')) {
          errorMessage = 'Request-ul captcha este invalid';
        } else if (result.errorCodes.includes('timeout-or-duplicate')) {
          errorMessage = 'Token-ul captcha a expirat sau a fost folosit deja';
        } else if (result.score < RECAPTCHA_CONFIG.minScore) {
          errorMessage = `Scorul captcha este prea scăzut (${result.score.toFixed(2)} < ${RECAPTCHA_CONFIG.minScore})`;
        }

        return res.status(400).json({
          error: 'Captcha verification failed',
          code: 'CAPTCHA_INVALID',
          message: errorMessage,
          details: {
            score: result.score,
            minScore: RECAPTCHA_CONFIG.minScore,
            action: result.action
          }
        });
      }

      // Adaugă informațiile captcha la request pentru logging ulterior
      req.captchaInfo = {
        score: result.score,
        action: result.action,
        success: result.success
      };

      // Continuă cu următorul middleware
      next();

    } catch (error) {
      console.error('❌ [CAPTCHA] Middleware error:', error);
      
      // În caz de eroare, loghează dar nu bloca request-ul
      // (pentru a evita blocarea serviciului din cauza problemelor cu reCAPTCHA)
      req.captchaInfo = {
        score: 0,
        action: null,
        success: false,
        error: error.message
      };
      
      next();
    }
  };
}

/**
 * Funcție helper pentru verificarea captcha în resolver-i GraphQL
 * @param {Object} context - Contextul GraphQL
 * @param {string} operation - Numele operațiunii
 * @returns {Object|null} Informațiile captcha sau null
 */
export function getCaptchaInfo(context) {
  return context.req?.captchaInfo || null;
}

/**
 * Validează captcha pentru o operațiune specifică în resolver
 * @param {Object} context - Contextul GraphQL
 * @param {string} operation - Numele operațiunii
 * @throws {GraphQLError} Eroare dacă captcha nu este valid
 */
export function validateCaptchaInResolver(context, operation) {
  const captchaInfo = getCaptchaInfo(context);
  
  if (!captchaInfo) {
    throw new GraphQLError('Captcha validation required', {
      extensions: { code: 'CAPTCHA_REQUIRED' }
    });
  }

  if (!captchaInfo.success || captchaInfo.score < RECAPTCHA_CONFIG.minScore) {
    throw new GraphQLError('Captcha validation failed', {
      extensions: { 
        code: 'CAPTCHA_INVALID',
        details: {
          score: captchaInfo.score,
          minScore: RECAPTCHA_CONFIG.minScore,
          operation
        }
      }
    });
  }
}

export default {
  createCaptchaMiddleware,
  getCaptchaInfo,
  validateCaptchaInResolver
};
