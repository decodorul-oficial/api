/**
 * Vercel Serverless Function Entry Point
 * Acest fișier este punctul de intrare pentru funcțiile serverless pe Vercel
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { GraphQLError } from 'graphql';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import depthLimit from 'graphql-depth-limit';

// Importă configurația
import { 
  apolloConfig, 
  securityConfig, 
  validateEnvironment 
} from '../src/config/index.js';

// Importă clientul Supabase
import supabaseClient from '../src/database/supabaseClient.js';

// Importă repository-urile
import StiriRepository from '../src/database/repositories/StiriRepository.js';
import UserRepository from '../src/database/repositories/UserRepository.js';

// Importă serviciile
import UserService from '../src/core/services/UserService.js';
import StiriService from '../src/core/services/StiriService.js';

// Importă middleware-urile
import { createAuthMiddleware } from '../src/middleware/auth.js';

// Importă schema și resolver-ii
import typeDefs from '../src/api/schema.js';
import { createResolvers } from '../src/api/resolvers.js';

// Variabile globale pentru serverless
let server = null;
let app = null;

/**
 * Calculează complexitatea unui query GraphQL
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
 */
function calculateSelectionComplexity(selections) {
  let complexity = 0;
  
  selections.forEach(selection => {
    complexity += 1;
    
    if (selection.selectionSet && selection.selectionSet.selections) {
      complexity += calculateSelectionComplexity(selection.selectionSet.selections);
    }
  });
  
  return complexity;
}

/**
 * Inițializează serverul Apollo și Express pentru serverless
 */
async function initializeServer() {
  if (server && app) {
    return { server, app };
  }

  try {
    // Validează variabilele de mediu
    validateEnvironment();
    console.log('✅ Variabilele de mediu validate cu succes');

    // Inițializează Express
    app = express();

    // Configurează middleware-urile de securitate
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // Configurează CORS
    app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));

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
      introspection: process.env.NODE_ENV !== 'production',
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

    return { server, app };

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
    const { server, app } = await initializeServer();
    
    // Procesează request-ul prin Express
    app(req, res);

  } catch (error) {
    console.error('❌ Eroare în handler serverless:', error);
    res.status(500).json({
      error: 'Eroare internă a serverului',
      message: process.env.NODE_ENV === 'development' ? error.message : 'O eroare neașteptată a apărut'
    });
  }
}
