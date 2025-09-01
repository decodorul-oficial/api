/**
 * Exemplu de utilizare a funcționalității de Related Stories
 * Demonstrează cum să folosești endpoint-ul GraphQL pentru a obține știri relevante
 */

// Exemplu de query GraphQL pentru obținerea știrilor relevante
const relatedStoriesQuery = `
  query GetRelatedStories($storyId: ID!, $limit: Int, $minScore: Float) {
    getRelatedStories(storyId: $storyId, limit: $limit, minScore: $minScore) {
      relatedStories {
        id
        title
        publicationDate
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
`;

// Exemplu de variabile pentru query
const variables = {
  storyId: "715", // ID-ul știrii pentru rovinieta
  limit: 5,
  minScore: 1.0
};

// Exemplu de răspuns așteptat
const expectedResponse = {
  "data": {
    "getRelatedStories": {
      "relatedStories": [
        {
          "id": "600",
          "title": "Guvernul prorogă termene pentru tarifele rutiere | OG nr. 14/2025",
          "publicationDate": "2025-08-22",
          "category": "transporturi",
          "relevanceScore": 18,
          "relevanceReasons": {
            "common_legal_acts": ["134/2025"],
            "common_organizations": ["Guvernul României"],
            "common_topics": null,
            "common_keywords": ["tarife rutiere"],
            "same_category": true
          }
        },
        {
          "id": "465",
          "title": "Ciprian-Constantin Șerban avizat favorabil pentru ministru al Transporturilor",
          "publicationDate": "2025-08-19", 
          "category": "transporturi",
          "relevanceScore": 12,
          "relevanceReasons": {
            "common_legal_acts": null,
            "common_organizations": ["Ministerului Afacerilor Interne", "Serviciului Român de Informații"],
            "common_topics": null,
            "common_keywords": null,
            "same_category": true
          }
        }
      ]
    }
  }
};

// Explicarea sistemului de scoring
console.log(`
=== SISTEMUL DE SCORING PENTRU ȘTIRI RELEVANTE ===

Funcționalitatea calculează un scor de relevanță bazat pe următoarele criterii:

1. **ACTE NORMATIVE COMUNE (+10 puncte fiecare)**
   - Detectează referințe comune la legi, OG, HG (ex: "OG nr. 15/2002", "134/2025")
   - Cea mai puternică legătură între știri
   - Exemplu: Două știri care modifică același act normativ

2. **ORGANIZAȚII IMPORTANTE COMUNE (+5 puncte fiecare)**
   - Instituții guvernamentale, ministere, autorități
   - Exemplu: "Ministerul Transporturilor", "Guvernul României"

3. **TOPICURI COMUNE (+3 puncte fiecare)**
   - Categorii tematice detectate prin AI
   - Exemplu: Două știri cu același topic de "transporturi"

4. **KEYWORDS COMUNE (+1 punct fiecare)**
   - Cuvinte cheie specifice din content.keywords
   - Exemplu: "tarife rutiere", "rovinieta"

5. **ACEEAȘI CATEGORIE (+2 puncte bonus)**
   - Bonus pentru știri din aceeași categorie generală

=== EXEMPLE DE UTILIZARE ===

1. **Pentru știrea despre rovinieta (ID: 715):**
   - Găsește alte știri despre tarife rutiere
   - Detectează legătura prin OG nr. 15/2002
   - Identifică organizații comune (Guvernul României)

2. **Pentru știri MS/CNAS:**
   - Conectează știri din domeniul sănătății
   - Organizații comune: Ministerul Sănătății, CNAS

3. **Pentru știri educaționale:**
   - Topicuri comune: educație, învățământ
   - Keywords: "examen", "calendar școlar", "Ministerul Educației"

=== INTEGRARE FRONTEND ===

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

// Componenta React pentru afișarea știrilor relevante
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
          <div className="relevance-score">
            Scor: {story.relevanceScore}
          </div>
          <div className="relevance-reasons">
            {story.relevanceReasons.common_legal_acts && (
              <span>Acte comune: {story.relevanceReasons.common_legal_acts.join(', ')}</span>
            )}
            {story.relevanceReasons.same_category && (
              <span>Aceeași categorie</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
`);

export {
  relatedStoriesQuery,
  variables,
  expectedResponse
};
