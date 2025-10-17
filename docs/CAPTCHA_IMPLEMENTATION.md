# Implementarea reCAPTCHA v3 - Monitorul Oficial API

## Prezentare Generală

Această documentație descrie implementarea reCAPTCHA v3 în API-ul GraphQL pentru Monitorul Oficial, oferind protecție împotriva bot-urilor și atacurilor automate.

## Arhitectura Implementării

### 1. Middleware Captcha (`api/src/middleware/captcha.js`)

Middleware-ul captcha se integrează în chain-ul de securitate existent și validează token-urile reCAPTCHA v3 pentru operațiuni sensibile.

#### Funcționalități:
- **Validare automată**: Verifică token-urile pentru operațiuni sensibile
- **Score-based decisions**: Folosește score-ul reCAPTCHA pentru a decide validitatea
- **Error handling robust**: Gestionarea erorilor de rețea și validare
- **Logging detaliat**: Monitorizarea evenimentelor captcha pentru securitate

#### Operațiuni Protejate:
- `signUp` - Înregistrare utilizatori noi
- `signIn` - Autentificare utilizatori
- `createComment` - Creare comentarii
- `changePassword` - Schimbare parolă

### 2. Configurația Captcha (`api/src/config/index.js`)

```javascript
export const captchaConfig = {
  secretKey: process.env.RECAPTCHA_SECRET_KEY,
  minScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5'),
  verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
  timeout: 5000,
  enabled: !!process.env.RECAPTCHA_SECRET_KEY
};
```

### 3. Integrarea în Middleware Chain

```javascript
const graphqlMiddlewares = [
  ...securityMiddlewares,    // 1. Security middleware
  captchaMiddleware,         // 2. Captcha validation
  authMiddleware,            // 3. Authentication
  expressMiddleware(server, {
    context: async ({ req }) => {
      return {
        user: req.user,
        supabase: supabaseClient.getServiceClient(),
        req
      };
    }
  })
];
```

## Configurarea Environment

### Variabile de Mediu Necesare

```bash
# reCAPTCHA v3 Configuration
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key_here
RECAPTCHA_MIN_SCORE=0.5
```

### Obținerea Cheilor reCAPTCHA

1. **Accesează Google reCAPTCHA Console**: https://www.google.com/recaptcha/admin
2. **Creează un site nou**:
   - Label: "Monitorul Oficial API"
   - reCAPTCHA type: "reCAPTCHA v3"
   - Domains: domeniile tale (ex: `api.monitoruloficial.ro`)
3. **Obține cheile**:
   - **Site Key**: pentru frontend (public)
   - **Secret Key**: pentru backend (privat)

## Flow-ul de Validare

### 1. Frontend (Aplicația Web)
```javascript
// Generează token captcha
const captchaToken = await window.grecaptcha.execute(
  'SITE_KEY', 
  { action: 'signup' }
);

// Trimite la API cu token-ul
fetch('/graphql', {
  headers: {
    'X-Captcha-Token': captchaToken
  },
  body: JSON.stringify({
    query: `mutation SignUp($input: SignUpInput!) { ... }`,
    variables: { input: userData }
  })
});
```

### 2. Backend (API)
```javascript
// Middleware-ul captcha interceptează request-ul
1. Extrage token-ul din header-uri
2. Verifică cu Google reCAPTCHA API
3. Validează score-ul (min 0.5)
4. Permite/blochează request-ul
```

## Error Handling

### Coduri de Eroare Captcha

| Cod | Descriere | Soluție |
|-----|-----------|---------|
| `CAPTCHA_REQUIRED` | Token captcha lipsă | Adaugă token în header |
| `CAPTCHA_INVALID` | Token invalid sau score prea scăzut | Regenerare token |
| `CAPTCHA_TIMEOUT` | Timeout la validare | Reîncearcă |

### Exemple de Răspunsuri

#### Token Lipsă
```json
{
  "error": "Captcha token required",
  "code": "CAPTCHA_REQUIRED",
  "message": "Pentru această operațiune este necesară validarea captcha"
}
```

#### Token Invalid
```json
{
  "error": "Captcha verification failed",
  "code": "CAPTCHA_INVALID",
  "message": "Scorul captcha este prea scăzut (0.2 < 0.5)",
  "details": {
    "score": 0.2,
    "minScore": 0.5,
    "action": "signup"
  }
}
```

## Logging și Monitoring

### Log-uri Captcha

```javascript
// Request permis
✅ [CAPTCHA] Request allowed: {
  timestamp: "2024-01-01T12:00:00.000Z",
  ip: "192.168.1.1",
  operation: "signup",
  captchaScore: 0.8,
  captchaAction: "signup",
  captchaSuccess: true
}

// Request blocat
🚫 [CAPTCHA] Request blocked: {
  timestamp: "2024-01-01T12:00:00.000Z",
  ip: "192.168.1.1",
  operation: "signup",
  captchaScore: 0.2,
  captchaAction: "signup",
  captchaSuccess: false,
  blocked: true
}
```

### Metrici Importante

- **Rate de succes captcha**: % request-uri cu score valid
- **Score-uri medii**: Distribuția score-urilor per operațiune
- **IP-uri suspecte**: IP-uri cu score-uri consistente scăzute
- **Erori de validare**: Rate-ul de erori de rețea/timeout

## Testarea Implementării

### Rularea Testelor

```bash
# Testează implementarea captcha
node test-captcha.js
```

### Teste Incluse

1. **SignUp fără captcha**: Verifică că se returnează eroare
2. **SignUp cu token invalid**: Verifică validarea token-ului
3. **SignIn fără captcha**: Verifică protecția autentificării
4. **Operațiuni non-sensibile**: Verifică că nu se blochează
5. **Health endpoint**: Verifică că API-ul funcționează

## Securitate

### Măsuri de Protecție

1. **Score Threshold**: Score minim de 0.5 pentru validare
2. **Timeout Protection**: Timeout de 5 secunde pentru validare
3. **IP Tracking**: Monitorizarea IP-urilor cu comportament suspect
4. **Error Handling**: Nu expunerea detaliilor interne în erori
5. **Logging Security**: Logging detaliat pentru audit

### Best Practices

1. **Nu expune cheia secretă**: Folosește doar în backend
2. **Monitorizează score-urile**: Ajustează threshold-ul bazat pe date
3. **Implementează fallback**: Pentru cazurile când reCAPTCHA e indisponibil
4. **Testează regulat**: Verifică funcționalitatea în producție
5. **Backup plan**: Alternativă pentru cazurile de urgență

## Troubleshooting

### Probleme Comune

#### 1. "reCAPTCHA v3 nu este configurat"
**Cauza**: `RECAPTCHA_SECRET_KEY` nu este setat
**Soluție**: Adaugă cheia în variabilele de mediu

#### 2. "Captcha verification failed"
**Cauza**: Score prea scăzut sau token invalid
**Soluție**: Verifică configurația frontend și regenerare token

#### 3. "Network timeout"
**Cauza**: Probleme de rețea cu Google API
**Soluție**: Verifică conectivitatea și timeout-urile

#### 4. "Invalid secret key"
**Cauza**: Cheia secretă este greșită
**Soluție**: Verifică cheia în Google reCAPTCHA Console

### Debug Mode

Pentru debugging, adaugă în environment:
```bash
LOG_LEVEL=debug
```

Aceasta va activa logging-ul detaliat pentru captcha.

## Performanță

### Impact asupra Performanței

- **Latență adăugată**: ~100-300ms per validare
- **Rate limiting**: Nu afectează rate limiting-ul existent
- **Memory usage**: Minimal (doar cache pentru configurație)
- **CPU usage**: Neglijabil

### Optimizări

1. **Caching**: Cache pentru configurația captcha
2. **Async validation**: Validarea asincronă nu blochează
3. **Early exit**: Request-urile invalide sunt respinse rapid
4. **Batch validation**: Pentru multiple request-uri (viitor)

## Extensibilitate

### Adăugarea de Operațiuni Protejate

1. **Adaugă în middleware**:
```javascript
const SENSITIVE_OPERATIONS = [
  'signUp', 'signIn', 'createComment',
  'changePassword', 'newOperation'  // Adaugă aici
];
```

2. **Adaugă în resolver**:
```javascript
newOperation: async (parent, { input }, context) => {
  validateCaptchaInResolver(context, 'newOperation');
  // ... restul logicii
}
```

### Configurare Dinamică

Pentru configurare dinamică a score-ului:
```javascript
// În viitor: configurare din baza de date
const dynamicScore = await getCaptchaScoreForOperation(operation);
```

## Concluzie

Implementarea reCAPTCHA v3 oferă:

✅ **Protecție robustă** împotriva bot-urilor
✅ **Integrare seamless** cu arhitectura existentă  
✅ **Experiență utilizator** optimă (invisible)
✅ **Monitoring complet** pentru securitate
✅ **Extensibilitate** pentru operațiuni viitoare
✅ **Performance optimizat** cu impact minimal

Această implementare respectă principiile SOLID și se integrează perfect cu middleware-urile de securitate existente, oferind o soluție completă și scalabilă pentru protecția API-ului.
