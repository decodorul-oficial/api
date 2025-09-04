# Implementarea Sistemului de Preferințe Utilizator

## 📋 Prezentare Generală

Acest document descrie implementarea completă a sistemului de preferințe utilizator pentru Feature 1: Identitate Utilizator & Nucleu de Personalizare.

## 🗄️ Baza de Date

### Tabela `user_preferences`
```sql
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_categories JSONB DEFAULT '[]' NOT NULL,
    notification_settings JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### Extinderea tabelei `profiles`
```sql
ALTER TABLE profiles ADD COLUMN display_name TEXT;
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
```

### Funcții de Bază de Date

#### `get_user_preferences(user_uuid UUID)`
Returnează preferințele unui utilizator specificat.

#### `update_user_preferences(user_uuid UUID, new_categories JSONB, new_notifications JSONB)`
Actualizează preferințele unui utilizator (upsert).

#### `get_personalized_stiri(user_uuid UUID, p_limit INT, p_offset INT, p_order_by TEXT, p_order_dir TEXT)`
Returnează știri personalizate pe baza preferințelor utilizatorului.

## 🔧 API GraphQL

### Tipuri Noi

```graphql
type UserPreferences {
  preferredCategories: [String!]!
  notificationSettings: JSON!
  createdAt: String!
  updatedAt: String!
}

type Profile {
  id: ID!
  subscriptionTier: String!
  displayName: String
  avatarUrl: String
  preferences: UserPreferences
  createdAt: String!
  updatedAt: String
}
```

### Input Types

```graphql
input UpdateUserPreferencesInput {
  preferredCategories: [String!]!
  notificationSettings: JSON
}

input UpdateProfileInput {
  subscriptionTier: String
  displayName: String
  avatarUrl: String
}
```

### Query-uri Noi

```graphql
type Query {
  getUserPreferences: UserPreferences!
  getPersonalizedFeed(
    limit: Int
    offset: Int
    orderBy: String
    orderDirection: String
  ): StiriResponse!
}
```

### Mutații Noi

```graphql
type Mutation {
  updateUserPreferences(input: UpdateUserPreferencesInput!): UserPreferences!
}
```

## 🏗️ Arhitectura Backend

### UserRepository.js
- `getUserPreferences(userId)` - Obține preferințele utilizatorului
- `updateUserPreferences(userId, preferences)` - Actualizează preferințele
- `getPersonalizedStiri(userId, options)` - Obține știrile personalizate

### UserService.js
- `getUserPreferences(userId)` - Logica de business pentru preferințe
- `updateUserPreferences(userId, preferences)` - Validare și actualizare
- `getPersonalizedStiri(userId, options)` - Feed personalizat
- `transformStireForGraphQL(stire)` - Transformare pentru GraphQL

### Resolvers GraphQL
- `getUserPreferences` - Resolver pentru query
- `getPersonalizedFeed` - Resolver pentru feed personalizat
- `updateUserPreferences` - Resolver pentru mutație
- `Profile.preferences` - Resolver pentru preferințe în profil

## 🔒 Securitate

### Row Level Security (RLS)
```sql
-- Utilizatorii pot citi doar propriile preferințe
CREATE POLICY "Users can read own preferences" ON user_preferences
    FOR SELECT TO authenticated USING (auth.uid() = id);

-- Utilizatorii pot actualiza doar propriile preferințe
CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR UPDATE TO authenticated 
    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

### Validare Input
- Categoriile preferate: array de string-uri, maxim 20 categorii
- Setările de notificare: obiect JSON valid
- Numele de afișare: 2-100 caractere
- URL avatar: URL valid, maxim 500 caractere

## 📊 Funcționalități

### 1. Gestionarea Preferințelor
- Utilizatorii pot selecta categorii de interes
- Preferințele sunt salvate în format JSONB
- Suport pentru setări de notificare personalizate

### 2. Feed Personalizat
- Știrile sunt filtrate pe baza categoriilor preferate
- Fallback la toate știrile dacă nu există preferințe
- Paginare și sortare completă
- Performanță optimizată cu indexuri GIN

### 3. Profil Extins
- Nume de afișare personalizat
- URL avatar
- Integrare cu preferințele utilizatorului

## 🚀 Utilizare

### Obținerea Preferințelor
```graphql
query {
  getUserPreferences {
    preferredCategories
    notificationSettings
    createdAt
    updatedAt
  }
}
```

### Actualizarea Preferințelor
```graphql
mutation {
  updateUserPreferences(input: {
    preferredCategories: ["Fiscalitate", "Justiție", "Sănătate"]
    notificationSettings: {
      email: true
      push: false
    }
  }) {
    preferredCategories
    notificationSettings
    updatedAt
  }
}
```

### Feed Personalizat
```graphql
query {
  getPersonalizedFeed(limit: 10, offset: 0) {
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
    }
  }
}
```

## 📈 Performanță

### Indexuri
- `idx_user_preferences_categories` - Index GIN pentru categorii
- `idx_user_preferences_notifications` - Index GIN pentru notificări
- `idx_profiles_display_name` - Index pentru nume de afișare

### Optimizări
- Funcții SQL optimizate pentru feed personalizat
- Paginare eficientă cu LIMIT/OFFSET
- Cache implicit prin indexuri GIN

## 🔄 Migrații

### Migrația 045_user_preferences.sql
- Creează tabela `user_preferences`
- Extinde tabela `profiles`
- Adaugă funcții de bază de date
- Configurează politici RLS
- Creează indexuri pentru performanță

## ✅ Testare

### Teste de Bază de Date
```sql
-- Test funcție get_personalized_stiri
SELECT get_personalized_stiri(
    '00000000-0000-0000-0000-000000000000'::uuid,
    5, 0, 'publication_date', 'desc'
);
```

### Teste GraphQL
- Testare query `getUserPreferences`
- Testare mutație `updateUserPreferences`
- Testare query `getPersonalizedFeed`
- Validare autentificare și autorizare

## 🎯 Următorii Pași

1. **Frontend Integration**
   - Ecran de onboarding cu selecție categorii
   - Pagină de profil pentru gestionarea preferințelor
   - Feed personalizat pe homepage

2. **OAuth Integration**
   - Configurare Google OAuth în Supabase Dashboard
   - Configurare LinkedIn OAuth în Supabase Dashboard
   - Testare flow-uri de autentificare socială

3. **Analytics și Monitoring**
   - Tracking utilizare preferințe
   - Metrici feed personalizat
   - Dashboard admin pentru preferințe utilizatori

## 📝 Note Tehnice

- Toate operațiunile respectă principiile de securitate RLS
- Validarea input-ului se face la nivel de GraphQL și service
- Funcțiile de bază de date sunt optimizate pentru performanță
- Arhitectura este extensibilă pentru funcționalități viitoare
- Codul respectă principiile SOLID și clean architecture

---

**Status**: ✅ Implementare Completă  
**Data**: 2025-01-27  
**Versiune**: 1.0.0
