/**
 * Setup pentru testele Jest
 * Configurări globale pentru testarea API-ului GraphQL
 */

import { jest } from '@jest/globals';

// Mock pentru console.log pentru a reduce output-ul în teste
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Reduce log-urile în teste
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  // Restore console functions
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Mock pentru variabilele de mediu
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// Global test utilities
global.testUtils = {
  // Helper pentru crearea unui context GraphQL mock
  createMockContext: (user = null) => ({
    user,
    supabase: {
      auth: {
        getUser: jest.fn()
      }
    }
  }),

  // Helper pentru crearea unui user mock
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    profile: {
      id: 'test-user-id',
      subscriptionTier: 'free'
    },
    ...overrides
  }),

  // Helper pentru crearea unui repository mock
  createMockUserRepository: () => ({
    getRequestCountLast24Hours: jest.fn(),
    logRequest: jest.fn(),
    getProfileById: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    getRequestHistory: jest.fn()
  }),

  // Helper pentru crearea unui service mock
  createMockUserService: () => ({
    handleSignUp: jest.fn(),
    handleSignIn: jest.fn(),
    validateToken: jest.fn(),
    getUserProfile: jest.fn(),
    updateUserProfile: jest.fn()
  })
};

// Mock pentru GraphQLError
jest.mock('graphql', () => ({
  GraphQLError: class GraphQLError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.extensions = options.extensions || {};
      this.name = 'GraphQLError';
    }
  }
}));
