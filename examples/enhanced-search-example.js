/**
 * Exemplu de utilizare a endpoint-ului îmbunătățit searchStiriByKeywords
 * care suportă acum fuzzy/full-text search + filtrare după keywords și date
 */

// Exemple de query-uri GraphQL pentru testarea funcționalității îmbunătățite

console.log(`
=================================================================
   EXEMPLU: Endpoint Îmbunătățit searchStiriByKeywords
=================================================================

Endpoint-ul searchStiriByKeywords a fost îmbunătățit cu suport pentru:
✅ Fuzzy/full-text search (ca searchStiri)
✅ Filtrare după keywords din content.keywords
✅ Filtrare după interval de date
✅ Toate combinațiile de mai sus

-----------------------------------------------------------------
1. CĂUTARE FUZZY/FULL-TEXT SIMPLĂ
-----------------------------------------------------------------

query SearchByText {
  searchStiriByKeywords(
    query: "guvern decision"
    limit: 10
    offset: 0
    orderBy: "publicationDate"
    orderDirection: "desc"
  ) {
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
      totalPages
    }
  }
}

-----------------------------------------------------------------
2. CĂUTARE CU KEYWORDS (funcționalitatea originală)
-----------------------------------------------------------------

query SearchByKeywords {
  searchStiriByKeywords(
    keywords: ["legislatie", "finante"]
    limit: 10
    offset: 0
  ) {
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
      totalPages
    }
  }
}

-----------------------------------------------------------------
3. CĂUTARE CU INTERVAL DE DATE
-----------------------------------------------------------------

query SearchByDateRange {
  searchStiriByKeywords(
    publicationDateFrom: "2024-01-01"
    publicationDateTo: "2024-08-31"
    limit: 10
    offset: 0
    orderBy: "publicationDate"
    orderDirection: "desc"
  ) {
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
      totalPages
    }
  }
}

-----------------------------------------------------------------
4. CĂUTARE COMBINATĂ (FUZZY + KEYWORDS + DATE)
-----------------------------------------------------------------

query SearchCombined {
  searchStiriByKeywords(
    query: "hotarare guvern"
    keywords: ["legislatie"]
    publicationDateFrom: "2024-06-01"
    publicationDateTo: "2024-08-31"
    limit: 10
    offset: 0
    orderBy: "publicationDate"
    orderDirection: "desc"
  ) {
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
      totalPages
    }
  }
}

-----------------------------------------------------------------
5. CĂUTARE CU SORTARE DUPĂ VIZUALIZĂRI
-----------------------------------------------------------------

query SearchByViews {
  searchStiriByKeywords(
    query: "guvern"
    orderBy: "viewCount"
    orderDirection: "desc"
    limit: 10
    offset: 0
  ) {
    stiri {
      id
      title
      publicationDate
      viewCount
      content
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
6. CĂUTARE COMBINATĂ CU SORTARE DUPĂ VIZUALIZĂRI
-----------------------------------------------------------------

query SearchCombinedByViews {
  searchStiriByKeywords(
    query: "hotarare guvern"
    keywords: ["legislatie"]
    publicationDateFrom: "2024-06-01"
    publicationDateTo: "2024-08-31"
    orderBy: "viewCount"
    orderDirection: "desc"
    limit: 10
    offset: 0
  ) {
    stiri {
      id
      title
      publicationDate
      viewCount
      content
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
FUNCȚIONALITĂȚI ÎMBUNĂTĂȚITE:
-----------------------------------------------------------------

✅ Query parameter (opțional): Căutare fuzzy/full-text în title și content
✅ Keywords parameter (opțional): Filtrare exactă pe content.keywords
✅ Date range (opțional): publicationDateFrom și publicationDateTo
✅ Combină toate criteriile: query + keywords + date range
✅ Suportă diacritice (românești): căută "guvern" și găsește "Guvern"
✅ Performanță optimizată: indexuri pe tsvector și trigram
✅ Sortare flexibilă: publicationDate, createdAt, title, id
✅ Paginare completă: limit, offset, totalCount, hasNextPage

-----------------------------------------------------------------
NOTĂ: Pentru a testa aceste query-uri:
-----------------------------------------------------------------

1. Asigură-te că migrația 015_enhanced_search_with_keywords.sql 
   a fost aplicată în Supabase Dashboard → SQL Editor

2. Folosește GraphQL Playground la: http://localhost:4000/graphql
   sau Apollo Studio pentru a executa query-urile

3. Pentru request-uri autentificate, adaugă header-ul:
   Authorization: Bearer <your-jwt-token>

=================================================================
`);
