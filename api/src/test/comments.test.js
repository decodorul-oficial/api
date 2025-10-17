/**
 * Teste pentru sistemul de comentarii
 * Testează funcționalitatea completă a sistemului de comentarii
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CommentService } from '../core/services/CommentService.js';
import { CommentRepository } from '../database/repositories/CommentRepository.js';

// Mock pentru Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          range: jest.fn()
        })),
        single: jest.fn()
      })),
      order: jest.fn(() => ({
        range: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    })),
    rpc: jest.fn()
  }))
};

// Mock pentru UserService
const mockUserService = {
  checkTrialStatus: jest.fn()
};

// Mock pentru SubscriptionService
const mockSubscriptionService = {
  getUserSubscription: jest.fn()
};

describe('Comment System', () => {
  let commentService;
  let commentRepository;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize services
    commentRepository = new CommentRepository(mockSupabaseClient);
    commentService = new CommentService(mockSupabaseClient, mockUserService, mockSubscriptionService);
  });

  describe('CommentService', () => {
    describe('canUserComment', () => {
      it('should return true for user with active subscription', async () => {
        mockSubscriptionService.getUserSubscription.mockResolvedValue({
          status: 'ACTIVE'
        });

        const result = await commentService.canUserComment('user-123');
        expect(result).toBe(true);
      });

      it('should return true for user with active trial', async () => {
        mockSubscriptionService.getUserSubscription.mockResolvedValue(null);
        mockUserService.checkTrialStatus.mockResolvedValue({
          isTrial: true
        });

        const result = await commentService.canUserComment('user-123');
        expect(result).toBe(true);
      });

      it('should return false for user without subscription or trial', async () => {
        mockSubscriptionService.getUserSubscription.mockResolvedValue(null);
        mockUserService.checkTrialStatus.mockResolvedValue({
          isTrial: false
        });

        const result = await commentService.canUserComment('user-123');
        expect(result).toBe(false);
      });
    });

    describe('createComment', () => {
      const mockCommentData = {
        content: 'Acesta este un comentariu de test',
        parentType: 'stire',
        parentId: '123'
      };

      beforeEach(() => {
        mockSubscriptionService.getUserSubscription.mockResolvedValue({
          status: 'ACTIVE'
        });
        mockSupabaseClient.rpc.mockResolvedValue({ data: true });
        mockSupabaseClient.from().insert().select().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            user_id: 'user-123',
            content: mockCommentData.content,
            parent_type: mockCommentData.parentType,
            parent_id: mockCommentData.parentId,
            created_at: '2024-01-01T00:00:00Z',
            user: {
              id: 'user-123',
              email: 'test@example.com',
              profile: {
                displayName: 'Test User',
                subscriptionTier: 'pro'
              }
            }
          },
          error: null
        });
      });

      it('should create a comment successfully', async () => {
        const result = await commentService.createComment('user-123', mockCommentData);

        expect(result).toBeDefined();
        expect(result.content).toBe(mockCommentData.content);
        expect(result.parent_type).toBe(mockCommentData.parentType);
        expect(result.parent_id).toBe(mockCommentData.parentId);
      });

      it('should throw error for user without permission', async () => {
        mockSubscriptionService.getUserSubscription.mockResolvedValue(null);
        mockUserService.checkTrialStatus.mockResolvedValue({ isTrial: false });

        await expect(
          commentService.createComment('user-123', mockCommentData)
        ).rejects.toThrow('Nu aveți permisiunea de a comenta');
      });

      it('should throw error for empty content', async () => {
        const invalidData = { ...mockCommentData, content: '' };

        await expect(
          commentService.createComment('user-123', invalidData)
        ).rejects.toThrow('Conținutul comentariului nu poate fi gol');
      });

      it('should throw error for content too long', async () => {
        const invalidData = { 
          ...mockCommentData, 
          content: 'a'.repeat(2001) 
        };

        await expect(
          commentService.createComment('user-123', invalidData)
        ).rejects.toThrow('Comentariul nu poate depăși 2000 de caractere');
      });

      it('should throw error for invalid parent type', async () => {
        const invalidData = { 
          ...mockCommentData, 
          parentType: 'invalid' 
        };

        await expect(
          commentService.createComment('user-123', invalidData)
        ).rejects.toThrow('Tipul părinte invalid');
      });
    });

    describe('getComments', () => {
      beforeEach(() => {
        mockSupabaseClient.from().select().eq().eq().order().range.mockResolvedValue({
          data: [
            {
              id: 'comment-1',
              content: 'Primul comentariu',
              user_id: 'user-1',
              created_at: '2024-01-01T00:00:00Z',
              user: {
                id: 'user-1',
                email: 'user1@example.com',
                profile: {
                  displayName: 'User 1'
                }
              }
            }
          ],
          error: null,
          count: 1
        });
      });

      it('should return comments with pagination', async () => {
        const result = await commentService.getComments('stire', '123', {
          limit: 10,
          offset: 0
        });

        expect(result.comments).toHaveLength(1);
        expect(result.totalCount).toBe(1);
        expect(result.hasNextPage).toBe(false);
        expect(result.hasPreviousPage).toBe(false);
      });

      it('should throw error for invalid parent type', async () => {
        await expect(
          commentService.getComments('invalid', '123')
        ).rejects.toThrow('Tipul părintelui invalid');
      });
    });

    describe('updateComment', () => {
      beforeEach(() => {
        mockSupabaseClient.from().select().eq().eq().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            user_id: 'user-123',
            content: 'Conținut original'
          },
          error: null
        });
        mockSupabaseClient.from().insert.mockResolvedValue({
          data: {},
          error: null
        });
        mockSupabaseClient.from().update().eq().eq().select().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            content: 'Conținut actualizat',
            is_edited: true,
            edited_at: '2024-01-01T01:00:00Z',
            user: {
              id: 'user-123',
              email: 'test@example.com',
              profile: {
                displayName: 'Test User'
              }
            },
            editHistory: []
          },
          error: null
        });
      });

      it('should update comment successfully', async () => {
        const result = await commentService.updateComment('comment-123', 'user-123', {
          content: 'Conținut actualizat'
        });

        expect(result.content).toBe('Conținut actualizat');
        expect(result.is_edited).toBe(true);
      });

      it('should throw error for non-owner', async () => {
        mockSupabaseClient.from().select().eq().eq().single.mockResolvedValue({
          data: null,
          error: { message: 'Not found' }
        });

        await expect(
          commentService.updateComment('comment-123', 'different-user', {
            content: 'Conținut actualizat'
          })
        ).rejects.toThrow('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l edita');
      });
    });

    describe('deleteComment', () => {
      beforeEach(() => {
        mockSupabaseClient.from().select().eq().eq().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            user_id: 'user-123'
          },
          error: null
        });
        mockSupabaseClient.from().delete().eq().eq().mockResolvedValue({
          data: {},
          error: null
        });
      });

      it('should delete comment successfully', async () => {
        const result = await commentService.deleteComment('comment-123', 'user-123');
        expect(result).toBe(true);
      });

      it('should throw error for non-owner', async () => {
        mockSupabaseClient.from().select().eq().eq().single.mockResolvedValue({
          data: null,
          error: { message: 'Not found' }
        });

        await expect(
          commentService.deleteComment('comment-123', 'different-user')
        ).rejects.toThrow('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l șterge');
      });
    });
  });

  describe('CommentRepository', () => {
    describe('createComment', () => {
      it('should create comment with user data', async () => {
        const commentData = {
          user_id: 'user-123',
          content: 'Test comment',
          parent_type: 'stire',
          parent_id: '123'
        };

        mockSupabaseClient.from().insert().select().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            ...commentData,
            user: {
              id: 'user-123',
              email: 'test@example.com',
              profile: {
                displayName: 'Test User'
              }
            }
          },
          error: null
        });

        const result = await commentRepository.createComment(commentData);
        expect(result.id).toBe('comment-123');
        expect(result.user).toBeDefined();
      });

      it('should throw error on database error', async () => {
        mockSupabaseClient.from().insert().select().single.mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        });

        await expect(
          commentRepository.createComment({})
        ).rejects.toThrow('Eroare la crearea comentariului: Database error');
      });
    });

    describe('getComments', () => {
      it('should return comments with pagination', async () => {
        mockSupabaseClient.from().select().eq().eq().order().range.mockResolvedValue({
          data: [
            {
              id: 'comment-1',
              content: 'Test comment',
              user_id: 'user-1',
              created_at: '2024-01-01T00:00:00Z'
            }
          ],
          error: null,
          count: 1
        });

        const result = await commentRepository.getComments('stire', '123', {
          limit: 10,
          offset: 0
        });

        expect(result.comments).toHaveLength(1);
        expect(result.totalCount).toBe(1);
      });
    });

    describe('updateComment', () => {
      it('should save edit history and update comment', async () => {
        // Mock pentru obținerea comentariului curent
        mockSupabaseClient.from().select().eq().eq().single.mockResolvedValueOnce({
          data: {
            content: 'Conținut original'
          },
          error: null
        });

        // Mock pentru salvarea istoricului
        mockSupabaseClient.from().insert.mockResolvedValue({
          data: {},
          error: null
        });

        // Mock pentru actualizarea comentariului
        mockSupabaseClient.from().update().eq().eq().select().single.mockResolvedValue({
          data: {
            id: 'comment-123',
            content: 'Conținut actualizat',
            is_edited: true,
            edited_at: '2024-01-01T01:00:00Z'
          },
          error: null
        });

        const result = await commentRepository.updateComment('comment-123', 'user-123', {
          content: 'Conținut actualizat'
        });

        expect(result.content).toBe('Conținut actualizat');
        expect(result.is_edited).toBe(true);
      });
    });
  });
});
