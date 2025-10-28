# Sistem de Comentarii - Monitorul Oficial

## Prezentare Generală

Sistemul de comentarii permite utilizatorilor cu abonament activ (inclusiv Trial) să adauge comentarii la știri și sinteze zilnice, cu posibilitatea de editare a propriilor comentarii. Sistemul respectă principiile de securitate și arhitectură ale proiectului.

## Funcționalități Principale

### 1. Adăugare Comentarii
- **Permisiuni**: Doar utilizatorii cu abonament activ sau trial activ
- **Destinații**: Știri și sinteze zilnice
- **Limitări**: 1-2000 caractere per comentariu
- **Validare**: Verificare existență părinte și validare conținut

### 2. Editare Comentarii
- **Permisiuni**: Doar proprietarul comentariului
- **Istoric**: Păstrarea istoricului editărilor pentru audit
- **Marcare**: Comentariile editate sunt marcate ca `isEdited`
- **Timestamp**: Data și ora ultimei editări

### 3. Ștergere Comentarii
- **Permisiuni**: Doar proprietarul comentariului
- **Cascadă**: Ștergerea automată a istoricului editărilor
- **Audit**: Logarea operațiunilor pentru monitorizare

## Arhitectura Sistemului

### Baza de Date

#### Tabela `comments`
```sql
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) >= 1 AND length(content) <= 2000),
    parent_type TEXT NOT NULL CHECK (parent_type IN ('stire', 'synthesis')),
    parent_id TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

#### Tabela `comment_edits`
```sql
CREATE TABLE comment_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    previous_content TEXT NOT NULL,
    edited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### Servicii

#### `CommentService`
- Logica de business pentru comentarii
- Validare autorizare (abonament activ/trial)
- Gestionare editări și istoric
- Validare conținut și existență părinte

#### `CommentRepository`
- Operațiuni CRUD pentru comentarii
- Interogări complexe cu paginare
- Gestionare istoric editări
- Validare existență părinte

## API GraphQL

### Tipuri

```graphql
type Comment {
  id: ID!
  userId: ID!
  user: User!
  content: String!
  parentType: CommentParentType!
  parentId: ID!
  isEdited: Boolean!
  editedAt: String
  createdAt: String!
  updatedAt: String!
  editHistory: [CommentEdit!]!
}

type CommentEdit {
  id: ID!
  previousContent: String!
  editedAt: String!
}

enum CommentParentType {
  STIRE
  SYNTHESIS
}

type CommentsResponse {
  comments: [Comment!]!
  pagination: PaginationInfo!
}
```

### Query-uri

#### `getComments`
```graphql
getComments(
  parentType: CommentParentType!
  parentId: ID!
  limit: Int
  offset: Int
  orderBy: String
  orderDirection: String
): CommentsResponse!
```

**Exemplu de utilizare:**
```javascript
const query = `
  query GetComments($parentType: CommentParentType!, $parentId: ID!) {
    getComments(parentType: $parentType, parentId: $parentId) {
      comments {
        id
        content
        createdAt
        isEdited
        user {
          profile {
            displayName
          }
        }
        editHistory {
          previousContent
          editedAt
        }
      }
      pagination {
        totalCount
        hasNextPage
      }
    }
  }
`;

const variables = {
  parentType: "STIRE",
  parentId: "123"
};
```

#### `getCommentById`
```graphql
getCommentById(id: ID!): Comment
```

### Mutații

#### `createComment`
```graphql
createComment(input: CreateCommentInput!): Comment!
```

**Input:**
```graphql
input CreateCommentInput {
  content: String!
  parentType: CommentParentType!
  parentId: ID!
}
```

**Exemplu de utilizare:**
```javascript
const mutation = `
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      parentType
      parentId
      createdAt
      user {
        profile {
          displayName
        }
      }
    }
  }
`;

const variables = {
  input: {
    content: "Acesta este un comentariu la știre",
    parentType: "STIRE",
    parentId: "123"
  }
};
```

#### `updateComment`
```graphql
updateComment(id: ID!, input: UpdateCommentInput!): Comment!
```

**Input:**
```graphql
input UpdateCommentInput {
  content: String!
}
```

**Exemplu de utilizare:**
```javascript
const mutation = `
  mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
    updateComment(id: $id, input: $input) {
      id
      content
      isEdited
      editedAt
      editHistory {
        previousContent
        editedAt
      }
    }
  }
`;

const variables = {
  id: "comment-123",
  input: {
    content: "Comentariu actualizat"
  }
};
```

#### `deleteComment`
```graphql
deleteComment(id: ID!): Boolean!
```

**Exemplu de utilizare:**
```javascript
const mutation = `
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;

const variables = {
  id: "comment-123"
};
```

## Securitate

### Row Level Security (RLS)

#### Politici pentru `comments`
- **Citire**: Toți utilizatorii autentificați pot citi comentariile
- **Creare**: Doar utilizatorii cu abonament activ sau trial activ
- **Editare/Ștergere**: Doar proprietarul comentariului

#### Politici pentru `comment_edits`
- **Citire**: Doar proprietarul comentariului poate citi istoricul editărilor
- **Modificare**: Blocată pentru toți utilizatorii (doar sistemul poate adăuga)

### Validare

#### Conținut
- **Lungime**: 1-2000 caractere
- **Sanitizare**: Trim automat al whitespace-ului
- **Validare**: Verificare înainte de salvare

#### Tip Părinte
- **Valori permise**: `STIRE` sau `SYNTHESIS`
- **Validare**: Verificare existență în baza de date

#### Autorizare
- **Abonament**: Verificare status activ
- **Trial**: Verificare trial activ
- **Proprietate**: Verificare pentru editare/ștergere

## Limitări și Considerații

### Performanță
- **Paginare**: Comentariile sunt paginate pentru performanță optimă
- **Indecși**: Indecși optimizați pentru interogări frecvente
- **Cache**: Poate fi implementat cache pentru comentarii populare

### Stocare
- **Istoric**: Istoricul editărilor poate crește dimensiunea bazei de date
- **Cleanup**: Poate fi implementat cleanup pentru istoricul vechi
- **Arhivare**: Comentariile șterse pot fi arhivate în loc de ștergere definitivă

### Moderare
- **Manuală**: Nu există sistem de moderare automată
- **Raportare**: Poate fi implementat sistem de raportare
- **Filtrare**: Poate fi implementat filtru pentru conținut inadecvat

### Notificări
- **Real-time**: Nu există notificări real-time
- **Email**: Poate fi implementat sistem de notificări email
- **Push**: Poate fi implementat sistem de notificări push

## Exemple de Utilizare

### Adăugare Comentariu la Știre
```javascript
// 1. Obține comentariile existente
const getCommentsQuery = `
  query GetComments($parentType: CommentParentType!, $parentId: ID!) {
    getComments(parentType: $parentType, parentId: $parentId) {
      comments {
        id
        content
        createdAt
        user {
          profile {
            displayName
          }
        }
      }
      pagination {
        totalCount
      }
    }
  }
`;

// 2. Adaugă comentariu nou
const createCommentMutation = `
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      createdAt
      user {
        profile {
          displayName
        }
      }
    }
  }
`;

// 3. Actualizează comentariu
const updateCommentMutation = `
  mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
    updateComment(id: $id, input: $input) {
      id
      content
      isEdited
      editedAt
    }
  }
`;
```

### Gestionare Erori
```javascript
try {
  const result = await createComment({
    content: "Comentariu nou",
    parentType: "STIRE",
    parentId: "123"
  });
} catch (error) {
  if (error.extensions?.code === 'SUBSCRIPTION_REQUIRED') {
    console.log('Este necesar un abonament activ');
  } else if (error.extensions?.code === 'VALIDATION_ERROR') {
    console.log('Date invalide:', error.extensions.details);
  } else {
    console.log('Eroare:', error.message);
  }
}
```

## Monitorizare și Analytics

### Metrici Importante
- **Numărul de comentarii** per știre/sinteză
- **Utilizatorii cei mai activi** în comentarii
- **Comentariile editate** cel mai des
- **Timpul mediu de răspuns** pentru operațiuni

### Logging
- **Operațiuni CRUD**: Logarea tuturor operațiunilor
- **Erori**: Logarea erorilor pentru debugging
- **Audit**: Tracking pentru moderare și securitate

### Dashboard
- **Statistici comentarii**: Numărul total de comentarii
- **Utilizatori activi**: Top utilizatori care comentează
- **Conținut popular**: Știri/sinteze cu cele mai multe comentarii

## Dezvoltare Viitoare

### Funcționalități Planificate
1. **Sistem de moderare** automată
2. **Notificări real-time** pentru comentarii noi
3. **Sistem de raportare** pentru comentarii inadecvate
4. **Filtrare avansată** a comentariilor
5. **Export comentarii** pentru analiză

### Optimizări
1. **Cache Redis** pentru comentarii frecvent accesate
2. **Paginare cursor-based** pentru performanță mai bună
3. **Indexare full-text** pentru căutare în comentarii
4. **CDN** pentru conținut static

## Concluzie

Sistemul de comentarii oferă o funcționalitate completă și sigură pentru utilizatorii cu abonament activ, respectând principiile de arhitectură și securitate ale proiectului. Implementarea este extensibilă și poate fi îmbunătățită cu funcționalități suplimentare în viitor.
