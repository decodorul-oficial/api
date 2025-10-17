# Funcționalitatea de Căutări Salvate

## Prezentare Generală

Funcționalitatea de căutări salvate permite utilizatorilor cu abonament Pro sau Enterprise să salveze, organizeze și refolosească rapid căutările frecvente în știri. Această funcționalitate îmbunătățește experiența utilizatorului prin oferirea unui sistem de gestionare a căutărilor personalizat.

## Caracteristici Principale

### ✅ Funcționalități Disponibile
- **Salvare căutări**: Utilizatorii pot salva parametrii de căutare cu un nume personalizat
- **Organizare în favorite**: Marcarea căutărilor importante ca favorite
- **Gestionare completă**: Editare, ștergere și organizare a căutărilor salvate
- **Refolosire rapidă**: Aplicarea instantanee a parametrilor salvați
- **Paginare și sortare**: Listarea eficientă a căutărilor salvate

### ❌ Restricții
- **Doar pentru abonamente Pro/Enterprise**: Utilizatorii Free nu pot accesa această funcționalitate
- **Nume unice**: Fiecare utilizator poate avea doar o căutare cu același nume
- **Limitări de paginare**: Maximum 50 de rezultate per pagină

## Arhitectura Implementării

### 1. Schema Bazei de Date

```sql
CREATE TABLE saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    search_params JSONB NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    CONSTRAINT unique_search_name_per_user UNIQUE (user_id, name)
);
```

### 2. Tipuri GraphQL

```graphql
type SavedSearch {
  id: ID!
  name: String!
  description: String
  searchParams: JSON!
  isFavorite: Boolean!
  createdAt: String!
  updatedAt: String!
}

type SavedSearchResponse {
  savedSearches: [SavedSearch!]!
  pagination: PaginationInfo!
}
```

### 3. Input Types

```graphql
input SaveSearchInput {
  name: String!
  description: String
  searchParams: JSON!
  isFavorite: Boolean
}

input UpdateSavedSearchInput {
  name: String
  description: String
  searchParams: JSON
  isFavorite: Boolean
}
```

## API Endpoints

### Query-uri

#### `getSavedSearches`
Obține lista de căutări salvate ale utilizatorului.

**Parametri:**
- `limit: Int` (opțional, default: 20, max: 50)
- `offset: Int` (opțional, default: 0)
- `orderBy: String` (opțional, default: "createdAt")
  - Valori acceptate: "createdAt", "updatedAt", "name"
- `orderDirection: String` (opțional, default: "desc")
  - Valori acceptate: "asc", "desc"
- `favoritesOnly: Boolean` (opțional, default: false)

**Exemplu:**
```graphql
query GetSavedSearches {
  getSavedSearches(
    limit: 10
    offset: 0
    orderBy: "createdAt"
    orderDirection: "desc"
    favoritesOnly: false
  ) {
    savedSearches {
      id
      name
      description
      searchParams
      isFavorite
      createdAt
      updatedAt
    }
    pagination {
      totalCount
      hasNextPage
      currentPage
      totalPages
    }
  }
}
```

#### `getSavedSearchById`
Obține o căutare salvată specifică după ID.

**Parametri:**
- `id: ID!` - ID-ul căutării salvate

**Exemplu:**
```graphql
query GetSavedSearch {
  getSavedSearchById(id: "search-id-here") {
    id
    name
    description
    searchParams
    isFavorite
    createdAt
    updatedAt
  }
}
```

### Mutații

#### `saveSearch`
Salvează o nouă căutare.

**Parametri:**
- `input: SaveSearchInput!`

**Exemplu:**
```graphql
mutation SaveSearch {
  saveSearch(input: {
    name: "Căutare Guvern 2024"
    description: "Căutări pentru hotărâri guvernamentale din 2024"
    searchParams: {
      query: "guvern hotarare"
      keywords: ["legislatie", "finante"]
      publicationDateFrom: "2024-01-01"
      publicationDateTo: "2024-12-31"
      orderBy: "publicationDate"
      orderDirection: "desc"
    }
    isFavorite: true
  }) {
    id
    name
    description
    searchParams
    isFavorite
    createdAt
  }
}
```

#### `updateSavedSearch`
Actualizează o căutare salvată existentă.

**Parametri:**
- `id: ID!` - ID-ul căutării de actualizat
- `input: UpdateSavedSearchInput!`

**Exemplu:**
```graphql
mutation UpdateSavedSearch {
  updateSavedSearch(
    id: "search-id-here"
    input: {
      name: "Căutare Guvern 2024 - Actualizată"
      description: "Căutări actualizate pentru hotărâri guvernamentale"
      searchParams: {
        query: "guvern hotarare ordin"
        keywords: ["legislatie", "finante", "mediu"]
      }
    }
  ) {
    id
    name
    description
    searchParams
    updatedAt
  }
}
```

#### `deleteSavedSearch`
Șterge o căutare salvată.

**Parametri:**
- `id: ID!` - ID-ul căutării de șters

**Exemplu:**
```graphql
mutation DeleteSavedSearch {
  deleteSavedSearch(id: "search-id-here")
}
```

#### `toggleFavoriteSearch`
Comută statusul de favorit pentru o căutare salvată.

**Parametri:**
- `id: ID!` - ID-ul căutării

**Exemplu:**
```graphql
mutation ToggleFavorite {
  toggleFavoriteSearch(id: "search-id-here") {
    id
    name
    isFavorite
  }
}
```

## Structura Parametrilor de Căutare

Parametrii de căutare (`searchParams`) sunt stocați ca JSON și pot conține:

```json
{
  "query": "textul de căutare",
  "keywords": ["cuvânt1", "cuvânt2"],
  "publicationDateFrom": "2024-01-01",
  "publicationDateTo": "2024-12-31",
  "orderBy": "publicationDate",
  "orderDirection": "desc"
}
```

### Câmpuri Disponibile:
- `query: String` - Textul pentru căutare fuzzy/full-text
- `keywords: [String]` - Lista de cuvinte-cheie pentru filtrare
- `publicationDateFrom: String` - Data de început (format YYYY-MM-DD)
- `publicationDateTo: String` - Data de sfârșit (format YYYY-MM-DD)
- `orderBy: String` - Câmpul de sortare
- `orderDirection: String` - Direcția de sortare ("asc" sau "desc")

## Validări și Restricții

### Validări de Input
- **Nume**: 1-100 caractere, obligatoriu
- **Descriere**: maxim 500 caractere, opțional
- **Parametri de căutare**: structură validă JSON, obligatoriu
- **Favorite**: boolean, opțional (default: false)

### Restricții de Acces
- **Autentificare obligatorie**: Toate operațiunile necesită utilizator autentificat
- **Abonament activ**: Doar utilizatorii cu tier Pro sau Enterprise
- **Izolare pe utilizator**: RLS asigură că utilizatorii văd doar propriile căutări
- **Nume unice**: Fiecare utilizator poate avea doar o căutare cu același nume

## Coduri de Eroare

| Cod | Descriere | Cauză |
|-----|-----------|-------|
| `UNAUTHENTICATED` | Utilizator neautentificat | Lipsă token de autentificare |
| `SUBSCRIPTION_REQUIRED` | Abonament necesar | Utilizator cu tier Free |
| `DUPLICATE_NAME` | Nume duplicat | Există deja o căutare cu acest nume |
| `NOT_FOUND` | Căutare negăsită | ID-ul căutării nu există |
| `VALIDATION_ERROR` | Parametri invalizi | Structura datelor nu respectă schema |
| `DATABASE_ERROR` | Eroare bază de date | Problemă la nivelul bazei de date |
| `INTERNAL_ERROR` | Eroare internă | Problemă neașteptată a serverului |

## Exemple de Utilizare

### Workflow Complet: Căutare și Salvare

```graphql
# 1. Caută știri cu parametri specifici
query SearchStiri {
  searchStiriByKeywords(
    query: "pensii salarizare"
    keywords: ["buget", "finante"]
    publicationDateFrom: "2024-01-01"
    orderBy: "viewCount"
    orderDirection: "desc"
    limit: 20
  ) {
    stiri {
      id
      title
      publicationDate
      viewCount
    }
    pagination {
      totalCount
    }
  }
}

# 2. Salvează căutarea pentru refolosire
mutation SaveSearch {
  saveSearch(input: {
    name: "Pensii și Salarizare 2024"
    description: "Căutări pentru știri despre pensii și salarizare din 2024"
    searchParams: {
      query: "pensii salarizare"
      keywords: ["buget", "finante"]
      publicationDateFrom: "2024-01-01"
      orderBy: "viewCount"
      orderDirection: "desc"
    }
    isFavorite: true
  }) {
    id
    name
  }
}

# 3. Obține toate căutările salvate
query GetAllSavedSearches {
  getSavedSearches {
    savedSearches {
      id
      name
      description
      isFavorite
      createdAt
    }
    pagination {
      totalCount
    }
  }
}
```

### Refolosirea unei Căutări Salvate

```graphql
# 1. Obține parametrii căutării salvate
query GetSavedSearch {
  getSavedSearchById(id: "search-id-here") {
    searchParams
  }
}

# 2. Aplică parametrii în searchStiriByKeywords
query UseSavedSearch {
  searchStiriByKeywords(
    query: "pensii salarizare"
    keywords: ["buget", "finante"]
    publicationDateFrom: "2024-01-01"
    orderBy: "viewCount"
    orderDirection: "desc"
  ) {
    stiri {
      id
      title
      publicationDate
      viewCount
    }
  }
}
```

## Securitate

### Row Level Security (RLS)
- Utilizatorii pot accesa doar propriile căutări salvate
- Policy-ul `"Users can access own saved searches"` asigură izolarea datelor

### Validare Input
- Toate input-urile sunt validate conform schemelor Zod
- Parametrii de căutare sunt verificați pentru structura corectă
- Numele și descrierile sunt curățate și limitate la lungimile permise

### Verificare Abonament
- Fiecare operațiune verifică tier-ul utilizatorului
- Utilizatorii Free primesc eroare `SUBSCRIPTION_REQUIRED`
- Verificarea se face prin `UserService.getUserProfile()`

## Performanță

### Indexuri de Bază de Date
- `idx_saved_searches_user_id` - Pentru filtrarea pe utilizator
- `idx_saved_searches_created_at` - Pentru sortarea cronologică
- `idx_saved_searches_is_favorite` - Pentru filtrarea favoritelor

### Optimizări
- Paginarea limitată la 50 de rezultate per pagină
- Sortarea se face la nivelul bazei de date
- RLS asigură că doar căutările relevante sunt procesate

## Monitorizare și Debugging

### Log-uri Importante
- Verificarea abonamentului utilizatorului
- Erorile de validare a input-urilor
- Erorile de bază de date
- Operațiunile CRUD pe căutările salvate

### Metrici Recomandate
- Numărul de căutări salvate per utilizator
- Frecvența de refolosire a căutărilor salvate
- Rate-ul de erori pentru operațiunile de salvare
- Timpul de răspuns pentru query-urile de listare

## Dezvoltare și Testare

### Rularea Testelor
```bash
npm test -- savedSearches.test.js
```

### Testarea Manuală
1. Asigură-te că utilizatorul are abonament Pro/Enterprise
2. Aplică migrația `053_saved_searches.sql`
3. Folosește GraphQL Playground pentru testarea endpoint-urilor
4. Verifică comportamentul pentru utilizatori Free

### Debugging
- Verifică log-urile pentru erorile de abonament
- Validează structura parametrilor de căutare
- Testează RLS-ul prin diferiți utilizatori
- Verifică performanța cu volume mari de date
