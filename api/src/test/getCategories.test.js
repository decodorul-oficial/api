/**
 * Teste pentru endpoint-ul getCategories
 * Verifică restricțiile de acces bazate pe trial/abonament
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { createResolvers } from '../api/resolvers.js';

// Mock pentru servicii
const mockStiriService = {
  getCategories: jest.fn()
};

const mockUserService = {
  validateToken: jest.fn()
};

const mockUserRepository = {
  getRequestCountLast24Hours: jest.fn(),
  logRequest: jest.fn()
};

const mockNewsletterService = {};
const mockDailySynthesesService = {};
const mockAnalyticsService = {};
const mockLegislativeConnectionsService = {};
const mockSavedSearchService = {};
const mockSupabaseClient = {};

// Creează resolver-ii cu serviciile mock
const resolvers = createResolvers({
  userService: mockUserService,
  stiriService: mockStiriService,
  userRepository: mockUserRepository,
  newsletterService: mockNewsletterService,
  dailySynthesesService: mockDailySynthesesService,
  analyticsService: mockAnalyticsService,
  legislativeConnectionsService: mockLegislativeConnectionsService,
  savedSearchService: mockSavedSearchService,
  supabaseClient: mockSupabaseClient
});

describe('getCategories Access Control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock pentru getCategories service
    mockStiriService.getCategories.mockResolvedValue([
      { name: 'Legislative', slug: 'legislative', count: 100 },
      { name: 'Government', slug: 'government', count: 50 }
    ]);
  });

  describe('Unauthenticated User', () => {
    it('should throw UNAUTHENTICATED error', async () => {
      const context = { user: null };
      
      await expect(
        resolvers.Query.getCategories(null, { limit: 10 }, context)
      ).rejects.toThrow(GraphQLError);
      
      await expect(
        resolvers.Query.getCategories(null, { limit: 10 }, context)
      ).rejects.toMatchObject({
        message: 'Utilizator neautentificat',
        extensions: {
          code: 'UNAUTHENTICATED'
        }
      });
    });
  });

  describe('Authenticated User without Subscription', () => {
    it('should throw SUBSCRIPTION_REQUIRED error', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'free'
          },
          trialStatus: {
            isTrial: false,
            hasTrial: false,
            expired: false
          }
        }
      };
      
      await expect(
        resolvers.Query.getCategories(null, { limit: 10 }, context)
      ).rejects.toThrow(GraphQLError);
      
      await expect(
        resolvers.Query.getCategories(null, { limit: 10 }, context)
      ).rejects.toMatchObject({
        message: 'Această funcționalitate necesită un abonament activ sau trial',
        extensions: {
          code: 'SUBSCRIPTION_REQUIRED'
        }
      });
    });
  });

  describe('User in Trial Period', () => {
    it('should allow access and return categories', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: true,
            hasTrial: true,
            expired: false
          }
        }
      };
      
      const result = await resolvers.Query.getCategories(null, { limit: 10 }, context);
      
      expect(result).toEqual([
        { name: 'Legislative', slug: 'legislative', count: 100 },
        { name: 'Government', slug: 'government', count: 50 }
      ]);
      
      expect(mockStiriService.getCategories).toHaveBeenCalledWith({ limit: 10 });
    });
  });

  describe('User with Active Subscription', () => {
    it('should allow access and return categories', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: false,
            hasTrial: true,
            expired: true
          }
        }
      };
      
      const result = await resolvers.Query.getCategories(null, { limit: 50 }, context);
      
      expect(result).toEqual([
        { name: 'Legislative', slug: 'legislative', count: 100 },
        { name: 'Government', slug: 'government', count: 50 }
      ]);
      
      expect(mockStiriService.getCategories).toHaveBeenCalledWith({ limit: 50 });
    });
  });

  describe('Limit Validation', () => {
    it('should use default limit when not provided', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: true,
            hasTrial: true,
            expired: false
          }
        }
      };
      
      await resolvers.Query.getCategories(null, {}, context);
      
      expect(mockStiriService.getCategories).toHaveBeenCalledWith({ limit: 100 });
    });

    it('should use provided limit when valid', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: true,
            hasTrial: true,
            expired: false
          }
        }
      };
      
      await resolvers.Query.getCategories(null, { limit: 25 }, context);
      
      expect(mockStiriService.getCategories).toHaveBeenCalledWith({ limit: 25 });
    });

    it('should use default limit when invalid', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: true,
            hasTrial: true,
            expired: false
          }
        }
      };
      
      await resolvers.Query.getCategories(null, { limit: -5 }, context);
      
      expect(mockStiriService.getCategories).toHaveBeenCalledWith({ limit: 100 });
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors', async () => {
      const context = {
        user: {
          id: 'user-1',
          profile: {
            subscriptionTier: 'pro'
          },
          trialStatus: {
            isTrial: true,
            hasTrial: true,
            expired: false
          }
        }
      };
      
      const serviceError = new GraphQLError('Database error');
      mockStiriService.getCategories.mockRejectedValue(serviceError);
      
      await expect(
        resolvers.Query.getCategories(null, { limit: 10 }, context)
      ).rejects.toThrow(serviceError);
    });
  });
});
