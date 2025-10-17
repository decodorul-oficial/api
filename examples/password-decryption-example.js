/**
 * Exemplu de utilizare a funcționalității de decriptare a parolelor
 * Demonstrează cum funcționează criptarea și decriptarea parolelor în API
 */

import { decryptPassword, encryptPassword, isEncryptedPassword, validateCryptoConfig } from '../api/src/utils/crypto.js';
import dotenv from 'dotenv';

// Încarcă variabilele de mediu
dotenv.config();

async function demonstratePasswordDecryption() {
  console.log('🔐 Demonstrație funcționalitate decriptare parole\n');

  // Verifică configurația
  console.log('1. Verificare configurație criptare...');
  if (!validateCryptoConfig()) {
    console.error('❌ Configurația de criptare este invalidă. Verificați INTERNAL_API_KEY în .env');
    return;
  }
  console.log('✅ Configurația de criptare este validă\n');

  // Testează criptarea și decriptarea
  const testPasswords = [
    'TestPassword123!',
    'ParolăRomână456@',
    'VeryLongPasswordWithSpecialChars789#'
  ];

  for (const password of testPasswords) {
    console.log(`2. Testare parolă: "${password}"`);
    
    try {
      // Criptează parola
      const encrypted = encryptPassword(password);
      console.log(`   📦 Parola criptată: ${encrypted.substring(0, 50)}...`);
      
      // Verifică dacă este recunoscută ca criptată
      const isEncrypted = isEncryptedPassword(encrypted);
      console.log(`   🔍 Este recunoscută ca criptată: ${isEncrypted}`);
      
      // Decriptează parola
      const decrypted = decryptPassword(encrypted);
      console.log(`   🔓 Parola decriptată: "${decrypted}"`);
      
      // Verifică dacă decriptarea este corectă
      const isCorrect = decrypted === password;
      console.log(`   ✅ Decriptarea este corectă: ${isCorrect}\n`);
      
    } catch (error) {
      console.error(`   ❌ Eroare la procesarea parolei: ${error.message}\n`);
    }
  }

  // Testează scenariul de autentificare
  console.log('3. Simulare scenariu autentificare...');
  
  // Simulează parola primită de la frontend (criptată)
  const frontendPassword = 'TestPassword123!';
  const encryptedFromFrontend = encryptPassword(frontendPassword);
  
  console.log(`   📨 Parola primită de la frontend (criptată): ${encryptedFromFrontend.substring(0, 50)}...`);
  
  // Simulează procesarea în UserService
  if (isEncryptedPassword(encryptedFromFrontend)) {
    console.log('   🔍 Parola este criptată, o decriptez...');
    const decryptedPassword = decryptPassword(encryptedFromFrontend);
    console.log(`   🔓 Parola decriptată: "${decryptedPassword}"`);
    console.log(`   ✅ Parola poate fi folosită pentru autentificare în Supabase\n`);
  } else {
    console.log('   ℹ️ Parola nu este criptată, o folosesc direct\n');
  }

  // Testează gestionarea erorilor
  console.log('4. Testare gestionare erori...');
  
  try {
    decryptPassword('invalid-encrypted-data');
  } catch (error) {
    console.log(`   ❌ Eroare așteptată pentru date invalide: ${error.message}`);
  }
  
  try {
    decryptPassword('');
  } catch (error) {
    console.log(`   ❌ Eroare așteptată pentru parolă goală: ${error.message}`);
  }

  console.log('\n🎉 Demonstrația s-a completat cu succes!');
  console.log('\n📝 Notă: Această funcționalitate este integrată în UserService pentru:');
  console.log('   - handleSignUp() - decriptează parola înainte de crearea utilizatorului');
  console.log('   - handleSignIn() - decriptează parola înainte de autentificare');
  console.log('   - Validarea strictă a parolelor pentru înregistrare');
  console.log('   - Suport pentru parole criptate și necriptate (backward compatibility)');
}

// Rulează demonstrația
demonstratePasswordDecryption().catch(console.error);
