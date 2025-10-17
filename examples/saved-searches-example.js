/**
 * Exemple de utilizare pentru funcționalitatea de căutări salvate
 * Pentru utilizatorii cu abonament Pro/Enterprise
 */

console.log(`
=================================================================
   EXEMPLU: Căutări Salvate pentru Utilizatori cu Abonament
=================================================================

Funcționalitatea permite utilizatorilor cu abonament Pro/Enterprise să:
✅ Salveze căutările frecvente
✅ Organizeze căutările în favorite
✅ Gestioneze o listă personalizată de căutări
✅ Refolosească rapid parametrii de căutare

-----------------------------------------------------------------
1. SALVAREA UNEI CĂUTĂRI
-----------------------------------------------------------------

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

-----------------------------------------------------------------
2. OBȚINEREA CĂUTĂRILOR SALVATE
-----------------------------------------------------------------

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

-----------------------------------------------------------------
3. OBȚINEREA DOAR FAVORITELOR
-----------------------------------------------------------------

query GetFavoriteSearches {
  getSavedSearches(
    favoritesOnly: true
    orderBy: "name"
    orderDirection: "asc"
  ) {
    savedSearches {
      id
      name
      description
      searchParams
      isFavorite
    }
  }
}

-----------------------------------------------------------------
4. OBȚINEREA UNEI CĂUTĂRI SPECIFICE
-----------------------------------------------------------------

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

-----------------------------------------------------------------
5. ACTUALIZAREA UNEI CĂUTĂRI SALVATE
-----------------------------------------------------------------

mutation UpdateSavedSearch {
  updateSavedSearch(
    id: "search-id-here"
    input: {
      name: "Căutare Guvern 2024 - Actualizată"
      description: "Căutări actualizate pentru hotărâri guvernamentale"
      searchParams: {
        query: "guvern hotarare ordin"
        keywords: ["legislatie", "finante", "mediu"]
        publicationDateFrom: "2024-06-01"
        publicationDateTo: "2024-12-31"
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

-----------------------------------------------------------------
6. COMUTAREA STATUSULUI DE FAVORIT
-----------------------------------------------------------------

mutation ToggleFavorite {
  toggleFavoriteSearch(id: "search-id-here") {
    id
    name
    isFavorite
  }
}

-----------------------------------------------------------------
7. ȘTERGEREA UNEI CĂUTĂRI SALVATE
-----------------------------------------------------------------

mutation DeleteSavedSearch {
  deleteSavedSearch(id: "search-id-here")
}

-----------------------------------------------------------------
8. REFOLOSIREA UNEI CĂUTĂRI SALVATE
-----------------------------------------------------------------

# Pasul 1: Obține căutarea salvată
query GetSavedSearch {
  getSavedSearchById(id: "search-id-here") {
    id
    name
    searchParams
  }
}

# Pasul 2: Folosește parametrii în searchStiriByKeywords
query UseSavedSearch {
  searchStiriByKeywords(
    query: "guvern hotarare"  # din searchParams.query
    keywords: ["legislatie", "finante"]  # din searchParams.keywords
    publicationDateFrom: "2024-01-01"  # din searchParams.publicationDateFrom
    publicationDateTo: "2024-12-31"  # din searchParams.publicationDateTo
    orderBy: "publicationDate"  # din searchParams.orderBy
    orderDirection: "desc"  # din searchParams.orderDirection
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

-----------------------------------------------------------------
9. EXEMPLU COMPLET: WORKFLOW DE CĂUTARE ȘI SALVARE
-----------------------------------------------------------------

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

-----------------------------------------------------------------
RESTRICȚII ȘI VALIDĂRI:
-----------------------------------------------------------------

❌ Doar utilizatorii cu abonament Pro/Enterprise pot salva căutări
❌ Utilizatorii Free primesc eroare: SUBSCRIPTION_REQUIRED
✅ Numele căutărilor trebuie să fie unice per utilizator
✅ Parametrii de căutare sunt validați conform schemelor existente
✅ RLS (Row Level Security) asigură că utilizatorii văd doar propriile căutări
✅ Paginarea este limitată la 50 de rezultate per pagină
✅ Numele căutării: 1-100 caractere
✅ Descrierea: maxim 500 caractere

-----------------------------------------------------------------
CODURI DE EROARE:
-----------------------------------------------------------------

- UNAUTHENTICATED: Utilizatorul nu este autentificat
- SUBSCRIPTION_REQUIRED: Utilizatorul nu are abonament activ
- DUPLICATE_NAME: Există deja o căutare cu acest nume
- NOT_FOUND: Căutarea salvată nu a fost găsită
- VALIDATION_ERROR: Parametrii invalizi
- DATABASE_ERROR: Eroare la nivelul bazei de date
- INTERNAL_ERROR: Eroare internă a serverului

-----------------------------------------------------------------
NOTĂ: Pentru a testa aceste query-uri:
-----------------------------------------------------------------

1. Asigură-te că utilizatorul are abonament Pro sau Enterprise
2. Aplică migrația 053_saved_searches.sql în Supabase
3. Folosește GraphQL Playground la: http://localhost:4000/graphql
4. Adaugă header-ul de autentificare:
   Authorization: Bearer <your-jwt-token>

=================================================================
`);
