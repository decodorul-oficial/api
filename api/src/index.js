/**
 * Punctul de intrare principal al aplicației
 * Asamblează toate modulele și configurează serverul Apollo
 * Respectă principiile SOLID prin injectarea dependențelor și separarea responsabilităților
 * Adaptat pentru funcționarea ca serverless function pe Vercel
 */

/**
 * Calculează complexitatea unui query GraphQL
 * @param {Object} document - Documentul GraphQL
 * @returns {number} Complexitatea calculată
 */
function calculateQueryComplexity(document) {
  let complexity = 0;
  
  if (document.definitions) {
    document.definitions.forEach(definition => {
      if (definition.selectionSet && definition.selectionSet.selections) {
        complexity += calculateSelectionComplexity(definition.selectionSet.selections);
      }
    });
  }
  
  return complexity;
}

/**
 * Calculează complexitatea selecțiilor
 * @param {Array} selections - Array de selecții
 * @returns {number} Complexitatea calculată
 */
function calculateSelectionComplexity(selections) {
  let complexity = 0;
  
  selections.forEach(selection => {
    complexity += 1; // Cost de bază pentru fiecare câmp
    
    if (selection.selectionSet && selection.selectionSet.selections) {
      complexity += calculateSelectionComplexity(selection.selectionSet.selections);
    }
  });
  
  return complexity;
}

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';
import { GraphQLError } from 'graphql';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import depthLimit from 'graphql-depth-limit';
import http from 'http';

// Utilitar simplu pentru a extrage o valoare din header-ul Cookie fără dependențe
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

// Importă configurația
import { 
  apolloConfig, 
  securityConfig, 
  validateEnvironment 
} from './config/index.js';

// Importă clientul Supabase
import supabaseClient from './database/supabaseClient.js';

// Importă repository-urile
import StiriRepository from './database/repositories/StiriRepository.js';
import UserRepository from './database/repositories/UserRepository.js';
import NewsletterRepository from './database/repositories/NewsletterRepository.js';
import DailySynthesesRepository from './database/repositories/DailySynthesesRepository.js';
import AnalyticsRepository from './database/repositories/AnalyticsRepository.js';

// Importă serviciile
import UserService from './core/services/UserService.js';
import StiriService from './core/services/StiriService.js';
import NewsletterService from './core/services/NewsletterService.js';
import DailySynthesesService from './core/services/DailySynthesesService.js';
import AnalyticsService from './core/services/AnalyticsService.js';
import LegislativeConnectionsService from './core/services/LegislativeConnectionsService.js';

// Importă middleware-urile
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiterMiddleware } from './middleware/rateLimiter.js';
import { createSecurityMiddleware } from './middleware/security.js';
import { createInternalApiKeyMiddleware } from './middleware/internalApiKey.js';

// Importă schema și resolver-ii
import typeDefs from './api/schema.js';
import { createResolvers } from './api/resolvers.js';

// Variabile globale pentru serverless
let server = null;
let app = null;
let httpServer = null;

/**
 * Inițializează serverul Apollo și Express pentru serverless
 */
async function initializeServer() {
  if (server && app && httpServer) {
    return { server, app, httpServer };
  }

  try {
    // Validează variabilele de mediu
    validateEnvironment();
    console.log('✅ Variabilele de mediu validate cu succes');

    // Inițializează Express și HTTP server
    app = express();
    // Respectă IP-urile reale din spatele proxy-urilor (Vercel/Cloudflare)
    app.set('trust proxy', true);
    httpServer = http.createServer(app);

    // Configurează middleware-urile de securitate
    const enableGraphQLUI = process.env.ENABLE_GRAPHQL_UI === 'true' || process.env.NODE_ENV === 'development';
    const helmetOptions = { ...securityConfig.helmet };
    if (enableGraphQLUI) {
      // Relaxează CSP doar pentru UI-ul Apollo Sandbox
      const csp = helmetOptions.contentSecurityPolicy || { directives: {} };
      csp.directives = csp.directives || {};
      const existingFrameSrc = Array.isArray(csp.directives.frameSrc)
        ? csp.directives.frameSrc.filter((v) => v !== "'none'")
        : ["'self'"];
      csp.directives.frameSrc = [...new Set([...existingFrameSrc, 'https://sandbox.embed.apollographql.com'])];
      csp.directives.connectSrc = [...new Set([...(csp.directives.connectSrc || ["'self'"]), 'https://sandbox.embed.apollographql.com', 'https://embeddable-sandbox.cdn.apollographql.com', 'https://apollo-server-landing-page.cdn.apollographql.com'])];
      csp.directives.scriptSrc = [...new Set([...(csp.directives.scriptSrc || ["'self'"]), 'https://embeddable-sandbox.cdn.apollographql.com', "'unsafe-inline'"])]
      csp.directives.styleSrc = [...new Set([...(csp.directives.styleSrc || ["'self'", "'unsafe-inline'"]), "'unsafe-inline'", 'https://fonts.googleapis.com'])];
      csp.directives.fontSrc = [...new Set([...(csp.directives.fontSrc || ["'self'"]), 'https://fonts.gstatic.com'])];
      csp.directives.defaultSrc = [...new Set([...(csp.directives.defaultSrc || ["'self'"]), 'https://apollo-server-landing-page.cdn.apollographql.com'])];
      csp.directives.manifestSrc = [...new Set([...(csp.directives.manifestSrc || ["'self'"]), 'https://apollo-server-landing-page.cdn.apollographql.com'])];
      helmetOptions.contentSecurityPolicy = csp;
    }
    app.use(helmet(helmetOptions));

    // Configurează CORS
    app.use(cors(securityConfig.cors));

    // Parsează JSON
    app.use(express.json({ limit: '10mb' }));

    // Inițializează repository-urile
    const serviceClient = supabaseClient.getServiceClient();
    const stiriRepository = new StiriRepository(serviceClient);
    const userRepository = new UserRepository(serviceClient);
    const newsletterRepository = new NewsletterRepository(serviceClient);
    const dailySynthesesRepository = new DailySynthesesRepository(serviceClient);
    const analyticsRepository = new AnalyticsRepository(serviceClient);

    // Inițializează serviciile (injectăm explicit clientul Supabase și repository-urile)
    const userService = new UserService(serviceClient, userRepository);
    const stiriService = new StiriService(stiriRepository);
    const newsletterService = new NewsletterService(newsletterRepository);
    const dailySynthesesService = new DailySynthesesService(dailySynthesesRepository);
    const analyticsService = new AnalyticsService(analyticsRepository);
    const legislativeConnectionsService = new LegislativeConnectionsService(serviceClient);

    // Creează resolver-ii
    const resolvers = createResolvers({ userService, stiriService, userRepository, newsletterService, dailySynthesesService, analyticsService, legislativeConnectionsService });

    // Configurează serverul Apollo
    server = new ApolloServer({
      typeDefs,
      resolvers,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        {
          requestDidStart: async ({ request, document }) => {
            // Validarea complexității query-ului
            if (document) {
              const complexity = calculateQueryComplexity(document);
              const maxComplexity = parseInt(process.env.MAX_QUERY_COMPLEXITY) || 1000;
              
              if (complexity > maxComplexity) {
                throw new GraphQLError(
                  `Query prea complex. Complexitatea: ${complexity}, Maxim permis: ${maxComplexity}`,
                  null,
                  null,
                  null,
                  null,
                  null,
                  { code: 'QUERY_TOO_COMPLEX' }
                );
              }
            }
          },
          // Integrează rate limiting pe întreg request-ul după rezolvarea operației
          // pentru a avea contextul (utilizatorul) disponibil
          didResolveOperation: async (requestContext) => {
            try {
              const rateLimiter = createRateLimiterMiddleware(userRepository);
              await rateLimiter(requestContext);
            } catch (err) {
              throw err;
            }
          }
        },
        // Activează landing page doar când UI-ul este permis
        ...(enableGraphQLUI
          ? [process.env.NODE_ENV === 'production'
              ? ApolloServerPluginLandingPageProductionDefault({ embed: true })
              : ApolloServerPluginLandingPageLocalDefault({ embed: true })]
          : [])
      ],
      introspection: apolloConfig.introspection,
      formatError: (error) => {
        console.error('GraphQL Error:', error);
        
        // Nu expune detalii interne în producție
        if (process.env.NODE_ENV === 'production') {
          return {
            message: error.message,
            code: error.extensions?.code || 'INTERNAL_ERROR'
          };
        }
        
        return error;
      },
      validationRules: [
        depthLimit(parseInt(process.env.MAX_QUERY_DEPTH) || 7)
      ]
    });

    // Pornește serverul Apollo
    await server.start();
    console.log('✅ Serverul Apollo pornit cu succes');

    // Configurează middleware-ul de autentificare
    const authMiddleware = createAuthMiddleware(userService);

    // Aplică middleware-urile de securitate adiționale
    const securityMiddlewares = createSecurityMiddleware();
    const internalApiKeyMiddleware = createInternalApiKeyMiddleware();

    // Aplică middleware-urile la Express
    app.use('/graphql', 
      internalApiKeyMiddleware,
      ...securityMiddlewares,
      authMiddleware,
      expressMiddleware(server, {
        context: async ({ req }) => {
          // Contextul GraphQL - utilizatorul este setat de middleware-ul de autentificare
          return {
            user: req.user,
            supabase: supabaseClient.getServiceClient(),
            req
          };
        }
      })
    );

    // Endpoint de health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Endpoint REST: Vizualizare știre după ID cu tracking vizualizări
    app.get('/news/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const ip =
          (req.headers['cf-connecting-ip'])
          || (req.headers['x-real-ip'])
          || (req.headers['x-forwarded-for']?.split(',')[0]?.trim())
          || req.ip
          || req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'];
        // Folosește o sesiune simplă pe cookie pentru deduplicări mai inteligente
        const sessionId = getCookieValue(req.headers?.cookie, 'mo_session')
          || req.headers['x-session-id'];
        if (ip) {
          try { await stiriService.trackStireView(id, { ip, userAgent, sessionId }); } catch (e) {}
        }
        const stire = await stiriService.getStireById(id);
        if (!stire) {
          return res.status(404).json({ error: 'Not Found' });
        }
        res.json(stire);
      } catch (err) {
        console.error('Eroare GET /news/:id', err);
        res.status(500).json({ error: 'Eroare internă a serverului' });
      }
    });

    // Endpoint REST: Cele mai citite știri
    app.get('/news/most-read', async (req, res) => {
      try {
        const period = typeof req.query.period === 'string' ? req.query.period : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
        const result = await stiriService.getMostReadStiri({ period, limit });
        res.json(result);
      } catch (err) {
        console.error('Eroare GET /news/most-read', err);
        res.status(500).json({ error: 'Eroare internă a serverului' });
      }
    });

    // Endpoint REST: Sinteza zilnică de tip detailed pentru o zi dată
    app.get('/syntheses/daily', async (req, res) => {
      try {
        const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
        if (!dateParam) {
          return res.status(400).json({ error: 'Parametrul "date" este obligatoriu (YYYY-MM-DD).' });
        }
        const synthesis = await dailySynthesesService.getDetailedByDate(dateParam);
        if (!synthesis) {
          return res.status(404).json({ error: 'Sinteză inexistentă pentru data cerută.' });
        }
        // Returnăm câmpurile necesare exact cum sunt în DB (content este HTML brut)
        return res.json({
          synthesis_date: synthesis.synthesis_date,
          title: synthesis.title,
          content: synthesis.content,
          summary: synthesis.summary,
          metadata: synthesis.metadata
        });
      } catch (err) {
        console.error('Eroare GET /syntheses/daily', err);
        if (err?.extensions?.code === 'BAD_USER_INPUT') {
          return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Eroare internă a serverului' });
      }
    });

    // Endpoint pentru informații despre API
    app.get('/', (req, res) => {
      res.json({
        name: 'Monitorul Oficial API',
        version: '1.0.0',
        description: 'API GraphQL pentru Monitorul Oficial',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
          graphql: '/graphql',
          health: '/health'
        },
        documentation: 'Consultați schema GraphQL pentru detalii'
      });
    });

    // Middleware pentru gestionarea erorilor
    app.use((error, req, res, next) => {
      console.error('Express Error:', error);
      res.status(500).json({
        error: 'Eroare internă a serverului',
        message: process.env.NODE_ENV === 'development' ? error.message : 'O eroare neașteptată a apărut'
      });
    });

    return { server, app, httpServer };

  } catch (error) {
    console.error('❌ Eroare la inițializarea serverului:', error);
    throw error;
  }
}

/**
 * Funcția principală pentru serverless (Vercel)
 */
export default async function handler(req, res) {
  try {
    const { server, app, httpServer } = await initializeServer();
    
    // Simulează un request Express pentru serverless
    const expressReq = {
      ...req,
      url: req.url.replace('/api', ''),
      originalUrl: req.url.replace('/api', '')
    };
    
    const expressRes = {
      ...res,
      setHeader: (name, value) => res.setHeader(name, value),
      write: (data) => res.write(data),
      end: (data) => res.end(data)
    };

    // Procesează request-ul prin Express
    app(expressReq, expressRes);

  } catch (error) {
    console.error('❌ Eroare în handler serverless:', error);
    res.status(500).json({
      error: 'Eroare internă a serverului',
      message: process.env.NODE_ENV === 'development' ? error.message : 'O eroare neașteptată a apărut'
    });
  }
}

/**
 * Funcția pentru pornirea serverului local (dezvoltare)
 */
async function startServer() {
  try {
    const { server, app, httpServer } = await initializeServer();

    // Pornește serverul HTTP
    const port = apolloConfig.port;
    await new Promise((resolve) => httpServer.listen({ port }, resolve));
    
    console.log(`🚀 Serverul rulează pe http://localhost:${port}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${port}/graphql`);
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    
    if (apolloConfig.introspection) {
      console.log(`🔍 GraphQL Playground: http://localhost:${port}/graphql`);
    }

    // Gestionarea închiderii graceful
    process.on('SIGTERM', async () => {
      console.log('🛑 Primit semnal SIGTERM, închidere graceful...');
      await server.stop();
      httpServer.close(() => {
        console.log('✅ Server închis cu succes');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('🛑 Primit semnal SIGINT, închidere graceful...');
      await server.stop();
      httpServer.close(() => {
        console.log('✅ Server închis cu succes');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Eroare la pornirea serverului:', error);
    process.exit(1);
  }
}

// Pornește serverul dacă acest fișier este rulat direct (dezvoltare locală)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
