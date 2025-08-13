/**
 * Punctul de intrare principal al aplicației
 * Asamblează toate modulele și configurează serverul Apollo
 * Respectă principiile SOLID prin injectarea dependențelor și separarea responsabilităților
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

/**
 * Funcția principală care inițializează și pornește serverul
 */
async function startServer() {
  try {
    // Validează variabilele de mediu
    validateEnvironment();
    console.log('✅ Variabilele de mediu validate cu succes');

    // Inițializează Express și HTTP server
    const app = express();
    const httpServer = http.createServer(app);

    // Configurează middleware-urile de securitate
    app.use(helmet(securityConfig.helmet));

    // Configurează CORS
    app.use(cors(securityConfig.cors));

    // Aplică middleware-urile de securitate avansate
    const securityMiddleware = createSecurityMiddleware();
    securityMiddleware.forEach(middleware => app.use(middleware));

    // Parsează JSON cu limită de securitate
    app.use(express.json({ limit: securityConfig.maxRequestSize }));

    // Inițializează repository-urile cu injecția dependențelor
    const stiriRepository = new StiriRepository(supabaseClient.getServiceClient());
    const userRepository = new UserRepository(supabaseClient.getServiceClient());

    // Inițializează serviciile cu injecția dependențelor
    const userService = new UserService(supabaseClient.getServiceClient(), userRepository);
    const stiriService = new StiriService(stiriRepository);

    // Creează resolver-ii cu serviciile injectate
    const resolvers = createResolvers({
      userService,
      stiriService,
      userRepository
    });

    // Configurează serverul Apollo
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      introspection: apolloConfig.introspection,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        // Plugin pentru rate limiting
        {
          requestDidStart: async (requestContext) => {
            const rateLimiter = createRateLimiterMiddleware(userRepository);
            await rateLimiter(requestContext);
          }
        }
      ],
      formatError: (error) => {
        // Logăm erorile pentru debugging
        console.error('GraphQL Error:', {
          message: error.message,
          code: error.extensions?.code,
          path: error.path,
          stack: error.extensions?.exception?.stacktrace
        });

        // Returnăm eroarea formatată pentru client
        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_ERROR',
          path: error.path
        };
      },
      validationRules: [
        // Limitează adâncimea query-urilor pentru a preveni atacurile
        depthLimit(apolloConfig.depthLimit, {
          ignore: ['__typename']
        }),
        // Regulă suplimentară pentru limitarea complexității query-urilor
        (context) => {
          const query = context.getDocument();
          const complexity = calculateQueryComplexity(query);
          
          if (complexity > securityConfig.maxQueryComplexity) {
            throw new GraphQLError('Query prea complex', {
              extensions: { code: 'QUERY_TOO_COMPLEX' }
            });
          }
        }
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
        version: '1.0.0'
      });
    });

    // Endpoint pentru informații despre API
    app.get('/', (req, res) => {
      res.json({
        name: 'Monitorul Oficial API',
        version: '1.0.0',
        description: 'API GraphQL pentru Monitorul Oficial',
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

// Pornește serverul dacă acest fișier este rulat direct
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default startServer;
