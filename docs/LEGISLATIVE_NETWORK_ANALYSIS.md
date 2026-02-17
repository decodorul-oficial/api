# 🌐 Analiza de Rețea a Conexiunilor Legislative

## Prezentare Generală

Funcționalitatea de analiză de rețea a conexiunilor legislative reprezintă o inovație majoră în modul de înțelegere a ecosistemului legislativ românesc. În loc să privești fiecare act normativ ca pe o entitate separată, această analiză construiește o hartă vizuală a modului în care legile se influențează reciproc.

## 🎯 Scopul Funcționalității

### Ce Obținem?
- **Harta Conexiunilor**: Vizualizarea relațiilor dintre acte normative
- **Istoricul Modificărilor**: Lanțul complet de modificări pentru o lege
- **Impactul Actelor Noi**: Identificarea rapidă a legilor afectate
- **Analiza de Rețea**: Înțelegerea ecosistemului legislativ ca întreg

### Valoarea pentru Utilizatori
- **Avocați**: Reducerea timpului de cercetare legislativă
- **Consultanți**: Înțelegerea impactului modificărilor
- **Jurnaliști**: Contextul complet al schimbărilor legislative
- **Cercetători**: Analiza pattern-urilor legislative

## 🏗️ Arhitectura Tehnică

### 1. Baza de Date

#### Tabela `legislative_connections`
```sql
CREATE TABLE public.legislative_connections (
    id BIGSERIAL PRIMARY KEY,
    source_document_id BIGINT NOT NULL REFERENCES public.stiri(id),
    target_document_id BIGINT NOT NULL REFERENCES public.stiri(id),
    relationship_type TEXT NOT NULL CHECK (
        relationship_type IN ('modifică', 'completează', 'abrogă', 'face referire la', 'derogă', 'suspendă')
    ),
    confidence_score FLOAT DEFAULT 0.8 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    extraction_method TEXT DEFAULT 'automatic' CHECK (
        extraction_method IN ('automatic', 'manual', 'ai_enhanced')
    ),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE(source_document_id, target_document_id, relationship_type)
);
```

#### Indexuri pentru Performanță
- `idx_legislative_connections_source`: Pentru căutări rapide după documentul sursă
- `idx_legislative_connections_target`: Pentru căutări rapide după documentul țintă
- `idx_legislative_connections_type`: Pentru filtrarea după tipul relației
- `idx_legislative_connections_confidence`: Pentru sortarea după scorul de încredere
- `idx_legislative_connections_composite`: Index compozit pentru interogări complexe

### 2. Funcții de Baza de Date

#### `extract_legislative_connections()`
Extrage automat conexiunile legislative din conținutul unei știri.

**Parametri:**
- `p_stire_id`: ID-ul știrii
- `p_content`: Conținutul text pentru analiză
- `p_entities`: Entitățile extrase (JSONB)

**Logica de Extragere:**
1. Identifică entitățile de tip `WORK_OF_ART`, `LAW`, `LEGISLATION`
2. **Folosește sistemul robust de rezolvare** pentru identificarea precisă a documentelor țintă
3. Determină tipul relației pe baza contextului
4. Calculează scorul de încredere bazat pe precizia potrivirii
5. Inserează conexiunea cu metadate îmbunătățite

**Sistemul robust de rezolvare:**
- **Normalizarea identificatorilor:** Convertește diacriticele și standardizează formatul
- **Pattern matching inteligent:** Recunoaște tipul, numărul și anul actelor normative
- **Potrivirea precisă:** Folosește identificatori unici în loc de căutări fuzzy
- **Scor de încredere:** Asignează un scor bazat pe metoda de potrivire

#### `get_legislative_graph()`
Construiește graficul de conexiuni legislative cu o adâncime specificată.

**Parametri:**
- `p_document_id`: ID-ul documentului de pornire
- `p_depth`: Adâncimea de explorare (implicit 1, **MAXIM 3** pentru securitate)
- `p_min_confidence`: Filtrul minim de încredere (default 0.5) pentru a exclude "zgomotul" (false positives)

**Returnează:**
- `nodes`: Lista nodurilor (acte normative)
- `links`: Lista conexiunilor între noduri

**Îmbunătățiri Recente (Noiembrie 2025):**
S-a adăugat filtrarea `p_min_confidence >= 0.5` pentru a rezolva o anomalie în care documente generice (ex: mențiuni "Guvernul") creau mii de legături false cu scor scăzut (0.48).

#### `get_legislative_connections_stats()`
Obține statistici despre conexiunile legislative.

**Returnează:**
- `total_connections`: Numărul total de conexiuni
- `connections_by_type`: Distribuția pe tipuri de relații
- `top_source_documents`: Documentele cu cele mai multe conexiuni sursă
- `top_target_documents`: Documentele cu cele mai multe conexiuni țintă
- `average_confidence`: Scorul mediu de încredere

### 3. Sistemul Robust de Rezolvare a Identificatorilor

#### `normalize_legislative_identifier()`
**Scop:** Normalizează identificatorii legislative în tip, număr și an pentru rezolvare precisă.

**Funcționalități:**
- **Normalizarea diacriticelor:** Convertește `ă`, `â`, `î`, `ș`, `ț` în `a`, `i`, `s`, `t`
- **Pattern matching inteligent:** Recunoaște formatele standard ale actelor normative
- **Tipuri suportate:** Lege, Ordonanță, Ordonanță de urgență, Hotărâre, Decret, Decizie, Cod
- **Extragerea precisă:** Numărul și anul din identificator

**Exemple de pattern-uri:**
```sql
-- Legea nr. 123/2020 → type: 'lege', number: '123', year: '2020'
-- Ordonanța de urgență nr. 45/2021 → type: 'ordonanta_urgenta', number: '45', year: '2021'
-- Codul fiscal → type: 'cod', number: 'fiscal', year: null
```

#### `resolve_legislative_identifier()`
**Scop:** Rezolvă identificatorii legislative în documente cu metoda de potrivire și încrederea potrivirii.

**Metode de potrivire (în ordinea priorității):**
1. **`exact_identifier_match`** (confidence: 0.95): Potrivire exactă după tip, număr și an
2. **`partial_identifier_match`** (confidence: 0.8): Potrivire parțială cu tip și număr
3. **`type_match`** (confidence: 0.6): Potrivire doar după tip
4. **`text_match`** (confidence: 0.4): Potrivire fuzzy după text
5. **`fallback_match`** (confidence: 0.2): Potrivire de ultimă instanță

**Beneficiile sistemului robust:**
- **Precizia ridicată:** Elimină potrivirile greșite (ex: "Legea nr. 123/2020" vs "Legea nr. 123/2021")
- **Identificatori unici:** Bazat pe tip + număr + an în loc de căutări fuzzy
- **Scor de încredere:** Fiecare potrivire are un scor bazat pe metoda folosită
- **Metadate complete:** Contextul extragerii și metoda de potrivire sunt salvate
- **Securitate îmbunătățită:** Elimină vulnerabilitățile de potrivire greșită și manipulare
- **Robustețe completă:** Gestionarea erorilor și idempotența procesului
- **Documente externe:** Tracking-ul complet al referințelor externe

### 4. Gestionarea Erorilor și Robustețea

#### **Idempotența Procesului**
**IMPORTANT**: Procesul de extragere a conexiunilor este **idempotent** - poate fi rulat de multiple ori fără a crea conexiuni duplicate.

**Implementarea idempotenței:**
```sql
-- Verifică dacă conexiunea există deja înainte de inserare
SELECT EXISTS(
    SELECT 1 FROM public.legislative_connections 
    WHERE source_document_id = p_stire_id 
      AND target_document_id = v_resolved_document.document_id
) INTO v_connection_exists;

-- Dacă conexiunea nu există, o creează
IF NOT v_connection_exists THEN
    INSERT INTO public.legislative_connections (...);
ELSE
    -- Actualizează metadatele existente
    UPDATE public.legislative_connections SET ...;
END IF;
```

#### **Gestionarea Documentelor Externe**
**Problema:** Ce se întâmplă când un document menționat nu există în baza de date (ex: o lege din 1995)?

**Soluția implementată:**
1. **Tabela `external_legislative_documents`:** Stochează documentele externe menționate
2. **Conexiuni externe:** Creează conexiuni cu `target_document_id = NULL` pentru referințe externe
3. **Tracking-ul mențiunilor:** Numără de câte ori este menționat fiecare document extern
4. **Statistici complete:** Oferă o imagine completă a rețelei, inclusiv referințele externe

**Exemplu de utilizare:**
```sql
-- Document extern: "Legea nr. 123/1995"
INSERT INTO public.external_legislative_documents (
    identifier, normalized_identifier, document_type, document_number, document_year
) VALUES (
    'Legea nr. 123/1995',
    '{"type": "lege", "number": "123", "year": "1995"}',
    'lege', '123', '1995'
);

-- Conexiune externă
INSERT INTO public.legislative_connections (
    source_document_id, target_document_id, relationship_type, 
    confidence_score, extraction_method, metadata
) VALUES (
    417, NULL, 'face referire la (extern)', 0.3, 'external_reference',
    '{"is_external": true, "external_identifier": "Legea nr. 123/1995"}'
);
```

#### **Gestionarea Erorilor de Extragere**
**Problema:** Ce se întâmplă când extragerea eșuează pentru o entitate?

**Soluția implementată:**
1. **Try-catch la nivel de entitate:** Fiecare entitate este procesată independent
2. **Conexiuni de eroare:** Creează conexiuni speciale pentru debugging
3. **Logging complet:** Salvează contextul erorii și mesajul de eroare
4. **Continuarea procesului:** Erorile nu opresc extragerea pentru alte entități

**Exemplu de conexiune de eroare:**
```sql
INSERT INTO public.legislative_connections (
    source_document_id, target_document_id, relationship_type,
    confidence_score, extraction_method, metadata
) VALUES (
    417, NULL, 'eroare_extragere', 0.0, 'error_handling',
    '{"error_message": "SQL error details", "error_context": "context", "error_timestamp": "now"}'
);
```

#### **Funcții de Mentenanță**

##### `cleanup_error_connections()`
Curăță conexiunile de eroare vechi (păstrează doar ultima săptămână).

##### `get_external_documents_stats()`
Obține statistici complete despre documentele externe:
- Total documente externe
- Distribuția pe tipuri
- Cele mai menționate documente externe
- Mențiuni recente

### 5. Trigger-uri Automate

#### `extract_legislative_connections_on_insert`
Rulează automat extragerea conexiunilor când se inserează o nouă știre.

#### `extract_legislative_connections_on_update`
Rulează automat extragerea conexiunilor când se modifică entitățile unei știri.

## 🔌 API GraphQL

### Tipuri Noi

#### `LegislativeNode`
```graphql
type LegislativeNode {
  id: ID!
  title: String!
  publicationDate: String!
  type: String!
}
```

#### `LegislativeLink`
```graphql
type LegislativeLink {
  source: ID!
  target: ID!
  type: String!
  confidence: Float!
}
```

#### `LegislativeGraph`
```graphql
type LegislativeGraph {
  nodes: [LegislativeNode!]!
  links: [LegislativeLink!]!
}
```

#### `LegislativeConnectionStats`
```graphql
type LegislativeConnectionStats {
  totalConnections: Int!
  connectionsByType: JSON!
  topSourceDocuments: JSON!
  topTargetDocuments: JSON!
  averageConfidence: Float!
}
```

### Query-uri Noi

#### `getLegislativeGraph`
```graphql
query GetLegislativeGraph($documentId: ID!, $depth: Int) {
  getLegislativeGraph(documentId: $documentId, depth: $depth) {
    nodes {
      id
      title
      publicationDate
      type
    }
    links {
      source
      target
      type
      confidence
    }
  }
}
```

**Parametri:**
- `documentId`: ID-ul documentului pentru care să se construiască graficul
- `depth`: Adâncimea de explorare (1-3, implicit 1) - **Limitare strictă de securitate**

#### `getLegislativeConnectionStats`
```graphql
query GetLegislativeConnectionStats {
  getLegislativeConnectionStats {
    totalConnections
    connectionsByType
    topSourceDocuments
    topTargetDocuments
    averageConfidence
  }
}
```

## 🚀 Utilizarea Funcționalității

### 1. Extragerea Automată
Conexiunile legislative sunt extrase automat când:
- Se inserează o nouă știre cu entități extrase
- Se modifică entitățile unei știri existente

### 2. Procesarea în Lot
Pentru știrile existente, poți rula:
```sql
SELECT process_existing_stiri_for_connections();
```

### 3. Curățarea Conexiunilor Orfane
```sql
SELECT cleanup_orphaned_connections();
```

### 4. Analiza Directă
```sql
-- Obține graficul pentru un document
SELECT * FROM get_legislative_graph(123, 2);

-- Obține statisticile
SELECT * FROM get_legislative_connections_stats();
```

## 📊 Exemple de Utilizare

### Exemplu 1: Graficul de Conexiuni
```javascript
const graph = await legislativeConnectionsService.getLegislativeGraph(123, 2);
console.log(`Grafic cu ${graph.nodes.length} noduri și ${graph.links.length} conexiuni`);
```

### Exemplu 2: Statistici
```javascript
const stats = await legislativeConnectionsService.getLegislativeConnectionStats();
console.log(`Total conexiuni: ${stats.totalConnections}`);
console.log(`Scor mediu de încredere: ${stats.averageConfidence}`);
```

### Exemplu 3: Procesarea în Lot
```javascript
const processedCount = await legislativeConnectionsService.processExistingStiriForConnections();
console.log(`Procesat ${processedCount} știri pentru conexiuni legislative`);
```

## 🔒 Securitate și Limitări

### Limitarea Adâncimii Graficului
**IMPORTANT**: Parametrul `depth` este limitat strict la **MAXIM 3** pentru a preveni atacuri de tip Denial of Service (DoS).

### Sistemul Robust de Rezolvare a Identificatorilor
**IMPORTANT**: Noul sistem elimină vulnerabilitățile de potrivire greșită și oferă o identificare precisă a actelor normative.

**Motivul limitării:**
- Un `depth` prea mare poate declanșa interogări extrem de complexe
- Poate duce la consumul excesiv de resurse (CPU, memorie, timp de răspuns)
- Poate bloca serviciul pentru alți utilizatori
- Această limitare este aplicată la toate nivelurile: API, serviciu și baza de date

**Implementarea securității:**
```sql
-- În funcția get_legislative_graph
IF p_depth > v_max_depth THEN
    RAISE EXCEPTION 'Adâncimea maximă permisă este %', v_max_depth;
END IF;
```

```javascript
// În serviciul LegislativeConnectionsService
const MAX_DEPTH = 3;
if (depth < 1 || depth > MAX_DEPTH) {
    throw new GraphQLError(`Adâncimea trebuie să fie între 1 și ${MAX_DEPTH}`);
}
```

## 🔧 Configurare și Mentenanță

### 1. Migrații
Rularea migrațiilor necesare:
```bash
# Migrația 024: Tabela și funcțiile de bază
psql -f database/migrations/024_legislative_connections.sql

# Migrația 025: Trigger-uri și funcții suplimentare
psql -f database/migrations/025_legislative_connections_trigger.sql
```

### 2. Verificări de Securitate
```sql
-- Verifică că RLS este activat
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'legislative_connections';

-- Verifică trigger-urile
SELECT tgname, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname LIKE '%legislative_connections%';
```

### 3. Monitorizarea Performanței
```sql
-- Verifică dimensiunea tabelului
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename = 'legislative_connections';

-- Verifică utilizarea indexurilor
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'legislative_connections';
```

## 🧪 Testare

### 1. Teste Unitare
```bash
npm test -- --testNamePattern="LegislativeConnections"
```

### 2. Teste de Integrare
```bash
# Testează extragerea automată
npm run test:integration:legislative
```

### 3. Teste de Performanță
```bash
# Testează performanța funcțiilor de rețea
npm run test:performance:network
```

## 📈 Metrici și Analytics

### 1. Metrici de Performanță
- Timpul de extragere a conexiunilor
- Numărul de conexiuni extrase per știre
- Precizia extragerii (scorul de încredere)

### 2. Metrici de Utilizare
- Numărul de query-uri `getLegislativeGraph`
- Adâncimea medie de explorare
- Documentele cele mai analizate

### 3. Metrici de Calitate
- Distribuția scorurilor de încredere
- Tipurile de relații identificate
- Raportul între conexiuni validate și false positive-uri

## 🔮 Dezvoltări Viitoare

### 1. Îmbunătățiri AI
- Extragerea mai precisă a tipurilor de relații
- Identificarea conexiunilor implicite
- Predicția impactului modificărilor

### 2. Vizualizări Avansate
- Grafice interactive 3D
- Timeline-uri de modificări
- Heatmap-uri de impact

### 3. Integrări
- Export în format Gephi
- Integrare cu sisteme de workflow
- API-uri pentru aplicații externe

## 🚨 Troubleshooting

### Probleme Comune

#### 1. Conexiunile nu sunt extrase
**Cauze posibile:**
- Entitățile nu sunt extrase din știri
- Trigger-urile nu sunt activate
- Funcțiile nu au permisiuni

**Soluții:**
```sql
-- Verifică trigger-urile
SELECT * FROM pg_trigger WHERE tgname LIKE '%legislative%';

-- Verifică permisiunile
SELECT has_function_privilege('public', 'extract_legislative_connections', 'EXECUTE');
```

#### 2. Performanță slabă
**Cauze posibile:**
- Indexurile lipsesc
- Statisticile nu sunt actualizate
- Conexiuni orfane

**Soluții:**
```sql
-- Actualizează statisticile
ANALYZE legislative_connections;

-- Curăță conexiunile orfane
SELECT cleanup_orphaned_connections();

-- Verifică indexurile
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'legislative_connections';
```

#### 3. Erori de validare
**Cauze posibile:**
- Constraint-uri violate
- Tipuri de relații invalide
- Scoruri de încredere în afara intervalului

**Soluții:**
```sql
-- Verifică constraint-urile
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'legislative_connections'::regclass;

-- Verifică datele invalide
SELECT * FROM legislative_connections 
WHERE confidence_score < 0.0 OR confidence_score > 1.0;
```

## 📚 Resurse Suplimentare

### 1. Documentație Supabase
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Triggers](https://supabase.com/docs/guides/database/triggers)

### 2. Articole Tehnice
- [Graph Analysis in PostgreSQL](https://www.postgresql.org/docs/current/static/functions-json.html)
- [Network Analysis Algorithms](https://neo4j.com/docs/graph-algorithms/current/)
- [Legislative Network Analysis](https://en.wikipedia.org/wiki/Network_analysis)

### 3. Exemple de Cod
- [Exemplul complet](examples/legislative-network-analysis-example.js)
- [Teste unitare](api/src/test/)
- [Schema GraphQL](api/src/api/schema.js)

---

**Notă**: Această funcționalitate reprezintă o inovație majoră în domeniul analizei legislative și oferă o perspectivă unică asupra ecosistemului legislativ românesc. Pentru suport tehnic sau întrebări, consultă documentația sau contactează echipa de dezvoltare.
