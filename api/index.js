/**
 * Vercel Serverless Function Entry Point
 * Versiune simplificată pentru testare
 */

export default async function handler(req, res) {
  // Setează headers pentru JSON și CORS
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Endpoint de health check
    if (req.url === '/health' || req.url === '/api/health') {
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        message: 'API Monitorul Oficial funcționează!',
        method: req.method,
        url: req.url
      });
    }

    // Endpoint principal
    if (req.url === '/' || req.url === '/api') {
      return res.status(200).json({
        name: 'Monitorul Oficial API',
        version: '1.0.0',
        description: 'API GraphQL pentru Monitorul Oficial',
        environment: process.env.NODE_ENV || 'development',
        status: 'Serverless function active',
        endpoints: {
          health: '/health',
          graphql: '/graphql'
        },
        method: req.method,
        url: req.url
      });
    }

    // Endpoint GraphQL (placeholder)
    if (req.url === '/graphql' || req.url === '/api/graphql') {
      return res.status(200).json({
        message: 'GraphQL endpoint - în construcție',
        status: 'working',
        method: req.method,
        url: req.url
      });
    }

    // Default response
    return res.status(404).json({
      error: 'Endpoint not found',
      availableEndpoints: ['/', '/health', '/graphql'],
      method: req.method,
      url: req.url
    });

  } catch (error) {
    console.error('❌ Eroare în handler serverless:', error);
    res.status(500).json({
      error: 'Eroare internă a serverului',
      message: process.env.NODE_ENV === 'development' ? error.message : 'O eroare neașteptată a apărut',
      timestamp: new Date().toISOString()
    });
  }
}
