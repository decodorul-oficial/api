/**
 * Teste pentru endpoint-ul getStiriByCategorySlug
 * Verifică restricțiile de acces bazate pe trial/abonament
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { createResolvers } from '../api/resolvers.js';

// Mock pentru servicii
const mockStiriService = {
  getStiriByCategorySlug: jest.fn()
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

describe('getStiriByCategorySlug Access Control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock pentru getStiriByCategorySlug service
    mockStiriService.getStiriByCategorySlug.mockResolvedValue({
      stiri: [
        { 
          id: '1', 
          title: 'Știre legislative 1', 
          publicationDate: '2024-01-01T00:00:00Z',
          category: 'Legislative'
        },
        { 
          id: '2', 
          title: 'Știre legislative 2', 
          publicationDate: '2024-01-02T00:00:00Z',
          category: 'Legislative'
        }
      ],
      pagination: {
        totalCount: 100,
        hasNextPage: true
      }
    });
  });

  describe('Unauthenticated User', () => {
    it('should throw UNAUTHENTICATED error', async () => {
      const context = { user: null };
      const args = { slug: 'legislative', limit: 10 };
      
      await expect(
        resolvers.Query.getStiriByCategorySlug(null, args, context)
      ).rejects.toThrow(GraphQLError);
      
      await expect(
        resolvers.Query.getStiriByCategorySlug(null, args, context)
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
      const args = { slug: 'legislative', limit: 10 };
      
      await expect(
        resolvers.Query.getStiriByCategorySlug(null, args, context)
      ).rejects.toThrow(GraphQLError);
      
      await expect(
        resolvers.Query.getStiriByCategorySlug(null, args, context)
      ).rejects.toMatchObject({
        message: 'Această funcționalitate necesită un abonament activ sau trial',
        extensions: {
          code: 'SUBSCRIPTION_REQUIRED'
        }
      });
    });
  });

  describe('User in Trial Period', () => {
    it('should allow access and return stories', async () => {
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
      const args = { 
        slug: 'legislative', 
        limit: 20, 
        offset: 0, 
        orderBy: 'publicationDate', 
        orderDirection: 'desc' 
      };
      
      const result = await resolvers.Query.getStiriByCategorySlug(null, args, context);
      
      expect(result).toEqual({
        stiri: [
          { 
            id: '1', 
            title: 'Știre legislative 1', 
            publicationDate: '2024-01-01T00:00:00Z',
            category: 'Legislative'
          },
          { 
            id: '2', 
            title: 'Știre legislative 2', 
            publicationDate: '2024-01-02T00:00:00Z',
            category: 'Legislative'
          }
        ],
        pagination: {
          totalCount: 100,
          hasNextPage: true
        }
      });
      
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith({
        slug: 'legislative',
        limit: 20,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });
  });

  describe('User with Active Subscription', () => {
    it('should allow access and return stories', async () => {
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
      const args = { 
        slug: 'government', 
        limit: 50, 
        offset: 10, 
        orderBy: 'createdAt', 
        orderDirection: 'asc' 
      };
      
      const result = await resolvers.Query.getStiriByCategorySlug(null, args, context);
      
      expect(result).toEqual({
        stiri: [
          { 
            id: '1', 
            title: 'Știre legislative 1', 
            publicationDate: '2024-01-01T00:00:00Z',
            category: 'Legislative'
          },
          { 
            id: '2', 
            title: 'Știre legislative 2', 
            publicationDate: '2024-01-02T00:00:00Z',
            category: 'Legislative'
          }
        ],
        pagination: {
          totalCount: 100,
          hasNextPage: true
        }
      });
      
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith({
        slug: 'government',
        limit: 50,
        offset: 10,
        orderBy: 'created_at',
        orderDirection: 'asc'
      });
    });
  });

  describe('Parameter Normalization', () => {
    it('should normalize orderBy parameters correctly', async () => {
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
      
      // Test publicationDate normalization
      const args1 = { 
        slug: 'legislative', 
        orderBy: 'publicationDate' 
      };
      
      await resolvers.Query.getStiriByCategorySlug(null, args1, context);
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'publication_date'
        })
      );
      
      // Test createdAt normalization
      const args2 = { 
        slug: 'legislative', 
        orderBy: 'createdAt' 
      };
      
      await resolvers.Query.getStiriByCategorySlug(null, args2, context);
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'created_at'
        })
      );
      
      // Test other orderBy values pass through
      const args3 = { 
        slug: 'legislative', 
        orderBy: 'title' 
      };
      
      await resolvers.Query.getStiriByCategorySlug(null, args3, context);
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'title'
        })
      );
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
      const args = { slug: 'legislative', limit: 10 };
      
      const serviceError = new GraphQLError('Database error');
      mockStiriService.getStiriByCategorySlug.mockRejectedValue(serviceError);
      
      await expect(
        resolvers.Query.getStiriByCategorySlug(null, args, context)
      ).rejects.toThrow(serviceError);
    });
  });

  describe('Required Parameters', () => {
    it('should handle missing slug parameter', async () => {
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
      const args = { limit: 10 }; // Missing slug
      
      await resolvers.Query.getStiriByCategorySlug(null, args, context);
      
      expect(mockStiriService.getStiriByCategorySlug).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: undefined
        })
      );
    });
  });
});
