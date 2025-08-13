# Măsuri de Securitate - Monitorul Oficial API

## Prezentare Generală

Acest document descrie măsurile de securitate implementate în API-ul GraphQL pentru Monitorul Oficial, respectând principiile SOLID și oferind o arhitectură modulară și extensibilă.

## 1. Managementul Secretelor

### Variabile de Mediu
Toate secretele sunt gestionate exclusiv prin variabile de mediu:

```bash
# Variabile obligatorii
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=production

# Variabile opționale
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
```

### Validarea Variabilelor de Mediu
- Validare automată la pornirea aplicației
- Verificări suplimentare în producție
- Avertismente pentru configurații nesigure

## 2. Validarea Riguroasă a Input-urilor

### Schema de Validare cu Zod
Toate input-urile sunt validate folosind scheme Zod:

```javascript
// Exemplu pentru validarea email-ului
export const emailSchema = z
  .string()
  .email('Adresa de email nu este validă')
  .min(5, 'Email-ul trebuie să aibă cel puțin 5 caractere')
  .max(255, 'Email-ul nu poate depăși 255 de caractere')
  .toLowerCase()
  .trim();
```

### Tipuri de Validare Implementate
- **Email**: Validare format, lungime, transformare
- **Parolă**: Complexitate, lungime, caractere speciale
- **Titlu**: Lungime, sanitizare
- **Conținut JSON**: Structură, câmpuri obligatorii
- **ID-uri**: Format, lungime
- **Paginare**: Limite, valori numerice

## 3. Middleware de Securitate Avansat

### Middleware-uri Implementate

#### 1. Input Validation Middleware
- Verifică dimensiunea request-urilor
- Sanitizează header-urile
- Validează Content-Type pentru GraphQL

#### 2. Injection Prevention Middleware
- Detectează pattern-uri suspecte (XSS, SQL Injection)
- Blochează request-uri cu conținut malicios
- Logging pentru atacuri detectate

#### 3. IP Rate Limiting Middleware
- Limitare pe bază de IP
- Cache în memorie (Redis recomandat pentru producție)
- Răspunsuri HTTP 429 pentru limită depășită

#### 4. Security Logging Middleware
- Logging detaliat al request-urilor
- Detectarea request-urilor suspecte
- Monitorizarea performanței

#### 5. GraphQL Validation Middleware
- Validarea complexității query-urilor
- Limitarea dimensiunii variabilelor
- Protecție împotriva query-urilor malicioase

#### 6. Timing Attack Prevention Middleware
- Delay aleatoriu pentru prevenirea atacurilor de timing
- Protecție împotriva atacurilor de enumerare

## 4. Configurații de Securitate HTTP

### Headers de Securitate (Helmet)
```javascript
helmet: {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}
```

### CORS Configuration
```javascript
cors: {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}
```

## 5. Limitarea Complexității Query-urilor GraphQL

### Depth Limiting
- Limită de adâncime: 7 nivele
- Previne query-urile recursive malicioase

### Query Complexity Limiting
- Calculul complexității bazat pe numărul de câmpuri
- Limită configurată: 1000 de unități de complexitate
- Erori specifice pentru query-uri prea complexe

### Paginare Obligatorie
- Limită maximă: 50 de rezultate per cerere
- Limită implicită: 10 rezultate
- Previne extragerea masivă de date

## 6. Rate Limiting și Throttling

### Rate Limiting per Utilizator
- **Free**: 100 request-uri/zi
- **Pro**: 5.000 request-uri/zi
- **Enterprise**: Fără limită

### Rate Limiting per IP
- 100 request-uri per 15 minute
- Cache în memorie (Redis recomandat pentru scalabilitate)

### Logging Asincron
- Logarea request-urilor fără impact asupra performanței
- Monitorizarea pattern-urilor de utilizare

## 7. Autentificare și Autorizare

### Supabase Auth Integration
- Validarea JWT tokens
- Context GraphQL cu utilizatorul autentificat
- Verificări de permisiuni în resolver-i

### Row Level Security (RLS)
- Politici de securitate la nivel de bază de date
- Acces controlat pe baza rolului utilizatorului
- Izolarea datelor între utilizatori

## 8. Prevenirea Atacurilor Comune

### Cross-Site Scripting (XSS)
- Content Security Policy (CSP)
- Sanitizarea input-urilor
- Validarea strictă a datelor

### SQL Injection
- Parametrizația query-urilor
- Validarea input-urilor
- Detecția pattern-urilor suspecte

### Cross-Site Request Forgery (CSRF)
- CSRF prevention în Apollo Server
- Validarea origin-ului request-urilor
- Headers de securitate

### Denial of Service (DoS)
- Rate limiting pe multiple niveluri
- Limitarea complexității query-urilor
- Timeout-uri pentru request-uri lente

## 9. Logging și Monitoring

### Security Logging
- Logging detaliat al request-urilor suspecte
- Monitorizarea pattern-urilor de atac
- Alerting pentru activitate anormală

### Performance Monitoring
- Măsurarea timpului de răspuns
- Detectarea request-urilor lente
- Optimizarea performanței

### Error Handling
- Logging structurat al erorilor
- Mesaje de eroare securizate în producție
- Stack trace-uri doar în development

## 10. Configurații de Producție

### Dezactivarea Funcționalităților de Debug
```javascript
// Dezactivare automată în producție
introspection: process.env.NODE_ENV !== 'production',
playground: process.env.NODE_ENV !== 'production'
```

### Optimizări de Securitate
- Validări suplimentare pentru variabilele de mediu
- Avertismente pentru configurații nesigure
- Verificări de integritate la pornire

## 11. Extensibilitate și Mentenanță

### Arhitectură Modulară
- Middleware-uri independente și reutilizabile
- Configurații centralizate și extensibile
- Separarea clară a responsabilităților

### Principii SOLID
- **Single Responsibility**: Fiecare modul are o responsabilitate clară
- **Open/Closed**: Extensibil fără modificarea codului existent
- **Dependency Inversion**: Injecția dependențelor pentru testabilitate

### Testabilitate
- Unit tests pentru toate middleware-urile
- Integration tests pentru fluxurile de securitate
- Mock-uri pentru dependențe externe

## 12. Recomandări pentru Scalabilitate

### Pentru Trafic Mare
- Implementarea Redis pentru rate limiting
- Caching pentru validări frecvente
- Load balancing cu rate limiting distribuit

### Pentru Securitate Avansată
- Implementarea WAF (Web Application Firewall)
- Monitorizare în timp real cu alerting
- Penetration testing regulat

### Pentru Compliance
- Audit logging pentru toate operațiunile
- Encryptarea datelor sensibile
- Backup-uri securizate

## Concluzie

Această implementare oferă o bază solidă de securitate pentru API-ul GraphQL, respectând cele mai bune practici din industrie și principiile de design SOLID. Arhitectura modulară permite extinderea și adaptarea măsurilor de securitate în funcție de cerințele specifice ale aplicației.
