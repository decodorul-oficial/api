# Funcționalitatea de Știri Favorite

Această documentație descrie implementarea funcționalității de știri favorite pentru utilizatorii autentificați cu abonament activ sau trial.

## Prezentare Generală

Funcționalitatea de știri favorite permite utilizatorilor să salveze știri ca favorite, să le gestioneze și să le acceseze ulterior. Această funcționalitate este disponibilă doar pentru utilizatorii cu abonament activ sau trial.

## Caracteristici

- ✅ Adăugare știri la favorite
- ✅ Ștergere știri din favorite
- ✅ Comutare status (toggle) pentru știri favorite
- ✅ Listare știri favorite cu paginare
- ✅ Verificare dacă o știre este în favorite
- ✅ Statistici despre știrile favorite
- ✅ Ștergerea tuturor știrilor favorite
- ✅ Integrare în profilul utilizatorului
- ✅ Validare abonament activ/trial
- ✅ Validare existență știri

## Structura Bazei de Date

### Tabelul `favorite_news`

```sql
CREATE TABLE favorite_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    news_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, news_id)
);
```

**Câmpuri:**
- `id`: Identificator unic pentru înregistrarea de favorite
- `user_id`: Referință către utilizatorul care a adăugat știrea la favorite
- `news_id`: ID-ul știrii (string)
- `created_at`: Data când știrea a fost adăugată la favorite
- `updated_at`: Data ultimei actualizări

**Indexuri:**
- `idx_favorite_news_user_id`: Pentru căutări rapide după utilizator
- `idx_favorite_news_news_id`: Pentru căutări rapide după știre
- `idx_favorite_news_created_at`: Pentru sortare după dată

**Securitate:**
- RLS (Row Level Security) activat
- Utilizatorii pot vedea și gestiona doar propriile știri favorite

## API GraphQL

### Tipuri

#### `FavoriteNews`
```graphql
type FavoriteNews {
  id: ID!
  userId: ID!
  newsId: String!
  createdAt: String!
  updatedAt: String!
  # News properties
  title: String!
  publicationDate: String!
  viewCount: Int!
  summary: String
}
```

#### `FavoriteNewsResponse`
```graphql
type FavoriteNewsResponse {
  favoriteNews: [FavoriteNews!]!
  pagination: PaginationInfo!
}
```

#### `ToggleFavoriteNewsResponse`
```graphql
type ToggleFavoriteNewsResponse {
  action: String!
  isFavorite: Boolean!
  message: String!
  favoriteNews: FavoriteNews
}
```

#### `FavoriteNewsStats`
```graphql
type FavoriteNewsStats {
  totalFavorites: Int!
  latestFavoriteDate: String
}
```

### Queries

#### `getFavoriteNews`
Obține știrile favorite ale utilizatorului cu paginare. Include proprietățile știrii (titlu, data publicării, numărul de vizualizări, summary) pentru a evita request-uri suplimentare.

```graphql
query GetFavoriteNews($limit: Int, $offset: Int, $orderBy: String, $orderDirection: String) {
  getFavoriteNews(limit: $limit, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection) {
    favoriteNews {
      id
      userId
      newsId
      createdAt
      updatedAt
      # News properties
      title
      publicationDate
      viewCount
      summary
    }
    pagination {
      totalCount
      hasNextPage
      hasPreviousPage
      currentPage
      totalPages
    }
  }
}
```

**Parametri:**
- `limit`: Numărul maxim de rezultate (1-100, default: 20)
- `offset`: Offset-ul pentru paginare (default: 0)
- `orderBy`: Câmpul de sortare (`created_at`, `updated_at`, default: `created_at`)
- `orderDirection`: Direcția sortării (`ASC`, `DESC`, default: `DESC`)

#### `isFavoriteNews`
Verifică dacă o știre este în favoritele utilizatorului.

```graphql
query IsFavoriteNews($newsId: String!) {
  isFavoriteNews(newsId: $newsId)
}
```

#### `getFavoriteNewsStats`
Obține statistici despre știrile favorite ale utilizatorului.

```graphql
query GetFavoriteNewsStats {
  getFavoriteNewsStats {
    totalFavorites
    latestFavoriteDate
  }
}
```

### Mutations

#### `addFavoriteNews`
Adaugă o știre la favoritele utilizatorului.

```graphql
mutation AddFavoriteNews($newsId: String!) {
  addFavoriteNews(newsId: $newsId) {
    id
    userId
    newsId
    createdAt
  }
}
```

**Erori posibile:**
- `SUBSCRIPTION_REQUIRED`: Utilizatorul nu are abonament activ sau trial
- `NEWS_NOT_FOUND`: Știrea nu există
- `ALREADY_FAVORITE`: Știrea este deja în favorite

#### `removeFavoriteNews`
Șterge o știre din favoritele utilizatorului.

```graphql
mutation RemoveFavoriteNews($newsId: String!) {
  removeFavoriteNews(newsId: $newsId)
}
```

**Erori posibile:**
- `SUBSCRIPTION_REQUIRED`: Utilizatorul nu are abonament activ sau trial
- `NOT_FAVORITE`: Știrea nu este în favorite

#### `toggleFavoriteNews`
Comută statusul unei știri în favorite (adaugă dacă nu este, șterge dacă este).

```graphql
mutation ToggleFavoriteNews($newsId: String!) {
  toggleFavoriteNews(newsId: $newsId) {
    action
    isFavorite
    message
    favoriteNews {
      id
      newsId
      createdAt
    }
  }
}
```

#### `clearAllFavoriteNews`
Șterge toate știrile favorite ale utilizatorului.

```graphql
mutation ClearAllFavoriteNews {
  clearAllFavoriteNews
}
```

### Integrare în Profil

Profilul utilizatorului include acum o proprietate `favoriteNews` care returnează array-ul de ID-uri ale știrilor favorite:

```graphql
query GetMyProfile {
  me {
    id
    email
    profile {
      id
      subscriptionTier
      displayName
      favoriteNews  # Array de string-uri cu ID-urile știrilor favorite
      trialStatus {
        isTrial
        hasTrial
        daysRemaining
      }
      activeSubscription {
        id
        status
        tier {
          name
          displayName
        }
      }
    }
  }
}
```

## Validări și Securitate

### Verificare Abonament
Toate operațiunile de gestionare a știrilor favorite verifică dacă utilizatorul are:
- Abonament activ (`status: 'ACTIVE'`)
- Trial activ (`isTrial: true`)

### Validare Știri
- Se verifică dacă știrea există în baza de date înainte de a fi adăugată la favorite
- ID-urile știrilor sunt validate (string, 1-255 caractere)

### Securitate
- RLS (Row Level Security) asigură că utilizatorii văd doar propriile știri favorite
- Toate operațiunile necesită autentificare
- Validarea input-urilor cu Zod

## Exemple de Utilizare

### JavaScript/TypeScript

```javascript
// Adaugă o știre la favorite
const addFavorite = async (newsId) => {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        mutation AddFavoriteNews($newsId: String!) {
          addFavoriteNews(newsId: $newsId) {
            id
            newsId
            createdAt
          }
        }
      `,
      variables: { newsId }
    })
  });
  
  return response.json();
};

// Obține știrile favorite
const getFavorites = async () => {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query GetFavoriteNews {
          getFavoriteNews {
            favoriteNews {
              id
              newsId
              createdAt
            }
            pagination {
              totalCount
              hasNextPage
            }
          }
        }
      `
    })
  });
  
  return response.json();
};
```

### React Hook

```javascript
import { useState, useEffect } from 'react';

const useFavoriteNews = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);

  const addFavorite = async (newsId) => {
    setLoading(true);
    try {
      await addFavoriteNews(newsId);
      setFavorites(prev => [...prev, newsId]);
    } catch (error) {
      console.error('Error adding favorite:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (newsId) => {
    setLoading(true);
    try {
      await removeFavoriteNews(newsId);
      setFavorites(prev => prev.filter(id => id !== newsId));
    } catch (error) {
      console.error('Error removing favorite:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (newsId) => {
    setLoading(true);
    try {
      const result = await toggleFavoriteNews(newsId);
      if (result.isFavorite) {
        setFavorites(prev => [...prev, newsId]);
      } else {
        setFavorites(prev => prev.filter(id => id !== newsId));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    toggleFavorite
  };
};
```

## Migrarea de la localStorage

Pentru a migra datele de la localStorage la API:

```javascript
// Migrează favoritele din localStorage la API
const migrateFavorites = async () => {
  const localFavorites = JSON.parse(localStorage.getItem('favoriteNews') || '[]');
  
  for (const newsId of localFavorites) {
    try {
      await addFavoriteNews(newsId);
      console.log(`Migrated favorite: ${newsId}`);
    } catch (error) {
      console.error(`Failed to migrate favorite ${newsId}:`, error);
    }
  }
  
  // Șterge datele din localStorage după migrare
  localStorage.removeItem('favoriteNews');
};
```

## Limitări

1. **Abonament necesar**: Funcționalitatea este disponibilă doar pentru utilizatorii cu abonament activ sau trial
2. **Validare știri**: Știrile trebuie să existe în baza de date
3. **Limitări de paginare**: Maximum 100 de rezultate per pagină
4. **Unicitate**: Un utilizator nu poate adăuga aceeași știre de două ori la favorite

## Monitorizare și Logging

- Toate operațiunile sunt loggate pentru monitorizare
- Erorile sunt capturate și raportate
- Statisticile de utilizare sunt disponibile prin `getFavoriteNewsStats`

## Dezvoltare Viitoare

- [ ] Notificări când știrile favorite sunt actualizate
- [ ] Export/import știri favorite
- [ ] Categorii pentru știrile favorite
- [ ] Partajare listelor de favorite
- [ ] Sincronizare în timp real între dispozitive
