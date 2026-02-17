# X-Internal-API-Key pentru getStiri (sitemap)

Cereri server-to-server (ex: generare sitemap știri) pot folosi header-ul `X-Internal-API-Key` pentru a obține mai mult de 10 știri fără JWT user. Comportamentul pentru utilizatori anonimi (max 10) sau autentificați rămâne neschimbat.

## Comportament

| Request | Limit permis |
|--------|---------------|
| Fără JWT, fără header sau cu `X-Internal-API-Key` invalid | max 10 (UNAUTHENTICATED dacă limit > 10) |
| Fără JWT, cu `X-Internal-API-Key` valid | max `INTERNAL_GET_STIRI_MAX_LIMIT` (implicit 100, cap 500) |
| Cu JWT user autentificat | conform abonament/trial (reguli existente) |

## Configurare

### API (backend)

- **INTERNAL_API_KEY** (obligatoriu pentru flow internal): valoare secretă; folosită pentru validare constant-time a header-ului `X-Internal-API-Key`. Dacă nu e setat, `isInternalRequest` este mereu `false`.
- **INTERNAL_GET_STIRI_MAX_LIMIT** (opțional): limit maxim pentru getStiri cu internal key. Implicit 100, maxim 500.

### Aplicația web (server-side, ex. news-sitemap)

Setați **INTERNAL_API_KEY** cu aceeași valoare ca în API. La cererea către GraphQL (getStiri cu limit > 10), trimiteți header-ul:

```
X-Internal-API-Key: <valoarea INTERNAL_API_KEY>
```

## Notă despre middleware-ul INTERNAL_API_KEY

Dacă în producție este aplicat middleware-ul care verifică `X-Internal-API-Key` și returnează 403 când cheia lipsește (ex. `createInternalApiKeyMiddleware` pe ruta `/graphql`), atunci cererile anonime vor primi 403. Pentru a respecta criteriile (anonim = max 10, internal key = până la limit), nu aplicați acel middleware blocant pe GraphQL, sau faceți-l opțional; validarea pentru getStiri se face în context (`isInternalRequest`) fără a bloca request-ul.

## Securitate

- Validarea cheii se face cu **comparare constant-time** (`crypto.timingSafeEqual`) pentru a reduce riscul de timing attacks.
- Cheia **nu este logată** în răspunsuri; pentru request invalid se păstrează comportamentul de neautentificat (max 10), fără a divulga dacă cheia este validă sau nu.
- Doar resolver-ul **getStiri** folosește `context.isInternalRequest`; alte resolvere nu sunt modificate.

## Exemplu (sitemap)

```bash
curl -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: YOUR_INTERNAL_API_KEY" \
  -d '{"query":"query { getStiri(limit: 100) { id title slug publicationDate } }"}'
```
