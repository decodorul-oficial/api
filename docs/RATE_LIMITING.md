# Sistemul de Rate Limiting

## Prezentare Generală

Sistemul de rate limiting implementat respectă principiile SOLID și oferă o soluție robustă, scalabilă și ușor de întreținut pentru limitarea numărului de cereri pe utilizator.

## Arhitectura

### Principii de Design

1. **Single Responsibility Principle**: Fiecare modul are o responsabilitate clară
   - `rateLimiter.js` - gestionează doar rate limiting-ul
   - `subscriptions.js` - definește configurația planurilor
   - `UserRepository.js` - gestionează operațiunile cu baza de date

2. **Dependency Inversion Principle**: Modulele de nivel înalt nu depind de cele de nivel scăzut
   - Middleware-ul primește repository-ul prin injecție de dependență
   - Configurația este injectată în loc să fie accesată direct

3. **Open/Closed Principle**: Ușor de extins cu noi planuri fără a modifica logica existentă
   - Adăugarea unui nou plan necesită doar modificarea `subscriptions.js`

### Componente

#### 1. Configurația Planurilor (`src/config/subscriptions.js`)

```javascript
export const SUBSCRIPTION_TIERS = {
  free: {
    requestsPerDay: 100,
    name: 'Free',
    description: 'Plan gratuit cu limită de 100 de cereri pe zi'
  },
  pro: {
    requestsPerDay: 5000,
    name: 'Pro',
    description: 'Plan profesional cu 5000 de cereri pe zi'
  },
  enterprise: {
    requestsPerDay: null, // null = fără limită
    name: 'Enterprise',
    description: 'Plan enterprise cu cereri nelimitate'
  }
};
```

#### 2. Middleware-ul de Rate Limiting (`api/src/middleware/rateLimiter.js`)

Middleware-ul principal care:
- Verifică limita pentru fiecare cerere
- Loghează cererile asincron
- Aruncă erori când limita este depășită

#### 3. Repository-ul pentru Utilizatori (`api/src/database/repositories/UserRepository.js`)

Gestionează:
- Numărarea cererilor din ultimele 24 de ore
- Logarea cererilor noi
- Operațiunile cu profilele utilizatorilor

## Funcționalități

### 1. Verificarea Rate Limit-ului

```javascript
// În middleware
const middleware = createRateLimiterMiddleware(userRepository);
await middleware(requestContext);
```

### 2. Obținerea Informațiilor despre Rate Limit

```graphql
query {
  getRateLimitInfo {
    hasUnlimitedRequests
    requestLimit
    currentRequests
    remainingRequests
    tier
    tierName
  }
}
```

### 3. Istoricul Cererilor

```graphql
query {
  getRequestHistory(userId: "user-id", limit: 10, offset: 0) {
    requests {
      id
      requestTimestamp
    }
    totalCount
    hasNextPage
    hasPreviousPage
  }
}
```

## Planuri de Abonament

| Plan | Cereri/Zi | Descriere |
|------|-----------|-----------|
| Free | 100 | Plan gratuit pentru utilizatori noi |
| Pro | 5,000 | Plan profesional pentru utilizatori activi |
| Enterprise | ∞ | Plan enterprise cu cereri nelimitate |

## Implementarea în Baza de Date

### Tabela `usage_logs`

```sql
CREATE TABLE usage_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index pentru performanță
CREATE INDEX idx_usage_logs_user_timestamp ON usage_logs(user_id, request_timestamp DESC);
```

### Funcția pentru Numărarea Cererilor

```sql
CREATE OR REPLACE FUNCTION get_user_request_count_24h(user_uuid UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM usage_logs
        WHERE user_id = user_uuid
        AND request_timestamp >= NOW() - INTERVAL '24 hours'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Securitate

### Row Level Security (RLS)

```sql
-- Blochează toate operațiunile pentru utilizatori obișnuiți
CREATE POLICY "Block all operations on usage_logs" ON usage_logs
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);
```

Doar API-ul cu cheia `service_role` poate accesa tabela `usage_logs`.

## Performanță și Scalabilitate

### Pentru Trafic Moderat

Implementarea actuală este optimizată pentru trafic moderat și folosește:
- Interogări SQL directe pentru numărarea cererilor
- Index-uri optimizate pentru performanță
- Logarea asincronă pentru a nu afecta timpul de răspuns

### Pentru Trafic Foarte Mare

Pentru scalabilitate la trafic foarte mare, se recomandă:

1. **Implementarea unui sistem de cache rapid** (Redis):
   ```javascript
   // Exemplu de implementare cu Redis
   export async function checkRateLimitWithRedis(userId, redisClient) {
     const key = `rate_limit:${userId}`;
     const current = await redisClient.incr(key);
     
     if (current === 1) {
       await redisClient.expire(key, 86400); // 24 ore
     }
     
     return current <= limit;
   }
   ```

2. **Throttling pe bază de IP**:
   ```javascript
   export async function checkIpThrottling(ipAddress, cacheService) {
     // Implementare pentru limitarea cererilor pe IP
   }
   ```

## Testare

### Rularea Testelor

```bash
npm test src/middleware/__tests__/rateLimiter.test.js
```

### Teste Disponibile

- Verificarea rate limiting-ului pentru diferite planuri
- Testarea utilizatorilor cu cereri nelimitate
- Validarea informațiilor despre rate limit
- Testarea funcțiilor de debugging

## Monitorizare și Debugging

### Funcția de Debug

```javascript
const debugInfo = await debugRateLimit(userRepository, userId);
console.log(debugInfo);
// Output: {
//   userId: 'user-id',
//   requestCount: 25,
//   subscriptionTier: 'free',
//   timestamp: '2024-01-01T12:00:00.000Z',
//   isUnlimited: false
// }
```

### Logging

Sistemul loghează automat:
- Erorile de rate limiting
- Problemele cu logarea cererilor
- Informațiile de debugging

## Extensibilitate

### Adăugarea unui Plan Nou

1. Adaugă planul în `subscriptions.js`:
   ```javascript
   premium: {
     requestsPerDay: 10000,
     name: 'Premium',
     description: 'Plan premium cu 10000 de cereri pe zi'
   }
   ```

2. Actualizează baza de date:
   ```sql
   ALTER TABLE profiles 
   ADD CONSTRAINT check_subscription_tier 
   CHECK (subscription_tier IN ('free', 'pro', 'enterprise', 'premium'));
   ```

### Implementarea unui Sistem de Cache

1. Creează un serviciu de cache:
   ```javascript
   export class CacheService {
     async increment(key, ttl) { /* implementare */ }
     async get(key) { /* implementare */ }
   }
   ```

2. Modifică middleware-ul pentru a folosi cache-ul:
   ```javascript
   export function createRateLimiterMiddleware(userRepository, cacheService) {
     // Implementare cu cache
   }
   ```

## Concluzie

Sistemul de rate limiting implementat oferă:
- ✅ Arhitectură modulară și extensibilă
- ✅ Respectarea principiilor SOLID
- ✅ Securitate robustă cu RLS
- ✅ Performanță optimizată pentru trafic moderat
- ✅ Posibilitatea de scalare pentru trafic mare
- ✅ Testare completă și documentație detaliată
