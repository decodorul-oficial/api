/**
 * Teste pentru funcționalitatea de decriptare a parolelor
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { decryptPassword, encryptPassword, isEncryptedPassword, validateCryptoConfig } from '../utils/crypto.js';

describe('Password Decryption', () => {
  beforeAll(() => {
    // Setează INTERNAL_API_KEY pentru teste
    process.env.INTERNAL_API_KEY = 'test-internal-api-key-for-testing-purposes-only-32-chars';
  });

  describe('validateCryptoConfig', () => {
    it('should validate crypto config with valid INTERNAL_API_KEY', () => {
      expect(validateCryptoConfig()).toBe(true);
    });

    it('should fail validation with missing INTERNAL_API_KEY', () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      delete process.env.INTERNAL_API_KEY;
      
      expect(validateCryptoConfig()).toBe(false);
      
      // Restore original key
      process.env.INTERNAL_API_KEY = originalKey;
    });

    it('should fail validation with short INTERNAL_API_KEY', () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      process.env.INTERNAL_API_KEY = 'short';
      
      expect(validateCryptoConfig()).toBe(false);
      
      // Restore original key
      process.env.INTERNAL_API_KEY = originalKey;
    });
  });

  describe('isEncryptedPassword', () => {
    it('should identify encrypted passwords correctly', () => {
      const plainPassword = 'plaintext-password';
      const encryptedPassword = encryptPassword(plainPassword);
      
      expect(isEncryptedPassword(plainPassword)).toBe(false);
      expect(isEncryptedPassword(encryptedPassword)).toBe(true);
    });

    it('should handle invalid inputs', () => {
      expect(isEncryptedPassword('')).toBe(false);
      expect(isEncryptedPassword(null)).toBe(false);
      expect(isEncryptedPassword(undefined)).toBe(false);
      expect(isEncryptedPassword(123)).toBe(false);
    });
  });

  describe('encryptPassword', () => {
    it('should encrypt passwords successfully', () => {
      const password = 'TestPassword123!';
      const encrypted = encryptPassword(password);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(password);
      expect(isEncryptedPassword(encrypted)).toBe(true);
    });

    it('should throw error for empty password', () => {
      expect(() => encryptPassword('')).toThrow();
      expect(() => encryptPassword(null)).toThrow();
      expect(() => encryptPassword(undefined)).toThrow();
    });
  });

  describe('decryptPassword', () => {
    it('should decrypt passwords successfully', () => {
      const originalPassword = 'TestPassword123!';
      const encrypted = encryptPassword(originalPassword);
      const decrypted = decryptPassword(encrypted);
      
      expect(decrypted).toBe(originalPassword);
    });

    it('should handle multiple encryption/decryption cycles', () => {
      const originalPassword = 'ComplexPassword456@';
      
      // Encrypt and decrypt multiple times
      let current = originalPassword;
      for (let i = 0; i < 5; i++) {
        const encrypted = encryptPassword(current);
        const decrypted = decryptPassword(encrypted);
        expect(decrypted).toBe(current);
        current = decrypted;
      }
    });

    it('should throw error for invalid encrypted password', () => {
      expect(() => decryptPassword('invalid-base64')).toThrow();
      expect(() => decryptPassword('')).toThrow();
      expect(() => decryptPassword('short')).toThrow();
    });

    it('should throw error for malformed encrypted data', () => {
      // Create invalid encrypted data
      const invalidEncrypted = Buffer.from('invalid-encrypted-data').toString('base64');
      expect(() => decryptPassword(invalidEncrypted)).toThrow();
    });
  });

  describe('Round-trip encryption/decryption', () => {
    const testPasswords = [
      'Simple123!',
      'ComplexPassword456@',
      'VeryLongPasswordWithSpecialChars789#',
      'a', // Minimum length
      'A'.repeat(128), // Maximum length
      'Password with spaces 123!',
      'Parolă cu caractere românești 456@',
      'Password with symbols !@#$%^&*()_+-=[]{}|;:,.<>?'
    ];

    testPasswords.forEach((password, index) => {
      it(`should handle password ${index + 1}: "${password.substring(0, 20)}..."`, () => {
        const encrypted = encryptPassword(password);
        const decrypted = decryptPassword(encrypted);
        
        expect(decrypted).toBe(password);
        expect(isEncryptedPassword(encrypted)).toBe(true);
      });
    });
  });
});
