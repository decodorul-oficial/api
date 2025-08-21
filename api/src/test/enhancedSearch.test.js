/**
 * Teste pentru funcționalitatea îmbunătățită searchStiriByKeywords
 */

import { jest } from '@jest/globals';
import { StiriService } from '../core/services/StiriService.js';
import { GraphQLError } from 'graphql';

// Mock pentru repository
const mockStiriRepository = {
  searchStiriByKeywords: jest.fn()
};

describe('StiriService - Enhanced searchStiriByKeywords', () => {
  let stiriService;

  beforeEach(() => {
    stiriService = new StiriService(mockStiriRepository);
    jest.clearAllMocks();
  });

  describe('Query validation', () => {
    it('should accept valid query parameter', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await stiriService.searchStiriByKeywords({
        query: 'guvern hotarare'
      });

      expect(mockStiriRepository.searchStiriByKeywords).toHaveBeenCalledWith({
        query: 'guvern hotarare',
        keywords: undefined,
        publicationDateFrom: undefined,
        publicationDateTo: undefined,
        limit: 10,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });

    it('should ignore query parameter if too short', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await stiriService.searchStiriByKeywords({
        query: 'a', // too short
        keywords: ['test']
      });

      expect(mockStiriRepository.searchStiriByKeywords).toHaveBeenCalledWith({
        query: undefined, // should be undefined
        keywords: ['test'],
        publicationDateFrom: undefined,
        publicationDateTo: undefined,
        limit: 10,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });
  });

  describe('Keywords validation', () => {
    it('should filter empty keywords', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await stiriService.searchStiriByKeywords({
        keywords: ['valid', '', '  ', 'another']
      });

      expect(mockStiriRepository.searchStiriByKeywords).toHaveBeenCalledWith({
        query: undefined,
        keywords: ['valid', 'another'], // empty ones removed
        publicationDateFrom: undefined,
        publicationDateTo: undefined,
        limit: 10,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });

    it('should throw error if all keywords are empty and no other criteria', async () => {
      await expect(
        stiriService.searchStiriByKeywords({
          keywords: ['', '  ', null]
        })
      ).rejects.toThrow(GraphQLError);
    });
  });

  describe('Date validation', () => {
    it('should accept valid date formats', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await stiriService.searchStiriByKeywords({
        query: 'test',
        publicationDateFrom: '2024-01-01',
        publicationDateTo: '2024-12-31'
      });

      expect(mockStiriRepository.searchStiriByKeywords).toHaveBeenCalledWith({
        query: 'test',
        keywords: undefined,
        publicationDateFrom: '2024-01-01',
        publicationDateTo: '2024-12-31',
        limit: 10,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });

    it('should convert ISO8601 dates to YYYY-MM-DD format', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await stiriService.searchStiriByKeywords({
        query: 'test',
        publicationDateFrom: '2024-06-15T10:30:00Z',
        publicationDateTo: '2024-08-20T15:45:00Z'
      });

      expect(mockStiriRepository.searchStiriByKeywords).toHaveBeenCalledWith({
        query: 'test',
        keywords: undefined,
        publicationDateFrom: '2024-06-15',
        publicationDateTo: '2024-08-20',
        limit: 10,
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc'
      });
    });

    it('should throw error for invalid date range', async () => {
      await expect(
        stiriService.searchStiriByKeywords({
          query: 'test',
          publicationDateFrom: '2024-12-31',
          publicationDateTo: '2024-01-01' // end before start
        })
      ).rejects.toThrow(GraphQLError);
    });

    it('should throw error for invalid date format', async () => {
      await expect(
        stiriService.searchStiriByKeywords({
          query: 'test',
          publicationDateFrom: 'invalid-date'
        })
      ).rejects.toThrow(GraphQLError);
    });
  });

  describe('Search criteria validation', () => {
    it('should throw error if no search criteria provided', async () => {
      await expect(
        stiriService.searchStiriByKeywords({})
      ).rejects.toThrow(GraphQLError);
    });

    it('should accept query as only criteria', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await expect(
        stiriService.searchStiriByKeywords({ query: 'test search' })
      ).resolves.not.toThrow();
    });

    it('should accept keywords as only criteria', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await expect(
        stiriService.searchStiriByKeywords({ keywords: ['test'] })
      ).resolves.not.toThrow();
    });

    it('should accept date range as only criteria', async () => {
      const mockResult = {
        stiri: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      await expect(
        stiriService.searchStiriByKeywords({ 
          publicationDateFrom: '2024-01-01',
          publicationDateTo: '2024-12-31'
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Response formatting', () => {
    it('should format response correctly', async () => {
      const mockStire = {
        id: 1,
        title: 'Test Title',
        publication_date: '2024-08-21',
        content: { summary: 'Test summary' },
        created_at: '2024-08-21T10:00:00Z',
        updated_at: null,
        filename: 'test.pdf',
        view_count: 5,
        predicted_views: 10
      };

      const mockResult = {
        stiri: [mockStire],
        totalCount: 1,
        hasNextPage: false,
        hasPreviousPage: false
      };
      
      mockStiriRepository.searchStiriByKeywords.mockResolvedValue(mockResult);

      const result = await stiriService.searchStiriByKeywords({
        query: 'test'
      });

      expect(result).toEqual({
        stiri: [{
          id: 1,
          title: 'Test Title',
          publicationDate: '2024-08-21',
          content: { summary: 'Test summary' },
          createdAt: '2024-08-21T10:00:00Z',
          updatedAt: null,
          filename: 'test.pdf',
          viewCount: 5,
          predictedViews: 10,
          topics: undefined,
          entities: undefined
        }],
        pagination: {
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          currentPage: 1,
          totalPages: 1
        }
      });
    });
  });
});
