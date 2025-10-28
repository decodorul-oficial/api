## Model conexiuni între documente (document graph)

Acest document descrie implementarea unui view și a unor funcții SQL care simplifică interogările pentru conexiuni între documente legislative pornind de la știri (`public.stiri`).

### Context

- Conexiunile sunt stocate în `public.legislative_connections` (sursă: `stiri.id`, țintă: `stiri.id` sau referință externă în `metadata`).
- Există funcții de normalizare/rezolvare a identificatorilor legislative (`normalize_legislative_identifier`, `resolve_legislative_identifier`) introduse în migrațiile 029+.

### Ce am adăugat (Migrația 065)

1) Funcții utilitare de format:

- `public.short_document_code(type text)` → cod scurt pentru tip document (ex. `HG`, `OUG`, `Legea`).
- `public.format_document_key(type text, number text, year text)` → construiește o cheie afișabilă `TIP-NR-AN` (ex. `HG-645-2025`).

2) View: `public.conexiuni_documente`

- Columne expuse: `id_stire_sursa`, `cheie_document_sursa`, `id_stire_tinta`, `cheie_document_tinta`, `tip_relatie`, `confidence_score`, `extraction_method`, `id_conexiune`.
- Cheile (sursă/țintă) se formează astfel:
  - Pentru documente interne: normalizează din `stiri.title` și formatează `TIP-NR-AN`.
  - Pentru referințe externe (fără `target_document_id`): încearcă `metadata.normalized_identifier`, altfel `metadata.external_identifier`.

### Exemple de interogări

1) Ce documente modifică știrea 98?

```sql
SELECT cheie_document_tinta, tip_relatie
FROM public.conexiuni_documente
WHERE id_stire_sursa = 98
  AND tip_relatie = 'modifică';
```

2) Toate referințele (inclusiv externe) pentru știrea 98:

```sql
SELECT cheie_document_tinta, tip_relatie, extraction_method, confidence_score
FROM public.conexiuni_documente
WHERE id_stire_sursa = 98
ORDER BY tip_relatie, cheie_document_tinta;
```

3) Lanț cronologic de modificări (conceptual):

Folosește `get_legislative_graph(p_document_id, p_depth)` existent pentru traversare (plecând de la `id_stire_sursa`). În UI poți ordona nodurile după `publication_date` luate din `stiri`.

### Note de implementare

- View-ul este read-only și compatibil cu schema actuală. Nu schimbă tabela de bază.
- Se bazează pe `normalize_legislative_identifier` pentru a extrage `type/number/year` din `title`. În cazuri fără potrivire, cade pe `title` brut.
- Pentru referințe externe, se folosește `metadata.normalized_identifier` dacă e disponibil.

### Extensii posibile

- Tabel dedicat pentru „acte legislative” și legătură `news_documents_map` (model canonic) dacă vrei separarea clară între „știre” și „act”.
- Funcții RPC dedicate pentru istoricul de modificări, care să aplice CTE recursive pe relația `modifică`.

### Endpoint GraphQL pentru conexiuni documente

Query: `getDocumentConnectionsByNews`

Schema rezumat:

```
getDocumentConnectionsByNews(
  newsId: ID!
  relationType: String
  limit: Int
  offset: Int
): [DocumentConnectionView!]!

type DocumentConnectionView {
  idConexiune: ID!
  idStireSursa: ID!
  cheieDocumentSursa: String
  idStireTinta: ID
  cheieDocumentTinta: String
  tipRelatie: String!
  confidenceScore: Float
  extractionMethod: String
}
```

Acces: utilizator autentificat cu abonament activ sau în trial.

Exemplu request JSON (POST /graphql):

```json
{
  "query": "query GetDocConns($newsId: ID!, $relationType: String, $limit: Int, $offset: Int) { getDocumentConnectionsByNews(newsId: $newsId, relationType: $relationType, limit: $limit, offset: $offset) { idConexiune idStireSursa cheieDocumentSursa idStireTinta cheieDocumentTinta tipRelatie confidenceScore extractionMethod } }",
  "variables": {
    "newsId": "98",
    "relationType": "modifică",
    "limit": 20,
    "offset": 0
  }
}
```

Răspuns (exemplu):

```json
{
  "data": {
    "getDocumentConnectionsByNews": [
      {
        "idConexiune": "4721",
        "idStireSursa": "98",
        "cheieDocumentSursa": "HG-645-2025",
        "idStireTinta": "912",
        "cheieDocumentTinta": "HG-412-2025",
        "tipRelatie": "modifică",
        "confidenceScore": 0.9,
        "extractionMethod": "ai_enhanced"
      }
    ]
  }
}
```

Note: dacă ținta este externă, `idStireTinta` poate fi null, iar `cheieDocumentTinta` va proveni din `metadata.normalized_identifier` sau `metadata.external_identifier`.



