# Decriptarea Parolelor în API

Acest document descrie implementarea funcționalității de decriptare a parolelor în API-ul Monitorul Oficial.

## Prezentare Generală

API-ul suportă decriptarea parolelor criptate de frontend folosind cheia `INTERNAL_API_KEY` din fișierul `.env`. Această funcționalitate permite o integrare transparentă între frontend și backend, unde parolele sunt criptate pe frontend și decriptate pe backend.

## Arhitectura Sistemului

### Frontend (Next.js)
- Parolele sunt criptate folosind AES-256-GCM cu salt și IV aleatorii
- Cheia de criptare este `INTERNAL_API_KEY`
- Parolele criptate sunt trimise către API prin GraphQL

### Backend (API)
- Parolele criptate sunt decriptate folosind aceeași cheie `INTERNAL_API_KEY`
- Suportă atât parole criptate cât și necriptate (backward compatibility)
- Validarea strictă a parolelor pentru înregistrare

## Implementare

### 1. Utilitar de Criptare (`api/src/utils/crypto.js`)

```javascript
import { decryptPassword, encryptPassword, isEncryptedPassword } from '../utils/crypto.js';

// Decriptează o parolă criptată
const decryptedPassword = decryptPassword(encryptedPassword);

// Verifică dacă o parolă este criptată
const isEncrypted = isEncryptedPassword(password);
```

#### Funcții Disponibile

- `decryptPassword(encryptedPassword)` - Decriptează o parolă criptată
- `encryptPassword(password)` - Criptează o parolă (pentru testare)
- `isEncryptedPassword(password)` - Verifică dacă o parolă este criptată
- `validateCryptoConfig()` - Validează configurația de criptare

### 2. Integrare în UserService

```javascript
// În handleSignUp și handleSignIn
const processedPassword = this.processPassword(validatedData.password, isSignUp);
```

#### Metoda `processPassword`

- Decriptează parola dacă este criptată
- Aplică validarea strictă pentru înregistrare
- Returnează parola procesată pentru autentificare

### 3. Configurare

#### Variabile de Mediu

```env
INTERNAL_API_KEY=your-secure-internal-api-key-here
```

**Important**: `INTERNAL_API_KEY` trebuie să aibă cel puțin 32 de caractere pentru securitate.

#### Validare Configurație

```javascript
import { validateCryptoConfig } from '../utils/crypto.js';

if (!validateCryptoConfig()) {
  throw new Error('Configurația de criptare este invalidă');
}
```

## Algoritm de Criptare

### AES-256-GCM
- **Algoritm**: AES-256-GCM
- **Lungime cheie**: 32 bytes (256 bits)
- **Lungime IV**: 16 bytes (128 bits)
- **Lungime salt**: 32 bytes (256 bits)
- **Lungime tag**: 16 bytes (128 bits)

### Formatul Datelor Criptate

```
[salt][iv][tag][encrypted_data] -> base64
```

- **Salt**: 32 bytes aleatorii pentru derivarea cheii
- **IV**: 16 bytes aleatorii pentru inițializarea cipher-ului
- **Tag**: 16 bytes pentru autentificarea integrității
- **Encrypted Data**: datele criptate

## Utilizare

### 1. Înregistrare Utilizator

```javascript
// Frontend trimite parola criptată
const signUpInput = {
  email: 'user@example.com',
  password: 'encrypted-password-base64'
};

// API decriptează parola automat
const result = await userService.handleSignUp(signUpInput);
```

### 2. Autentificare Utilizator

```javascript
// Frontend trimite parola criptată
const signInInput = {
  email: 'user@example.com',
  password: 'encrypted-password-base64'
};

// API decriptează parola automat
const result = await userService.handleSignIn(signInInput);
```

### 3. Backward Compatibility

API-ul suportă atât parole criptate cât și necriptate:

```javascript
// Parolă criptată (de la frontend nou)
const encryptedPassword = 'base64-encrypted-data';

// Parolă necriptată (de la frontend vechi sau testare)
const plainPassword = 'plaintext-password';

// Ambele funcționează
const result1 = await userService.handleSignIn({ email, password: encryptedPassword });
const result2 = await userService.handleSignIn({ email, password: plainPassword });
```

## Testare

### Rulare Teste

```bash
# Teste unitare
npm test api/src/test/passwordDecryption.test.js

# Demonstrație funcționalitate
npm run example:password-decryption
```

### Teste Incluse

- Validarea configurației de criptare
- Criptarea și decriptarea parolelor
- Gestionarea erorilor
- Backward compatibility
- Validarea strictă pentru înregistrare

## Securitate

### Măsuri de Securitate

1. **Cheie puternică**: `INTERNAL_API_KEY` trebuie să aibă cel puțin 32 de caractere
2. **Salt aleatoriu**: Fiecare criptare folosește un salt unic
3. **IV aleatoriu**: Fiecare criptare folosește un IV unic
4. **Autentificare integritate**: Tag-ul GCM previne modificarea datelor
5. **Validare strictă**: Parolele pentru înregistrare sunt validate strict

### Best Practices

1. **Nu logați parolele**: Niciodată nu logați parolele în plaintext
2. **Folosiți HTTPS**: Transmiteți datele criptate doar prin HTTPS
3. **Rotați cheile**: Rotați `INTERNAL_API_KEY` periodic
4. **Monitorizați accesul**: Monitorizați accesul la cheia de criptare

## Debugging

### Log-uri Disponibile

```javascript
// În UserService.processPassword()
console.log('🔓 Decriptez parola primită de la frontend');
console.log('ℹ️ Parola primită nu este criptată, o folosesc direct');
```

### Verificare Configurație

```javascript
import { validateCryptoConfig } from '../utils/crypto.js';

console.log('Configurația de criptare:', validateCryptoConfig());
```

## Erori Comune

### 1. INTERNAL_API_KEY lipsă

```
Error: INTERNAL_API_KEY nu este configurat în variabilele de mediu
```

**Soluție**: Adăugați `INTERNAL_API_KEY` în fișierul `.env`

### 2. INTERNAL_API_KEY prea scurt

```
Error: INTERNAL_API_KEY trebuie să aibă cel puțin 32 de caractere
```

**Soluție**: Folosiți o cheie de cel puțin 32 de caractere

### 3. Format invalid pentru parola criptată

```
Error: Format invalid pentru parola criptată
```

**Soluție**: Verificați că parola este criptată corect pe frontend

### 4. Eroare de decriptare

```
Error: Nu s-a putut decripta parola. Verificați formatul și cheia de criptare.
```

**Soluție**: Verificați că `INTERNAL_API_KEY` este același pe frontend și backend

## Monitorizare

### Metrici Recomandate

1. **Rate de succes decriptare**: Procentul de parole decriptate cu succes
2. **Erori de decriptare**: Numărul de erori de decriptare
3. **Timp de procesare**: Timpul necesar pentru decriptare
4. **Utilizare backward compatibility**: Procentul de parole necriptate

### Alertă

Configurați alerte pentru:
- Erori de decriptare frecvente
- Configurația de criptare invalidă
- Tentative de acces la cheia de criptare

## Concluzie

Implementarea decriptării parolelor oferă:

- **Securitate îmbunătățită**: Parolele sunt criptate în tranzit
- **Integrare transparentă**: Funcționează cu frontend-ul existent
- **Backward compatibility**: Suportă parole necriptate
- **Validare strictă**: Asigură calitatea parolelor pentru înregistrare
- **Monitorizare**: Permite urmărirea performanței și securității

Această implementare respectă principiile de securitate moderne și oferă o experiență de dezvoltare plăcută pentru echipa de dezvoltare.
