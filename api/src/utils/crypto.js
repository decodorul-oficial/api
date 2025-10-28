/**
 * Utilitar pentru criptarea și decriptarea parolelor
 * Folosește AES-256-GCM cu salt și IV aleatorii pentru securitate maximă
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe operațiuni criptografice
 */

import crypto from 'crypto';

/**
 * Configurația pentru criptare
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Derivează cheia din INTERNAL_API_KEY și salt folosind SHA-256 (compatibil cu frontend)
 * @param {Buffer} salt - Salt-ul pentru derivarea cheii
 * @returns {Buffer} Cheia derivată
 */
function deriveKey(salt) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  
  if (!internalApiKey) {
    throw new Error('INTERNAL_API_KEY nu este configurat în variabilele de mediu');
  }
  
  if (internalApiKey.length < 32) {
    throw new Error('INTERNAL_API_KEY trebuie să aibă cel puțin 32 de caractere');
  }
  
  // Derivează cheia folosind SHA-256 (compatibil cu frontend)
  return crypto.createHash('sha256')
    .update(internalApiKey)
    .update(salt)
    .digest();
}

/**
 * Decriptează o parolă criptată
 * @param {string} encryptedPassword - Parola criptată în format base64
 * @returns {string} Parola decriptată
 * @throws {Error} Dacă decriptarea eșuează
 */
export function decryptPassword(encryptedPassword) {
  try {
    if (!encryptedPassword) {
      throw new Error('Parola criptată nu poate fi goală');
    }

    // Decodifică din base64
    const combined = Buffer.from(encryptedPassword, 'base64');
    
    // Verifică lungimea minimă (salt + iv + tag + data)
    if (combined.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('Format invalid pentru parola criptată');
    }

    // Extrage componentele (compatibil cu frontend)
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Derivează cheia din salt și INTERNAL_API_KEY (compatibil cu frontend)
    const key = deriveKey(salt);

    // Creează decipher-ul GCM
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(salt); // Use salt as additional authenticated data
    decipher.setAuthTag(tag);

    // Decriptează datele
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Eroare la decriptarea parolei:', error.message);
    throw new Error('Nu s-a putut decripta parola. Verificați formatul și cheia de criptare.');
  }
}

/**
 * Criptează o parolă (pentru testare și compatibilitate)
 * @param {string} password - Parola de criptat
 * @returns {string} Parola criptată în format base64
 * @throws {Error} Dacă criptarea eșuează
 */
export function encryptPassword(password) {
  try {
    if (!password) {
      throw new Error('Parola nu poate fi goală');
    }

    // Generează salt și IV aleatorii
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derivează cheia din salt și INTERNAL_API_KEY (compatibil cu frontend)
    const key = deriveKey(salt);

    // Creează cipher-ul GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(salt); // Use salt as additional authenticated data

    // Criptează parola
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Obține tag-ul de autentificare
    const tag = cipher.getAuthTag();

    // Combină toate componentele: salt + iv + tag + encrypted_data (compatibil cu frontend)
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);

    // Returnează în format base64
    return combined.toString('base64');
  } catch (error) {
    console.error('Eroare la criptarea parolei:', error.message);
    throw new Error('Nu s-a putut cripta parola');
  }
}

/**
 * Verifică dacă o parolă este criptată (format base64 cu lungimea corectă)
 * @param {string} password - Parola de verificat
 * @returns {boolean} True dacă parola pare să fie criptată
 */
export function isEncryptedPassword(password) {
  try {
    if (!password || typeof password !== 'string') {
      return false;
    }

    // Verifică dacă este base64 valid
    const buffer = Buffer.from(password, 'base64');
    // Base64 encoding can have padding, so we need to account for that
    // The actual length should be close to the expected length (within 1 byte due to padding)
    const expectedLength = Math.ceil(password.length * 3 / 4);
    if (Math.abs(buffer.length - expectedLength) > 2) {
      return false;
    }

    // Verifică lungimea minimă pentru formatul nostru (compatibil cu frontend)
    const minLength = SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
    return buffer.length >= minLength;
  } catch (error) {
    return false;
  }
}

/**
 * Validează configurația de criptare
 * @returns {boolean} True dacă configurația este validă
 */
export function validateCryptoConfig() {
  try {
    const internalApiKey = process.env.INTERNAL_API_KEY;
    
    if (!internalApiKey) {
      throw new Error('INTERNAL_API_KEY nu este configurat în variabilele de mediu');
    }
    
    if (internalApiKey.length < 32) {
      throw new Error('INTERNAL_API_KEY trebuie să aibă cel puțin 32 de caractere');
    }
    
    return true;
  } catch (error) {
    console.error('Configurația de criptare este invalidă:', error.message);
    return false;
  }
}

export default {
  decryptPassword,
  encryptPassword,
  isEncryptedPassword,
  validateCryptoConfig
};
