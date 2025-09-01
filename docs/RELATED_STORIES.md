# Related Stories - Sistem de Recomandare de Știri

## Descriere

Sistemul de **Related Stories** implementează o funcționalitate avansată de recomandare de știri bazată pe o strategie de scoring multi-criteriu. Acesta analizează conținutul știrilor și identifică legături prin acte normative comune, organizații, topicuri și cuvinte cheie.

## Strategia de Scoring

Sistemul calculează un **scor de relevanță** pentru fiecare știre bazat pe următoarele criterii:

### 1. Acte Normative Comune (+10 puncte fiecare)
- **Cea mai puternică legătură** între știri
- Detectează referințe la același act normativ (OG, HG, Legi)
- **Exemplu**: Două știri care menționează "OG nr. 15/2002" sau "134/2025"
- **Pattern-uri detectate**: `^\d+/\d+$`, `^OG`, `^HG`, `^Legea`

### 2. Organizații Importante Comune (+5 puncte fiecare)
- Instituții guvernamentale, ministere, autorități
- **Exemplu**: "Ministerul Transporturilor", "Guvernul României", "CNAS"
- Filtrul: organizații cu > 10 caractere pentru relevanță

### 3. Topicuri Comune (+3 puncte fiecare)
- Categorii tematice detectate prin AI
- Compararea label-urilor din coloana `topics`
- **Exemplu**: Ambele știri au topicul "transporturi" sau "educație"

### 4. Keywords Comune (+1 punct fiecare)
- Cuvinte cheie specifice din `content.keywords`
- **Exemplu**: "tarife rutiere", "medicamente", "examen definitivare"

### 5. Aceeași Categorie (+2 puncte bonus)
- Bonus pentru știri din aceeași categorie generală
- **Exemplu**: Ambele știri sunt din categoria "transporturi"

## Implementare Tehnică

### Funcția SQL
```sql
SELECT * FROM get_related_stories(story_id, limit, min_score);
```

**Parametri:**
- `story_id` (BIGINT): ID-ul știrii pentru care căutăm știri relevante
- `limit` (INTEGER): Numărul maxim de rezultate (default: 5, max: 20)
- `min_score` (NUMERIC): Scorul minim de relevanță (default: 1.0)

### Endpoint GraphQL
```graphql
query GetRelatedStories($storyId: ID!, $limit: Int, $minScore: Float) {
  getRelatedStories(storyId: $storyId, limit: $limit, minScore: $minScore) {
    relatedStories {
      id
      title
      publicationDate
      content          # Fără content.body - doar metadata (summary, category, keywords, etc.)
      createdAt
      filename
      viewCount
      category
      relevanceScore
      relevanceReasons {
        common_legal_acts
        common_organizations
        common_topics
        common_keywords
        same_category
      }
    }
  }
}
```

## Exemple de Utilizare

### 1. Știri despre Transporturi (Rovinieta)
```javascript
// Pentru știrea ID: 715 (rovinieta)
const relatedStories = await getRelatedStories(715, 5, 1.0);
// Returnează știri legate de:
// - OG nr. 15/2002 (act normativ comun)
// - Ministerul Transporturilor (organizație comună)
// - "tarife rutiere" (keywords comune)
```

### 2. Știri despre Sănătate (Medicamente)
```javascript
// Pentru știrea ID: 708 (prețuri medicamente)
const relatedStories = await getRelatedStories(708, 5, 1.0);
// Returnează știri legate de:
// - Ministerul Sănătății (organizație comună)
// - "prețuri maximale" (keywords comune)
// - Categoria "sănătate" (categorie comună)
```

### 3. Știri despre Educație (Definitivare)
```javascript
// Pentru știrea ID: 709 (examen definitivare)
const relatedStories = await getRelatedStories(709, 5, 1.0);
// Returnează știri legate de:
// - Ministerul Educației (organizație comună)
// - "învățământ preuniversitar" (keywords comune)
// - Categoria "educație" (categorie comună)
```

## Rezultate Tipice

### Scor Ridicat (15+ puncte)
- Acte normative comune + organizații comune + aceeași categorie
- **Exemplu**: Două OG-uri care modifică același act normativ anterior

### Scor Mediu (5-15 puncte)
- Organizații comune + keywords comune + aceeași categorie
- **Exemplu**: Două ordine ministeriale din același domeniu

### Scor Scăzut (1-5 puncte)
- Doar keywords comune sau doar aceeași categorie
- **Exemplu**: Știri din același domeniu dar fără legături directe

## Beneficii

1. **Navigare Îmbunătățită**: Utilizatorii pot descoperi ușor știri conexe cu conținut complet
2. **Context Legal**: Identifică modificări și legături între acte normative
3. **Monitorizare Domenii**: Urmărirea completă a unui domeniu de reglementare
4. **Experiență Utilizator**: Reducerea timpului de căutare manuală
5. **Performanță Optimizată**: Un singur request returnează toate informațiile necesare
6. **Preview Conținut**: Afișarea directă a rezumatului și metadatelor fără requesturi suplimentare
7. **Date Optimizate**: Returnează doar informațiile esențiale (fără content.body, topics, entities) pentru performanță îmbunătățită

## Integrare Frontend

```jsx
// React Hook pentru Related Stories
function useRelatedStories(storyId, options = {}) {
  const { limit = 5, minScore = 1.0 } = options;
  
  const { data, loading, error } = useQuery(relatedStoriesQuery, {
    variables: { storyId, limit, minScore },
    skip: !storyId
  });
  
  return {
    relatedStories: data?.getRelatedStories?.relatedStories || [],
    loading,
    error
  };
}

// Componentă pentru afișarea știrilor relevante
function RelatedStories({ storyId }) {
  const { relatedStories, loading, error } = useRelatedStories(storyId);
  
  if (loading) return <div>Se încarcă știrile relevante...</div>;
  if (error) return <div>Eroare la încărcarea știrilor relevante</div>;
  if (relatedStories.length === 0) return null;
  
  return (
    <div className="related-stories">
      <h3>Știri Relevante</h3>
      {relatedStories.map(story => (
        <div key={story.id} className="related-story">
          <h4>{story.title}</h4>
          <div className="story-meta">
            <span className="publication-date">{story.publicationDate}</span>
            <span className="category">{story.category}</span>
            <span className="views">{story.viewCount} vizualizări</span>
          </div>
          
          {/* Afișează un preview din conținut - fără body, doar summary/metadata */}
          <div className="story-preview">
            <p>{story.content?.summary || 'Nu există rezumat disponibil'}</p>
            {story.content?.keywords && (
              <div className="keywords">
                Keywords: {story.content.keywords.join(', ')}
              </div>
            )}
          </div>
          
          <div className="relevance-info">
            <div className="relevance-score">
              Scor relevanță: {story.relevanceScore}
            </div>
            <div className="relevance-reasons">
              {story.relevanceReasons.common_legal_acts && story.relevanceReasons.common_legal_acts.length > 0 && (
                <span className="reason">📋 Acte comune: {story.relevanceReasons.common_legal_acts.join(', ')}</span>
              )}
              {story.relevanceReasons.common_organizations && story.relevanceReasons.common_organizations.length > 0 && (
                <span className="reason">🏛️ Organizații comune: {story.relevanceReasons.common_organizations.join(', ')}</span>
              )}
              {story.relevanceReasons.common_keywords && story.relevanceReasons.common_keywords.length > 0 && (
                <span className="reason">🔑 Keywords comune: {story.relevanceReasons.common_keywords.join(', ')}</span>
              )}
              {story.relevanceReasons.same_category && (
                <span className="reason">📂 Aceeași categorie</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Performance și Optimizări

- **Indexuri**: Utilizează indexurile existente pe `entities`, `topics`, și `content`
- **Limitări**: Maximum 20 de rezultate per request pentru performance
- **Caching**: Rezultatele pot fi cache-uite la nivel de aplicație
- **Scoring Eficient**: Folosește operații JSON native PostgreSQL optimizate

## Evoluții Viitoare

1. **Machine Learning**: Îmbunătățirea scoringului cu ML pe baza feedback-ului utilizatorilor
2. **Temporal Scoring**: Prioritizarea știrilor mai recente
3. **User Preferences**: Personalizarea pe baza preferințelor utilizatorului
4. **A/B Testing**: Testarea diferitelor strategii de scoring
