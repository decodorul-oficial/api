/**
 * Vercel Serverless Function Entry Point
 * Versiune CommonJS pentru compatibilitate Vercel
 */

const express = require('express');
const cors = require('cors');

// Inițializează Express
const app = express();

// Configurează CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Parsează JSON
app.use(express.json({ limit: '10mb' }));

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    message: 'API Monitorul Oficial funcționează!'
  });
});

// Endpoint pentru informații despre API
app.get('/', (req, res) => {
  res.json({
    name: 'Monitorul Oficial API',
    version: '1.0.0',
    description: 'API GraphQL pentru Monitorul Oficial',
    environment: process.env.NODE_ENV || 'development',
    status: 'Serverless function active',
    endpoints: {
      health: '/health',
      graphql: '/graphql (coming soon)'
    }
  });
});

// Endpoint temporar pentru GraphQL
app.post('/graphql', (req, res) => {
  res.json({
    message: 'GraphQL endpoint în construcție',
    status: 'development',
    timestamp: new Date().toISOString()
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

// Funcția principală pentru serverless (Vercel)
module.exports = function handler(req, res) {
  return app(req, res);
};
