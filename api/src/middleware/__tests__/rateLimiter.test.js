/**
 * Teste pentru middleware-ul de rate limiting
 * Validează funcționalitatea și respectarea principiilor SOLID
 */

import { jest } from '@jest/globals';
import { 
  createRateLimiterMiddleware, 
  checkRateLimit, 
  getRateLimitInfo,
  debugRateLimit 
} from '../rateLimiter.js';
import { 
  getRequestLimit, 
  hasUnlimitedRequests, 
  getSubscriptionTierConfig 
} from '../../config/subscriptions.js';

// Mock pentru repository-ul de utilizatori
const mockUserRepository = {
  getRequestCountLast24Hours: jest.fn(),
  logRequest: jest.fn(),
  getProfileById: jest.fn()
};

// Mock pentru context-ul GraphQL
const mockContext = {
  user: {
    id: 'test-user-id',
    profile: {
      subscriptionTier: 'free'
    }
  }
};

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRateLimiterMiddleware', () => {
    it('should allow requests for unlimited tier users', async () => {
      const unlimitedContext = {
        user: {
          id: 'enterprise-user',
          profile: { subscriptionTier: 'enterprise' }
        }
      };

      const middleware = createRateLimiterMiddleware(mockUserRepository);
      
      // Nu ar trebui să arunce eroare
      await expect(middleware({ contextValue: unlimitedContext })).resolves.toBeUndefined();
      
      // Ar trebui să logheze cererea
      expect(mockUserRepository.logRequest).toHaveBeenCalledWith('enterprise-user');
    });

    it('should block requests when limit is exceeded', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(100); // Limita pentru free

      const middleware = createRateLimiterMiddleware(mockUserRepository);
      
      await expect(middleware({ contextValue: mockContext })).rejects.toThrow('RATE_LIMIT_EXCEEDED');
    });

    it('should allow requests when under limit', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(50); // Sub limita pentru free

      const middleware = createRateLimiterMiddleware(mockUserRepository);
      
      await expect(middleware({ contextValue: mockContext })).resolves.toBeUndefined();
      expect(mockUserRepository.logRequest).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle missing user gracefully', async () => {
      const noUserContext = { user: null };
      const middleware = createRateLimiterMiddleware(mockUserRepository);
      
      await expect(middleware({ contextValue: noUserContext })).resolves.toBeUndefined();
    });
  });

  describe('checkRateLimit', () => {
    it('should throw error when limit exceeded', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(100);

      await expect(checkRateLimit(mockContext, mockUserRepository)).rejects.toThrow('RATE_LIMIT_EXCEEDED');
    });

    it('should pass when under limit', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(50);

      await expect(checkRateLimit(mockContext, mockUserRepository)).resolves.toBeUndefined();
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return correct info for limited user', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(25);

      const info = await getRateLimitInfo(mockContext, mockUserRepository);

      expect(info).toEqual({
        hasUnlimitedRequests: false,
        requestLimit: 100,
        currentRequests: 25,
        remainingRequests: 75,
        tier: 'free',
        tierName: 'Free'
      });
    });

    it('should return correct info for unlimited user', async () => {
      const unlimitedContext = {
        user: {
          id: 'enterprise-user',
          profile: { subscriptionTier: 'enterprise' }
        }
      };

      const info = await getRateLimitInfo(unlimitedContext, mockUserRepository);

      expect(info).toEqual({
        hasUnlimitedRequests: true,
        requestLimit: null,
        currentRequests: 0,
        remainingRequests: null,
        tier: 'enterprise',
        tierName: 'Enterprise'
      });
    });

    it('should handle anonymous users', async () => {
      const anonymousContext = { user: null };

      const info = await getRateLimitInfo(anonymousContext, mockUserRepository);

      expect(info).toEqual({
        hasUnlimitedRequests: false,
        requestLimit: 0,
        currentRequests: 0,
        remainingRequests: 0,
        tier: 'anonymous'
      });
    });
  });

  describe('debugRateLimit', () => {
    it('should return debug information', async () => {
      mockUserRepository.getRequestCountLast24Hours.mockResolvedValue(30);
      mockUserRepository.getProfileById.mockResolvedValue({
        id: 'test-user-id',
        subscription_tier: 'free'
      });

      const debugInfo = await debugRateLimit(mockUserRepository, 'test-user-id');

      expect(debugInfo).toEqual({
        userId: 'test-user-id',
        requestCount: 30,
        subscriptionTier: 'free',
        timestamp: expect.any(String),
        isUnlimited: false
      });
    });
  });
});

describe('Subscription Configuration', () => {
  it('should have correct limits for each tier', () => {
    expect(getRequestLimit('free')).toBe(100);
    expect(getRequestLimit('pro')).toBe(5000);
    expect(getRequestLimit('enterprise')).toBe(null);
  });

  it('should correctly identify unlimited tiers', () => {
    expect(hasUnlimitedRequests('free')).toBe(false);
    expect(hasUnlimitedRequests('pro')).toBe(false);
    expect(hasUnlimitedRequests('enterprise')).toBe(true);
  });

  it('should return correct tier configurations', () => {
    const freeConfig = getSubscriptionTierConfig('free');
    expect(freeConfig.name).toBe('Free');
    expect(freeConfig.requestsPerDay).toBe(100);
  });
});
