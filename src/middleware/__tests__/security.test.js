/**
 * Teste pentru middleware-ul de securitate
 * Verifică funcționalitatea tuturor măsurilor de securitate implementate
 */

import { jest } from '@jest/globals';
import {
  inputValidationMiddleware,
  injectionPreventionMiddleware,
  ipRateLimitMiddleware,
  securityLoggingMiddleware,
  graphqlValidationMiddleware,
  timingAttackPreventionMiddleware,
  validateGraphQLData
} from '../security.js';
import { signUpInputSchema } from '../../config/validation.js';

describe('Security Middleware Tests', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      url: '/graphql',
      method: 'POST',
      ip: '127.0.0.1',
      body: {},
      app: {
        locals: {}
      }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('inputValidationMiddleware', () => {
    it('should pass valid requests', () => {
      mockReq.headers['content-length'] = '1000';
      mockReq.headers['content-type'] = 'application/json';

      inputValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject oversized requests', () => {
      mockReq.headers['content-length'] = '11000000'; // 11MB

      inputValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Request Entity Too Large'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject GraphQL requests with invalid content-type', () => {
      mockReq.headers['content-type'] = 'text/plain';

      inputValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('injectionPreventionMiddleware', () => {
    it('should pass normal requests', () => {
      injectionPreventionMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should detect XSS attempts', () => {
      mockReq.url = '/graphql?q=<script>alert("xss")</script>';

      injectionPreventionMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Request-ul conține conținut suspect'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should detect SQL injection attempts', () => {
      mockReq.url = '/graphql?q=1; DROP TABLE users;';

      injectionPreventionMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Request-ul conține conținut suspect'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('ipRateLimitMiddleware', () => {
    it('should allow first request from IP', () => {
      ipRateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockReq.app.locals.ipRateLimit.get('127.0.0.1')).toBeDefined();
    });

    it('should track multiple requests from same IP', () => {
      // First request
      ipRateLimitMiddleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Reset mock
      mockNext.mockClear();
      mockRes.status.mockClear();

      // Second request
      ipRateLimitMiddleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('graphqlValidationMiddleware', () => {
    it('should pass valid GraphQL requests', () => {
      mockReq.body = {
        query: 'query { getStiri { id title } }',
        variables: {}
      };

      graphqlValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject oversized queries', () => {
      mockReq.body = {
        query: 'a'.repeat(11000), // Query prea mare
        variables: {}
      };

      graphqlValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Query-ul GraphQL este prea complex'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject oversized variables', () => {
      mockReq.body = {
        query: 'query { getStiri { id } }',
        variables: { data: 'a'.repeat(6000) } // Variabile prea mari
      };

      graphqlValidationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Variabilele GraphQL sunt prea mari'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('securityLoggingMiddleware', () => {
    it('should log request information', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      securityLoggingMiddleware(mockReq, mockRes, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY] Request de la 127.0.0.1')
      );
      expect(mockNext).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should intercept response for logging', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      securityLoggingMiddleware(mockReq, mockRes, mockNext);

      // Simulate a slow response
      mockRes.statusCode = 200;
      mockRes.send('response');

      // Wait for the response to be processed
      setTimeout(() => {
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      }, 100);
    });
  });

  describe('timingAttackPreventionMiddleware', () => {
    it('should add random delay', (done) => {
      const startTime = Date.now();

      timingAttackPreventionMiddleware(mockReq, mockRes, mockNext);

      setTimeout(() => {
        const endTime = Date.now();
        const delay = endTime - startTime;

        expect(mockNext).toHaveBeenCalled();
        expect(delay).toBeGreaterThan(0);
        done();
      }, 150); // Wait longer than max delay
    });
  });

  describe('validateGraphQLData', () => {
    it('should validate correct data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'TestPass123!'
      };

      const result = validateGraphQLData(validData, signUpInputSchema);

      expect(result).toEqual(validData);
    });

    it('should throw error for invalid data', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'weak'
      };

      expect(() => {
        validateGraphQLData(invalidData, signUpInputSchema);
      }).toThrow('Eroare de validare');
    });
  });
});
