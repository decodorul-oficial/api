// Importurile necesare din biblioteci
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import depthLimit from 'graphql-depth-limit';

// Importurile modulelor tale locale
import config from './src/config/index.js';
import typeDefs from './src/api/schema.js';
import resolvers from './src/api/resolvers.js';
import supabase from './src/database/supabaseClient.js'; // Clientul Supabase
import { createRateLimiterMiddleware } from './src/middleware/rateLimiter.js'; // Middleware-ul de rate-limiting

// Inițializează aplicația Express
const app = express();
const httpServer = http.createServer(app);

// Inițializează serverul Apollo cu schema și resolver-ii
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Dezactivează uneltele de debug în producție pentru securitate
  introspection: !config.isProduction, 
  validationRules: [depthLimit(7)], // Aplică limita de complexitate a query-urilor
});

// Funcție asincronă pentru a porni serverul
const startServer = async () => {
  await server.start();

  // Aplică middleware-urile de securitate și CORS
  app.use(helmet());
  app.use(cors());

  // Setează endpoint-ul GraphQL și aplică middleware-ul Apollo
  // Aici se întâmplă magia: autentificare, rate-limiting și execuția resolver-ilor
  app.use(
    '/', // Va rula pe calea definită în vercel.json (ex: /graphql)
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // 1. Autentificare via Supabase
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        let user = null;

        if (token) {
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data.user) {
            // Atașăm profilul la obiectul user pentru a ști tier-ul
            const { data: profileData } = await supabase
              .from('profiles')
              .select('subscription_tier')
              .eq('id', data.user.id)
              .single();
            user = { ...data.user, profile: profileData };
          }
        }
        
        // 2. Aplică Rate-Limiting DUPĂ ce știm cine e utilizatorul
        // TODO: Implementează rate limiting aici cu createRateLimiterMiddleware

        // 3. Returnează contextul pentru a fi disponibil în resolveri
        return { user, supabase };
      },
    })
  );
};

// Pornește serverul
startServer();

// Exportă aplicația Express pentru ca Vercel să o poată folosi
export default app;