# Îmbunătățiri pentru Graficul Legislative

## Problema Identificată

API-ul `getLegislativeGraph` returna date tehnice și abstracte, greu de înțeles pentru utilizatori:
- Tipuri de relații tehnice: "face referire la", "modifică" (fără context)
- Confidence score abstract: 0.95 (fără semnificație clară)
- Titluri lungi și complexe (greu de scannat)
- Lipsă de explicații în limbaj natural

## Soluția Implementată

### 1. Informații Îmbunătățite pentru Noduri

Fiecare nod include acum:
- `shortTitle`: Titlu scurt și ușor de citit (ex: "Ordin 890/2025 | Instrucțiuni tehnice")
- `actNumber`: Numărul actului extras (ex: "890/2025")
- `actType`: Tipul actului (ex: "Ordin", "Lege", "Hotărâre")
- `title`: Titlul complet (pentru detalii)
- `publicationDate`: Data publicării

**Exemplu:**
```json
{
  "id": "1671",
  "title": "Noi instrucțiuni tehnice pentru programele de exploatare minieră...",
  "shortTitle": "Ordin 890/2025 | Instrucțiuni tehnice",
  "actNumber": "890/2025",
  "actType": "Ordin",
  "publicationDate": "2025-11-05",
  "type": "legislation"
}
```

### 2. Informații Îmbunătățite pentru Conexiuni

Fiecare conexiune include acum:
- `typeLabel`: Etichetă clară pentru tipul relației (ex: "Modifică" în loc de "modifică")
- `confidenceLabel`: Text în loc de număr (ex: "Foarte probabil" în loc de 0.95)
- `confidenceLevel`: Nivel pentru styling ("high", "medium", "low")
- `description`: Descriere în limbaj natural (ex: "Acest act modifică prevederile actul 206/2025")

**Exemplu:**
```json
{
  "source": "171",
  "target": "976",
  "type": "face referire la",
  "typeLabel": "Face referire la",
  "confidence": 0.95,
  "confidenceLabel": "Foarte probabil",
  "confidenceLevel": "high",
  "description": "Acest act face referire la actul 206/2025"
}
```

### 3. Maparea Confidence Score

- **≥ 0.9**: "Foarte probabil" (high) - conexiune foarte sigură
- **≥ 0.7**: "Probabil" (medium) - conexiune probabilă
- **< 0.7**: "Posibil" (low) - conexiune posibilă

### 4. Tipuri de Relații Clarificate

- `modifică` → "Modifică" (cu descriere: "modifică prevederile")
- `completează` → "Completează" (cu descriere: "completează prevederile")
- `abrogă` → "Abrogă" (cu descriere: "abrogă")
- `face referire la` → "Face referire la" (cu descriere: "face referire la")
- `derogă` → "Derogă" (cu descriere: "derogă temporar de la")
- `suspendă` → "Suspendă" (cu descriere: "suspendă temporar")

## Query GraphQL Actualizat

```graphql
query GetLegislativeGraph($documentId: ID!, $depth: Int) {
  getLegislativeGraph(documentId: $documentId, depth: $depth) {
    nodes {
      id
      title
      shortTitle
      actNumber
      actType
      publicationDate
      type
    }
    links {
      source
      target
      type
      typeLabel
      confidence
      confidenceLabel
      confidenceLevel
      description
    }
  }
}
```

## Recomandări pentru Frontend

### 1. Afișare Titluri
- Folosește `shortTitle` pentru afișare în grafic (mai compact)
- Folosește `title` pentru tooltip sau pagina detalii
- Afișează `actType` și `actNumber` ca badge-uri

### 2. Indicatori de Încredere
- Folosește `confidenceLevel` pentru culori:
  - `high`: Verde
  - `medium`: Galben/Portocaliu
  - `low`: Roșu/Gri
- Afișează `confidenceLabel` în tooltip sau legendă

### 3. Descrieri de Conexiuni
- Folosește `description` pentru tooltip-uri pe edge-uri
- Afișează `typeLabel` în loc de `type` în UI
- Poți folosi `description` pentru text contextual în graf

### 4. Exemple de Afișare

**În grafic:**
- Nod: "Ordin 890/2025" (folosind `shortTitle`)
- Edge: "Modifică" (folosind `typeLabel`) cu culoare bazată pe `confidenceLevel`
- Tooltip pe edge: "Acest act modifică prevederile actul 206/2025" (folosind `description`)

**În listă (alternativă la grafic):**
```
Acte legate:
✓ Modifică: Ordin 206/2025 (Foarte probabil)
  → "Acest act modifică prevederile actul 206/2025"
```

## Beneficii

1. **Limbaj natural**: Utilizatorii înțeleg imediat ce înseamnă fiecare conexiune
2. **Informații relevante**: Titluri scurte și clare, ușor de scannat
3. **Context clar**: Descrieri care explică relația într-un mod uman
4. **Indicatori vizuali**: Confidence level pentru feedback vizual rapid
5. **Compatibilitate**: Păstrăm câmpurile vechi pentru backwards compatibility

## Backwards Compatibility

Toate câmpurile vechi sunt păstrate (`title`, `type`, `confidence`), iar noile câmpuri sunt opționale în schema GraphQL pentru a nu afecta implementările existente.

