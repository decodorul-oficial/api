# API Analitice - Dashboard pentru decodoruloficial.ro

## Prezentare Generală

API-ul de analitice oferă un endpoint GraphQL complet pentru generarea datelor necesare alimentării unui dashboard interactiv pentru aplicația web decodoruloficial.ro. Endpoint-ul principal `getAnalyticsDashboard` returnează toate datele agregate într-un singur query, optimizând performanța și reducând numărul de cereri.

## Arhitectura Implementării

### 1. Componente Principale

#### GraphQL Schema
- **AnalyticsDataPoint**: Tip generic pentru date de grafic (label + value)
- **TimeDataPoint**: Tip specific pentru date pe axă temporală (date + value)  
- **AnalyticsDashboard**: Tipul principal care conține toate datele dashboard-ului

#### Repository Layer (AnalyticsRepository)
- Execută query-urile SQL agregate către Supabase
- Implementează funcții pentru fiecare tip de analiză
- Optimizează performanța prin query-uri paralele

#### Service Layer (AnalyticsService)
- Business logic pentru validarea și formatarea datelor
- Normalizează input-urile (validare interval de date)
- Formatează output-urile pentru GraphQL

#### Database Functions
- Funcții SQL native pentru performanță maximă
- Indexuri optimizate pentru query-uri agregate
- Migrația 022 conține toate funcțiile necesare

## Endpoint Principal

### Query GraphQL

```graphql
query GetAnalyticsDashboard($startDate: String!, $endDate: String!) {
  getAnalyticsDashboard(startDate: $startDate, endDate: $endDate) {
    totalActs
    legislativeActivityOverTime {
      date
      value
    }
    topActiveMinistries {
      label
      value
    }
    distributionByCategory {
      label
      value
    }
    topKeywords {
      label
      value
    }
    topMentionedLaws {
      label
      value
    }
  }
}
```

### Parametri

- **startDate** (String!): Data de început în format YYYY-MM-DD
- **endDate** (String!): Data de sfârșit în format YYYY-MM-DD

### Validări
- Intervalul maxim: 2 ani
- Data de început <= Data de sfârșit
- Format valid de dată (YYYY-MM-DD)

## Structura Răspunsului

### totalActs (Int!)
Numărul total de acte normative publicate în intervalul specificat.

**Utilizare**: KPI principal pentru dashboard

### legislativeActivityOverTime ([TimeDataPoint!]!)
Activitatea legislativă pe zile în intervalul specificat.

**Structură**:
```json
[
  { "date": "2024-01-15", "value": 5 },
  { "date": "2024-01-16", "value": 3 },
  ...
]
```

**Utilizare**: Grafic linie pentru vizualizarea tendințelor temporale

### topActiveMinistries ([AnalyticsDataPoint!]!)
Top 5 ministere/instituții cu cel mai mare număr de acte publicate.

**Structură**:
```json
[
  { "label": "Ministerul Finanțelor", "value": 45 },
  { "label": "Ministerul Sănătății", "value": 32 },
  ...
]
```

**Sursa datelor**: `content->>'author'` din tabela `stiri`

**Utilizare**: Grafic bară pentru activitatea instituțională

### distributionByCategory ([AnalyticsDataPoint!]!)
Distribuția actelor normative pe toate categoriile disponibile.

**Structură**:
```json
[
  { "label": "fiscalitate", "value": 28 },
  { "label": "sănătate", "value": 22 },
  { "label": "educație", "value": 19 },
  ...
]
```

**Sursa datelor**: `content->>'category'` din tabela `stiri`

**Utilizare**: Pie chart pentru distribuția pe domenii

### topKeywords ([AnalyticsDataPoint!]!)
Top 10 cele mai frecvente cuvinte cheie din actele normative.

**Structură**:
```json
[
  { "label": "digitalizare", "value": 67 },
  { "label": "investiții", "value": 54 },
  { "label": "cod fiscal", "value": 43 },
  ...
]
```

**Sursa datelor**: Array-ul `content->'keywords'` din tabela `stiri`

**Utilizare**: Word cloud sau listă pentru tendințe tematice

### topMentionedLaws ([AnalyticsDataPoint!]!)
Top 10 acte normative cel mai des menționate în alte documente.

**Structură**:
```json
[
  { "label": "Legea nr. 227/2015", "value": 23 },
  { "label": "OUG nr. 114/2018", "value": 18 },
  ...
]
```

**Sursa datelor**: Entitățile cu `label = "WORK_OF_ART"` din coloana `entities`

**Utilizare**: Listă sau grafic pentru legile fundamentale

## Implementarea Bazei de Date

### Funcții SQL Principale

#### get_total_acts(p_start_date, p_end_date)
```sql
-- Returnează numărul total de acte în perioada specificată
SELECT COUNT(*) FROM public.stiri 
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
```

#### get_legislative_activity_over_time(p_start_date, p_end_date)
```sql
-- Activitatea pe zile
SELECT 
  date_trunc('day', publication_date)::TEXT as date,
  COUNT(*)::BIGINT as value
FROM public.stiri s
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
GROUP BY date_trunc('day', publication_date)
ORDER BY date_trunc('day', publication_date) ASC
```

#### get_top_active_ministries(p_start_date, p_end_date, p_limit)
```sql
-- Top ministere active
SELECT 
  COALESCE(content->>'author', 'Necunoscut')::TEXT as label,
  COUNT(*)::BIGINT as value
FROM public.stiri
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
  AND content->>'author' IS NOT NULL
GROUP BY content->>'author'
ORDER BY COUNT(*) DESC
LIMIT p_limit
```

#### get_distribution_by_category(p_start_date, p_end_date)
```sql
-- Distribuția pe categorii
SELECT 
  COALESCE(content->>'category', 'Necategorizat')::TEXT as label,
  COUNT(*)::BIGINT as value
FROM public.stiri
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
GROUP BY content->>'category'
ORDER BY COUNT(*) DESC
```

#### get_top_keywords(p_start_date, p_end_date, p_limit)
```sql
-- Top cuvinte cheie
SELECT 
  keyword::TEXT as label,
  COUNT(*)::BIGINT as value
FROM public.stiri s,
     jsonb_array_elements_text(s.content->'keywords') as keyword
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
  AND content->'keywords' IS NOT NULL
  AND jsonb_typeof(content->'keywords') = 'array'
GROUP BY keyword
ORDER BY COUNT(*) DESC
LIMIT p_limit
```

#### get_top_mentioned_laws(p_start_date, p_end_date, p_limit)
```sql
-- Actele cele mai menționate
SELECT 
  entity->>'text' as label,
  COUNT(*)::BIGINT as value
FROM public.stiri s,
     jsonb_array_elements(s.entities) as entity
WHERE publication_date >= p_start_date 
  AND publication_date <= p_end_date
  AND entities IS NOT NULL
  AND entity->>'label' = 'WORK_OF_ART'
GROUP BY entity->>'text'
ORDER BY COUNT(*) DESC
LIMIT p_limit
```

### Indexuri pentru Performanță

```sql
-- Index compozit pentru author și dată
CREATE INDEX idx_stiri_publication_date_content_author 
ON public.stiri (publication_date, (content->>'author'));

-- Index compozit pentru category și dată  
CREATE INDEX idx_stiri_publication_date_content_category 
ON public.stiri (publication_date, (content->>'category'));

-- Index pentru entities cu WORK_OF_ART
CREATE INDEX idx_stiri_entities_work_of_art 
ON public.stiri USING GIN (entities) 
WHERE entities @> '[{"label": "WORK_OF_ART"}]';

-- Index pentru keywords cu filtrare pe dată
CREATE INDEX idx_stiri_content_keywords_publication_date 
ON public.stiri (publication_date) 
WHERE content->'keywords' IS NOT NULL 
  AND jsonb_typeof(content->'keywords') = 'array';
```

## Exemple de Utilizare

### 1. Request Basic

```javascript
const query = `
  query GetAnalyticsDashboard($startDate: String!, $endDate: String!) {
    getAnalyticsDashboard(startDate: $startDate, endDate: $endDate) {
      totalActs
      legislativeActivityOverTime { date value }
      topActiveMinistries { label value }
      distributionByCategory { label value }
      topKeywords { label value }
      topMentionedLaws { label value }
    }
  }
`;

const variables = {
  startDate: "2024-01-01",
  endDate: "2024-12-31"
};

const response = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables })
});
```

### 2. Integrare cu Chart.js

```javascript
const analytics = await fetchAnalyticsDashboard();

// Grafic linie pentru activitatea în timp
const timeChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: analytics.legislativeActivityOverTime.map(d => d.date),
    datasets: [{
      label: 'Acte Publicate',
      data: analytics.legislativeActivityOverTime.map(d => d.value)
    }]
  }
});

// Grafic bară pentru ministere
const ministriesChart = new Chart(ctx, {
  type: 'bar',
  data: {
    labels: analytics.topActiveMinistries.map(d => d.label),
    datasets: [{
      label: 'Număr Acte',
      data: analytics.topActiveMinistries.map(d => d.value)
    }]
  }
});
```

### 3. Perioade Predefinite

```javascript
class AnalyticsPeriods {
  static getLastMonth() {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }

  static getLastQuarter() {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }

  static getLastYear() {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }
}
```

## Performanță și Scalabilitate

### Optimizări Implementate

1. **Query-uri Paralele**: Toate analizele se execută simultan în repository
2. **Indexuri Specifice**: Indexuri compozite pentru fiecare tip de query
3. **Funcții Native SQL**: Procesarea se face la nivel de bază de date
4. **Caching Potențial**: Structura permite implementarea de caching pe serviciu

### Limite și Restricții

- **Interval Maxim**: 2 ani pentru a preveni query-uri prea costisitoare
- **Rate Limiting**: Endpoint-ul respectă limitele de rate limiting existente
- **Autentificare**: Necesită token JWT valid

### Metrici de Performanță Estimate

- **Query Simple** (1 lună): ~100-200ms
- **Query Complex** (1 an): ~500ms-1s  
- **Query Maxim** (2 ani): ~1-2s

## Corectări și Îmbunătățiri

### Corectarea Grupării Temporale (Migrația 023)

**Problema identificată**: Implementarea inițială folosea `GROUP BY s.publication_date` care nu asigura agregarea corectă pe zi calendaristică.

**Soluția implementată**: Folosirea `date_trunc('day', s.publication_date)` pentru gruparea corectă pe zi.

**Înainte (incorect)**:
```sql
GROUP BY s.publication_date
ORDER BY s.publication_date ASC
```

**După (corect)**:
```sql
GROUP BY date_trunc('day', s.publication_date)
ORDER BY date_trunc('day', s.publication_date) ASC
```

**Beneficiul**: Asigură că datele sunt grupate corect pe zi calendaristică, nu pe timestamp exact.

## Instrucțiuni de Instalare

### 1. Aplicarea Migrațiilor

Execută în Supabase SQL Editor:

```sql
-- 1. Funcții principale pentru analytics
-- Execută conținutul din database/migrations/022_analytics_dashboard_functions.sql

-- 2. Corectarea grupării temporale (IMPORTANT!)
-- Execută conținutul din database/migrations/023_fix_temporal_grouping.sql
```

### 2. Verificarea Funcțiilor

```sql
-- Testează funcțiile
SELECT public.get_total_acts('2024-01-01', '2024-12-31');
SELECT * FROM public.get_legislative_activity_over_time('2024-01-01', '2024-01-31');
```

### 3. Testarea Endpoint-ului

```graphql
# În GraphQL Playground
query {
  getAnalyticsDashboard(
    startDate: "2024-01-01", 
    endDate: "2024-01-31"
  ) {
    totalActs
  }
}
```

## Extinderi Viitoare

### Analitice Suplimentare Posibile

1. **Analiza Sentimentului**: Detectarea tonului pozitiv/negativ în acte
2. **Rețele de Conexiuni**: Grafuri de relații între instituții și legi
3. **Predicții**: Analiza tendințelor pentru estimarea activității viitoare
4. **Comparări Temporale**: Compararea perioadelor similare
5. **Export Date**: Funcționalitate de export în Excel/CSV
6. **Filtrare Avansată**: Filtrare după tipul de act normativ

### Schema Extensibilă

Tipurile GraphQL pot fi extinse fără breaking changes:

```graphql
type AnalyticsDashboard {
  # Câmpuri existente...
  
  # Extensii viitoare
  sentimentAnalysis: [SentimentDataPoint!]
  institutionNetwork: [NetworkConnection!]
  predictions: [PredictionDataPoint!]
  historicalComparisons: [ComparisonDataPoint!]
}
```

## Suport și Debugging

### Logarea Erorilor

- Toate erorile sunt logate cu context complet
- Repository și Service au error handling granular
- GraphQL errors sunt formatate pentru debugging

### Verificarea Sănătății

```sql
-- Verifică că toate funcțiile există
SELECT proname FROM pg_proc WHERE proname LIKE 'get_%analytics%';

-- Verifică indexurile
SELECT indexname FROM pg_indexes WHERE tablename = 'stiri';
```

### Probleme Comune

1. **Query Timeout**: Reducerea intervalului de date
2. **Date Lipsă**: Verificarea existenței datelor în perioada selectată  
3. **Performanță Slabă**: Verificarea indexurilor și planurilor de execuție

Pentru suport suplimentar, consultă exemplele din `examples/analytics-dashboard-example.js`.
