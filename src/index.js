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
import { GraphQLError } from 'graphql';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import depthLimit from 'graphql-depth-limit';
import http from 'http';

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

// Importă serviciile
import UserService from './core/services/UserService.js';
import StiriService from './core/services/StiriService.js';

// Importă middleware-urile
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiterMiddleware } from './middleware/rateLimiter.js';
import { createSecurityMiddleware } from './middleware/security.js';

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
    httpServer = http.createServer(app);

    // Configurează middleware-urile de securitate
    app.use(helmet(securityConfig.helmet));

    // Configurează CORS
    app.use(cors(securityConfig.cors));

    // Parsează JSON
    app.use(express.json({ limit: '10mb' }));

    // Inițializează repository-urile
    const stiriRepository = new StiriRepository(supabaseClient);
    const userRepository = new UserRepository(supabaseClient);

    // Inițializează serviciile
    const userService = new UserService(userRepository);
    const stiriService = new StiriService(stiriRepository);

    // Creează resolver-ii
    const resolvers = createResolvers(userService, stiriService);

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
          }
        }
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

    // Aplică middleware-urile la Express
    app.use('/graphql', 
      authMiddleware,
      expressMiddleware(server, {
        context: async ({ req }) => {
          // Contextul GraphQL - utilizatorul este setat de middleware-ul de autentificare
          return {
            user: req.user,
            supabase: supabaseClient.getServiceClient()
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
