# Ghid de Deployment pentru Monitorul Oficial API

## Prezentare Generală

Acest ghid descrie procesul complet de deployment al API-ului GraphQL Monitorul Oficial pe platforma Vercel, respectând principiile de arhitectură și securitate definite în proiect.

## Cerințe Preliminare

1. **Cont Vercel**: Creați un cont pe [vercel.com](https://vercel.com)
2. **Proiect Supabase**: Asigurați-vă că aveți un proiect Supabase configurat
3. **Repository Git**: Codul trebuie să fie într-un repository Git (GitHub, GitLab, Bitbucket)

## Pasul 1: Pregătirea Proiectului

### 1.1 Verificarea Structurii Fișierelor

Asigurați-vă că aveți următoarele fișiere în rădăcina proiectului:

```
api/
├── src/
│   ├── index.js              # Punctul de intrare principal
│   ├── api/                  # Schema și resolveri GraphQL
│   ├── core/                 # Servicii de business logic
│   ├── database/             # Repository-uri și client Supabase
│   ├── middleware/           # Middleware-uri (auth, rate-limiting)
│   └── config/               # Configurări
├── package.json              # Dependențe și scripturi
├── vercel.json              # Configurația Vercel
├── vercel.config.js         # Configurația avansată Vercel
├── .vercelignore            # Fișiere excluse din deployment
└── env.example              # Template pentru variabile de mediu
```

### 1.2 Verificarea Dependențelor

Asigurați-vă că `package.json` conține toate dependențele necesare:

```json
{
  "dependencies": {
    "@apollo/server": "^4.9.5",
    "@supabase/supabase-js": "^2.38.4",
    "graphql": "^16.8.1",
    "graphql-depth-limit": "^1.1.0",
    "helmet": "^7.1.0",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "zod": "^3.22.4",
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
```

## Pasul 2: Configurarea Variabilelor de Mediu pe Vercel

### 2.1 Accesarea Dashboard-ului Vercel

1. Conectați-vă la [vercel.com](https://vercel.com)
2. Navigați la proiectul dvs.
3. Mergeți la **Settings** → **Environment Variables**

### 2.2 Configurarea Variabilelor Obligatorii

#### SUPABASE_URL
- **Descriere**: URL-ul unic al proiectului Supabase
- **Format**: `https://your-project-id.supabase.co`
- **Obținere**: Dashboard Supabase → Settings → API → Project URL
- **Securitate**: Public (poate fi expus)

#### SUPABASE_SERVICE_ROLE_KEY
- **Descriere**: Cheia secretă cu privilegii depline pentru Supabase
- **Format**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Obținere**: Dashboard Supabase → Settings → API → service_role key
- **Securitate**: **CRITICĂ** - Aceasta este o cheie cu privilegii depline și trebuie tratată cu maximă securitate
- **Utilizare**: Folosită doar pe server pentru operațiuni administrative

#### NODE_ENV
- **Descriere**: Setează mediul de rulare
- **Valoare**: `production`
- **Efecte**: 
  - Activează optimizările de performanță
  - Dezactivează GraphQL Introspection
  - Activează măsurile de securitate stricte

### 2.3 Configurarea Variabilelor Opționale

#### CORS_ORIGIN
- **Descriere**: Domeniile permise pentru CORS
- **Valoare pentru producție**: `https://yourdomain.com`
- **Valoare pentru dezvoltare**: `*`

#### LOG_LEVEL
- **Descriere**: Nivelul de logging
- **Valoare recomandată**: `info`

### 2.4 Exemplu de Configurare în Dashboard Vercel

| Name | Value | Environment |
|------|-------|-------------|
| `SUPABASE_URL` | `https://abc123.supabase.co` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |
| `NODE_ENV` | `development` | Preview, Development |
| `CORS_ORIGIN` | `https://yourdomain.com` | Production |
| `CORS_ORIGIN` | `*` | Preview, Development |

## Pasul 3: Deployment-ul pe Vercel

### 3.1 Conectarea Repository-ului

1. În dashboard-ul Vercel, apăsați **"New Project"**
2. Conectați-vă la repository-ul Git
3. Selectați repository-ul cu codul API-ului

### 3.2 Configurarea Proiectului

1. **Framework Preset**: Selectați **"Other"**
2. **Root Directory**: Lăsați gol (dacă codul este în rădăcina repository-ului)
3. **Build Command**: `npm run build`
4. **Output Directory**: Lăsați gol
5. **Install Command**: `npm install`

### 3.3 Configurarea Variabilelor de Mediu

1. În secțiunea **Environment Variables**:
   - Adăugați toate variabilele definite în secțiunea 2.2
   - Asigurați-vă că sunt marcate pentru **Production**, **Preview** și **Development**

### 3.4 Deployment-ul

1. Apăsați **"Deploy"**
2. Vercel va construi și deploya aplicația
3. Monitorizați procesul în secțiunea **Functions**

## Pasul 4: Verificarea Deployment-ului

### 4.1 Testarea Endpoint-urilor

După deployment, testați următoarele endpoint-uri:

#### Health Check
```bash
curl https://your-project.vercel.app/api/health
```

#### GraphQL Endpoint
```bash
curl -X POST https://your-project.vercel.app/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

### 4.2 Verificarea Logs

1. În dashboard-ul Vercel, mergeți la **Functions**
2. Selectați funcția `src/index.js`
3. Verificați **Logs** pentru erori

### 4.3 Verificarea Performanței

1. În dashboard-ul Vercel, mergeți la **Analytics**
2. Monitorizați:
   - Timpul de răspuns
   - Numărul de cereri
   - Erorile

## Pasul 5: Configurarea Domeniului Personalizat (Opțional)

### 5.1 Adăugarea Domeniului

1. În dashboard-ul Vercel, mergeți la **Settings** → **Domains**
2. Adăugați domeniul dvs. personalizat
3. Configurați DNS-ul conform instrucțiunilor

### 5.2 Configurarea SSL

Vercel configurează automat SSL pentru toate domeniile.

## Pasul 6: Monitorizarea și Mentenanța

### 6.1 Monitorizarea Performanței

- **Vercel Analytics**: Monitorizați timpul de răspuns și erorile
- **Supabase Dashboard**: Monitorizați utilizarea bazei de date
- **Logs**: Verificați logurile pentru erori

### 6.2 Actualizări

Pentru a actualiza aplicația:

1. Faceți commit la modificări în repository
2. Push la branch-ul principal
3. Vercel va redeploya automat

### 6.3 Rollback

Pentru a reveni la o versiune anterioară:

1. În dashboard-ul Vercel, mergeți la **Deployments**
2. Selectați deployment-ul dorit
3. Apăsați **"Promote to Production"**

## Troubleshooting

### Probleme Comune

#### 1. Eroare "Environment variable not found"
**Soluție**: Verificați că variabilele de mediu sunt configurate corect în dashboard-ul Vercel.

#### 2. Eroare de conectare la Supabase
**Soluție**: Verificați că `SUPABASE_URL` și `SUPABASE_SERVICE_ROLE_KEY` sunt corecte.

#### 3. Eroare "Function timeout"
**Soluție**: Verificați că `maxDuration` în `vercel.json` este suficient de mare.

#### 4. Eroare CORS
**Soluție**: Verificați configurația `CORS_ORIGIN` în variabilele de mediu.

### Contact și Suport

Pentru probleme specifice Vercel:
- [Documentația Vercel](https://vercel.com/docs)
- [Comunitatea Vercel](https://github.com/vercel/vercel/discussions)

Pentru probleme specifice Supabase:
- [Documentația Supabase](https://supabase.com/docs)
- [Comunitatea Supabase](https://github.com/supabase/supabase/discussions)

## Concluzie

Acest ghid oferă o abordare completă și sigură pentru deployment-ul API-ului Monitorul Oficial pe Vercel. Respectarea acestor pași va asigura o implementare robustă, scalabilă și sigură, conform principiilor de arhitectură definite în proiect.
