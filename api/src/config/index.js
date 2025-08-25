/**
 * Configurația centralizată a aplicației
 * Respectă principiul Single Responsibility Principle prin centralizarea tuturor configurărilor
 */

import dotenv from 'dotenv';

// Încarcă variabilele de mediu din fișierul .env
dotenv.config();

/**
 * Configurația pentru Supabase
 */
export const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey: process.env.SUPABASE_ANON_KEY
};

/**
 * Configurația pentru serverul Apollo
 */
export const apolloConfig = {
  port: process.env.PORT || 4000,
  introspection: process.env.NODE_ENV !== 'production',
  playground: process.env.NODE_ENV !== 'production',
  depthLimit: 7,
  // Configurații suplimentare de securitate
  csrfPrevention: true,
  cache: 'bounded'
};

/**
 * Configurația pentru securitate
 */
export const securityConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Internal-API-Key']
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minute
    max: 100 // limită per IP
  },
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\''],
        fontSrc: ['\'self\''],
        objectSrc: ['\'none\''],
        mediaSrc: ['\'self\''],
        frameSrc: ['\'none\'']
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },
  // Configurații pentru prevenirea atacurilor
  maxRequestSize: '10mb',
  maxQueryComplexity: 1000,
  maxQueryDepth: 7
};

/**
 * Configurația pentru validare
 */
export const validationConfig = {
  maxStiriLimit: 100,
  defaultStiriLimit: 10,
  maxTitleLength: 500,
  maxContentLength: 10000,
  passwordMinLength: 8,
  passwordMaxLength: 128
};

/**
 * Configurația pentru logging și monitoring
 */
export const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  enableRequestLogging: process.env.NODE_ENV !== 'production',
  enableErrorLogging: true,
  enablePerformanceLogging: process.env.NODE_ENV === 'development'
};

/**
 * Validează că toate variabilele de mediu necesare sunt prezente
 */
export function validateEnvironment() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Variabile de mediu lipsă: ${missingVars.join(', ')}`);
  }

  // Validări suplimentare pentru securitate
  if (process.env.NODE_ENV === 'production') {
    if (process.env.CORS_ORIGIN === '*') {
      console.warn('⚠️  Avertisment: CORS_ORIGIN este setat la "*" în producție. Considerați să specificați domeniile exacte.');
    }
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.length < 50) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY pare să fie invalid sau prea scurt');
    }
    if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY.length < 32) {
      throw new Error('INTERNAL_API_KEY lipsă sau prea scurt în producție');
    }
  }
}

export default {
  supabase: supabaseConfig,
  apollo: apolloConfig,
  security: securityConfig,
  validation: validationConfig,
  logging: loggingConfig,
  validateEnvironment
};
