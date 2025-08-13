/**
 * Configurația pentru deployment-ul pe Vercel
 * Acest fișier oferă control granular asupra modului în care aplicația
 * este construită și rulată pe platforma Vercel.
 */

module.exports = {
  /**
   * Configurația pentru funcțiile serverless
   * Specifică cum să fie procesate diferitele rute
   */
  functions: {
    'src/index.js': {
      // Timpul maxim de execuție pentru o funcție serverless (în secunde)
      maxDuration: 30,
      // Memoria alocată pentru funcție (în MB)
      memory: 1024
    }
  },

  /**
   * Configurația pentru build
   * Specifică ce fișiere să fie incluse în build
   */
  build: {
    env: {
      // Variabile de mediu disponibile în timpul build-ului
      NODE_ENV: 'production'
    }
  },

  /**
   * Configurația pentru headers HTTP
   * Se aplică la toate rutele
   */
  headers: [
    {
      source: '/api/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY'
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block'
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin'
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains'
        }
      ]
    }
  ],

  /**
   * Configurația pentru redirects
   */
  redirects: [
    {
      source: '/',
      destination: '/api/graphql',
      permanent: false
    }
  ],

  /**
   * Configurația pentru rewrites
   * Permite routing-ul intern fără a expune structura fișierelor
   */
  rewrites: [
    {
      source: '/api/graphql',
      destination: '/src/index.js'
    },
    {
      source: '/api/health',
      destination: '/src/index.js'
    }
  ]
};
