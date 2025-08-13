/**
 * Configurația Jest pentru testarea API-ului GraphQL
 */

export default {
  // Test environment
  testEnvironment: 'node',
  
  // Extensii de fișiere pentru testare
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Directoare de ignorat
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  
  // Transformări pentru ES modules
  transform: {},
  
  // Module name mapper pentru ES modules
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/api/src/test/setup.js'],
  
  // Coverage
  collectCoverageFrom: [
    'api/src/**/*.js',
    '!api/src/**/*.test.js',
    '!api/src/test/**/*.js'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Verbose output
  verbose: true,
  
  // Timeout pentru teste
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true
};
