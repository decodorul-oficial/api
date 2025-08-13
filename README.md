# Monitorul Oficial API

API GraphQL robust și scalabil pentru Monitorul Oficial, construit cu Node.js, Apollo Server și Supabase.

## 🏗️ Arhitectura

Proiectul respectă principiile SOLID și implementează o arhitectură modulară:

```
api/src/
├── api/                    # Definiții GraphQL
│   ├── schema.js          # Schema GraphQL
│   └── resolvers.js       # Resolver-i GraphQL
├── config/                # Configurații
│   ├── index.js           # Configurația principală
│   └── subscriptions.js   # Configurația planurilor de abonament
├── core/                  # Logica de business
│   └── services/          # Servicii de business
│       ├── UserService.js
│       └── StiriService.js
├── database/              # Accesul la date
│   ├── supabaseClient.js  # Client Supabase singleton
│   └── repositories/      # Repository-uri
│       ├── StiriRepository.js
│       └── UserRepository.js
├── middleware/            # Middleware-uri
│   ├── auth.js           # Autentificare
│   └── rateLimiter.js    # Rate limiting
└── index.js              # Punctul de intrare (funcție serverless Vercel / server local)
```

## 🚀 Caracteristici

### ✅ Autentificare și Autorizare
- Autentificare prin Supabase Auth
- Validare JWT tokens
- Autorizare bazată pe roluri și proprietate

### ✅ Rate Limiting
- Rate limiting bazat pe planul de abonament
- Free: 100 cereri/zi
- Pro: 5.000 cereri/zi
- Enterprise: Nelimitat

### ✅ Securitate
- Headers de securitate HTTP (Helmet)
- Validare input cu Zod
- Limitarea adâncimii query-urilor GraphQL
- CORS configurat
- Dezactivarea introspection în producție

### ✅ Performanță
- Paginare pentru toate listele
- Indexuri optimizate în baza de date
- Logarea asincronă a cererilor

## 📋 Cerințe

- Node.js >= 18.0.0
- Proiect Supabase configurat
- PostgreSQL (gestionat de Supabase)

## 🛠️ Instalare

1. **Clonează repository-ul**
```bash
git clone <repository-url>
cd api
```

2. **Instalează dependențele**
```bash
npm install
```

3. **Configurează variabilele de mediu**
```bash
cp env.example .env
```

Editează `.env` cu valorile tale:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=development
PORT=4000
ENABLE_GRAPHQL_UI=true
```

4. **Configurează baza de date**
- În Supabase Dashboard → Settings → Data API: Enable Data API, expune `public` în "Exposed schemas", Save și Restart API
- Rulează scripturile SQL din `database/` în Supabase:
  - `database/schema.sql` sau migrațiile din `database/migrations/`
  - `database/seed.sql` - Date de test (opțional)
- Dacă vezi erori PostgREST de tip `PGRST002`, rulează în SQL editor: `NOTIFY pgrst, 'reload schema';`

5. **Pornește serverul**
```bash
# Dezvoltare
npm run dev

# Producție
npm start
```

## 📚 Utilizare

### Endpoint-uri

- **GraphQL**: `http://localhost:4000/graphql`
- **Health Check**: `http://localhost:4000/health`
- **Info API**: `http://localhost:4000/`

### Exemple de Query-uri

#### Autentificare
```graphql
mutation SignUp {
  signUp(input: { email: "user@example.com", password: "password123" }) {
    token
    user {
      id
      email
      profile {
        subscriptionTier
      }
    }
  }
}
```

#### Obținerea știrilor
```graphql
query GetStiri {
  getStiri(limit: 10, offset: 0) {
    stiri {
      id
      title
      publicationDate
      content
    }
    pagination {
      totalCount
      hasNextPage
      currentPage
    }
  }
}
```

#### Profilul utilizatorului
```graphql
query Me {
  me {
    id
    email
    profile {
      subscriptionTier
      createdAt
    }
  }
}
```

### Headers necesare

Pentru cererile autentificate, adaugă header-ul:
```
Authorization: Bearer <your-jwt-token>
```
Pentru request-urile POST făcute din browser (nu din client dedicat), Apollo Server aplică protecție CSRF. Asigură-te că trimiți `Content-Type: application/json` sau un header preflight ex. `apollo-require-preflight: true`.

### UI Apollo Sandbox (opțional)
- În dezvoltare sau când `ENABLE_GRAPHQL_UI=true`, endpoint-ul `/graphql` servește UI-ul Apollo Sandbox. CSP se relaxează doar în acest caz. În producție UI este dezactivat implicit.

## 🔧 Configurare

### Planuri de Abonament

Configurația planurilor se găsește în `src/config/subscriptions.js`:

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
    requestsPerDay: null, // Nelimitat
    name: 'Enterprise',
    description: 'Plan enterprise cu cereri nelimitate'
  }
};
```

### Rate Limiting

Rate limiting-ul se aplică automat pentru toate cererile autentificate. Este integrat ca plugin Apollo (rulând în `didResolveOperation`) și folosește tabela `public.usage_logs` din Supabase. Utilizatorii neautentificați nu au limită, dar nu pot accesa date sensibile.

### Securitate

- **Introspection**: Dezactivat în producție
- **Depth Limit**: 7 nivele pentru query-uri
- **CORS**: Configurabil prin variabila `CORS_ORIGIN`
- **Helmet**: Headers de securitate HTTP

## 🧪 Testare

```bash
# Rulează testele
npm test

# Linting
npm run lint
npm run lint:fix
```

## 📊 Monitorizare

### Loguri
- Erorile GraphQL sunt logate cu detalii complete
- Rate limiting-ul este logat asincron
- Erorile de autentificare sunt logate

### Health Check
Endpoint-ul `/health` returnează statusul serverului:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## 🚀 Deployment

### Vercel

1. **Configurează variabilele de mediu în Vercel**
   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (din proiectul corect)
   - (opțional) ENABLE_GRAPHQL_UI=true doar dacă dorești UI în producție
2. **Enable Data API** în proiectul Supabase (Settings → Data API) și expune schema `public`, apoi Restart API
3. **Deploy automat prin Git**

### Alte platforme

Proiectul este compatibil cu orice platformă Node.js:
- Heroku
- DigitalOcean App Platform
- AWS Lambda
- Google Cloud Run

## 🔒 Securitate

### Best Practices Implementate

1. **Validare Input**: Toate input-urile sunt validate cu Zod
2. **Autentificare**: JWT tokens validați pentru fiecare cerere
3. **Autorizare**: Verificări de proprietate și roluri
4. **Rate Limiting**: Protecție împotriva abuzului
5. **Headers de Securitate**: Helmet pentru protecție HTTP
6. **Logging**: Logare detaliată pentru debugging și audit

### Recomandări pentru Producție

1. **Variabile de Mediu**: Nu comite niciodată secrete în Git
2. **HTTPS**: Folosește întotdeauna HTTPS în producție
3. **Monitoring**: Implementează monitoring și alerting
4. **Backup**: Configurează backup-uri automate pentru baza de date
5. **Rate Limiting**: Monitorizează și ajustează limitele după necesitate

## 🤝 Contribuții

1. Fork repository-ul
2. Creează un branch pentru feature (`git checkout -b feature/amazing-feature`)
3. Commit schimbările (`git commit -m 'Add amazing feature'`)
4. Push la branch (`git push origin feature/amazing-feature`)
5. Deschide un Pull Request

## 📄 Licență

Acest proiect este licențiat sub MIT License - vezi fișierul [LICENSE](LICENSE) pentru detalii.

## 🆘 Suport

Pentru întrebări și suport:
- Deschide un issue în repository
- Contactează echipa de dezvoltare
- Consultă documentația Supabase pentru detalii despre baza de date
