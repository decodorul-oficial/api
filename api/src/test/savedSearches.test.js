/**
 * Teste pentru funcționalitatea de căutări salvate
 */

import { jest } from '@jest/globals';
import { SavedSearchService } from '../core/services/SavedSearchService.js';
import { GraphQLError } from 'graphql';

// Mock pentru repository și userService
const mockSavedSearchRepository = {
  createSavedSearch: jest.fn(),
  getSavedSearches: jest.fn(),
  getSavedSearchById: jest.fn(),
  updateSavedSearch: jest.fn(),
  deleteSavedSearch: jest.fn(),
  toggleFavoriteSearch: jest.fn()
};

const mockUserService = {
  getUserProfile: jest.fn()
};

describe('SavedSearchService', () => {
  let savedSearchService;

  beforeEach(() => {
    savedSearchService = new SavedSearchService(mockSavedSearchRepository, mockUserService);
    jest.clearAllMocks();
  });

  describe('Subscription validation', () => {
    it('should allow Pro users to save searches', async () => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'pro'
      });
      mockSavedSearchRepository.createSavedSearch.mockResolvedValue({
        id: 'search-1',
        name: 'Test Search',
        search_params: { query: 'test' },
        is_favorite: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });

      const result = await savedSearchService.saveSearch('user-1', {
        name: 'Test Search',
        searchParams: { query: 'test' }
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Search');
    });

    it('should allow Enterprise users to save searches', async () => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'enterprise'
      });
      mockSavedSearchRepository.createSavedSearch.mockResolvedValue({
        id: 'search-1',
        name: 'Test Search',
        search_params: { query: 'test' },
        is_favorite: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });

      const result = await savedSearchService.saveSearch('user-1', {
        name: 'Test Search',
        searchParams: { query: 'test' }
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Search');
    });

    it('should reject Free users from saving searches', async () => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'free'
      });

      await expect(
        savedSearchService.saveSearch('user-1', {
          name: 'Test Search',
          searchParams: { query: 'test' }
        })
      ).rejects.toThrow(GraphQLError);
    });

    it('should reject users when profile fetch fails', async () => {
      mockUserService.getUserProfile.mockRejectedValue(new Error('Profile not found'));

      await expect(
        savedSearchService.saveSearch('user-1', {
          name: 'Test Search',
          searchParams: { query: 'test' }
        })
      ).rejects.toThrow(GraphQLError);
    });
  });

  describe('Search operations', () => {
    beforeEach(() => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'pro'
      });
    });

    it('should create a saved search', async () => {
      const searchData = {
        id: 'search-1',
        name: 'Test Search',
        description: 'Test description',
        search_params: { query: 'test' },
        is_favorite: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockSavedSearchRepository.createSavedSearch.mockResolvedValue(searchData);

      const result = await savedSearchService.saveSearch('user-1', {
        name: 'Test Search',
        description: 'Test description',
        searchParams: { query: 'test' }
      });

      expect(mockSavedSearchRepository.createSavedSearch).toHaveBeenCalledWith({
        user_id: 'user-1',
        name: 'Test Search',
        description: 'Test description',
        search_params: { query: 'test' },
        is_favorite: false
      });

      expect(result).toEqual({
        id: 'search-1',
        name: 'Test Search',
        description: 'Test description',
        searchParams: { query: 'test' },
        isFavorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      });
    });

    it('should get saved searches with pagination', async () => {
      const mockResult = {
        savedSearches: [
          {
            id: 'search-1',
            name: 'Search 1',
            search_params: { query: 'test1' },
            is_favorite: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }
        ],
        totalCount: 1,
        hasNextPage: false,
        hasPreviousPage: false
      };

      mockSavedSearchRepository.getSavedSearches.mockResolvedValue(mockResult);

      const result = await savedSearchService.getSavedSearches('user-1', {
        limit: 10,
        offset: 0
      });

      expect(result.savedSearches).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
    });

    it('should get saved search by ID', async () => {
      const mockSearch = {
        id: 'search-1',
        name: 'Test Search',
        search_params: { query: 'test' },
        is_favorite: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockSavedSearchRepository.getSavedSearchById.mockResolvedValue(mockSearch);

      const result = await savedSearchService.getSavedSearchById('user-1', 'search-1');

      expect(result).toEqual({
        id: 'search-1',
        name: 'Test Search',
        searchParams: { query: 'test' },
        isFavorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      });
    });

    it('should return null for non-existent search', async () => {
      mockSavedSearchRepository.getSavedSearchById.mockResolvedValue(null);

      const result = await savedSearchService.getSavedSearchById('user-1', 'non-existent');

      expect(result).toBeNull();
    });

    it('should update saved search', async () => {
      const updatedSearch = {
        id: 'search-1',
        name: 'Updated Search',
        search_params: { query: 'updated' },
        is_favorite: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      mockSavedSearchRepository.updateSavedSearch.mockResolvedValue(updatedSearch);

      const result = await savedSearchService.updateSavedSearch('user-1', 'search-1', {
        name: 'Updated Search',
        searchParams: { query: 'updated' }
      });

      expect(result.name).toBe('Updated Search');
    });

    it('should delete saved search', async () => {
      mockSavedSearchRepository.deleteSavedSearch.mockResolvedValue(true);

      const result = await savedSearchService.deleteSavedSearch('user-1', 'search-1');

      expect(result).toBe(true);
    });

    it('should toggle favorite status', async () => {
      const mockSearch = {
        id: 'search-1',
        name: 'Test Search',
        is_favorite: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockSavedSearchRepository.getSavedSearchById.mockResolvedValue(mockSearch);
      mockSavedSearchRepository.updateSavedSearch.mockResolvedValue({
        ...mockSearch,
        is_favorite: true
      });

      const result = await savedSearchService.toggleFavoriteSearch('user-1', 'search-1');

      expect(result.isFavorite).toBe(true);
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'pro'
      });
    });

    it('should handle repository errors', async () => {
      mockSavedSearchRepository.createSavedSearch.mockRejectedValue(new Error('Database error'));

      await expect(
        savedSearchService.saveSearch('user-1', {
          name: 'Test Search',
          searchParams: { query: 'test' }
        })
      ).rejects.toThrow(GraphQLError);
    });

    it('should handle duplicate name errors', async () => {
      const duplicateError = new GraphQLError('Duplicate name', {
        extensions: { code: 'DUPLICATE_NAME' }
      });
      mockSavedSearchRepository.createSavedSearch.mockRejectedValue(duplicateError);

      await expect(
        savedSearchService.saveSearch('user-1', {
          name: 'Test Search',
          searchParams: { query: 'test' }
        })
      ).rejects.toThrow(GraphQLError);
    });
  });

  describe('Input validation', () => {
    beforeEach(() => {
      mockUserService.getUserProfile.mockResolvedValue({
        subscriptionTier: 'pro'
      });
    });

    it('should validate required fields', async () => {
      await expect(
        savedSearchService.saveSearch('user-1', {
          // Missing name
          searchParams: { query: 'test' }
        })
      ).rejects.toThrow();
    });

    it('should validate search params structure', async () => {
      await expect(
        savedSearchService.saveSearch('user-1', {
          name: 'Test Search',
          searchParams: {
            invalidField: 'test' // Invalid field
          }
        })
      ).rejects.toThrow();
    });
  });
});
