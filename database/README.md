# Configurarea Bazei de Date în Supabase

## Descriere

Acest director conține schema-ul SQL complet pentru configurarea bazei de date în Supabase pentru API-ul GraphQL Monitorul Oficial, respectând principiile de arhitectură modulară și securitate.

## Fișiere

### Schema și Migrații
- `schema.sql` - Schema-ul complet al bazei de date cu toate tabelele, indecșii, trigger-urile și politicile de securitate
- `migrations/001_initial_schema.sql` - Migrația pentru schema inițială (organizată în pași logici)
- `migrations/002_seed_data.sql` - Migrația pentru popularea cu date de test

### Date și Testare
- `seed.sql` - Date de test pentru popularea bazei de date cu știri de exemplu
- `verify_setup.sql` - Script de verificare pentru a testa că toate componentele au fost configurate corect

## Structura Bazei de Date

### Tabele Principale

#### 1. Tabela `stiri`
- **Scop**: Stochează știrile din Monitorul Oficial
- **Câmpuri**:
  - `id` (BIGSERIAL) - Identificator unic
  - `created_at` (TIMESTAMPTZ) - Timestamp-ul creării
  - `title` (TEXT) - Titlul știrii
  - `publication_date` (DATE) - Data publicării
  - `content` (JSONB) - Conținutul știrii în format JSON

#### 2. Tabela `profiles`
- **Scop**: Profilele utilizatorilor cu informații despre abonament
- **Câmpuri**:
  - `id` (UUID) - Referință către `auth.users.id`
  - `subscription_tier` (TEXT) - Tier-ul de abonament ('free', 'pro', 'enterprise')
  - `created_at` (TIMESTAMPTZ) - Timestamp-ul creării
  - `updated_at` (TIMESTAMPTZ) - Timestamp-ul ultimei actualizări

#### 3. Tabela `usage_logs`
- **Scop**: Logarea utilizării API-ului pentru rate limiting
- **Câmpuri**:
  - `id` (BIGSERIAL) - Identificator unic
  - `user_id` (UUID) - Referință către `auth.users.id`
  - `request_timestamp` (TIMESTAMPTZ) - Timestamp-ul cererii

### Funcții Utilitare

#### `get_user_request_count_24h(user_uuid UUID)`
- **Scop**: Returnează numărul de cereri ale unui utilizator în ultimele 24 de ore
- **Utilizare**: Pentru rate limiting

#### `get_user_subscription_tier(user_uuid UUID)`
- **Scop**: Returnează tier-ul de abonament al unui utilizator
- **Utilizare**: Pentru determinarea limitelor de rate limiting

### Trigger-uri

#### `on_auth_user_created`
- **Declanșator**: La crearea unui utilizator nou în `auth.users`
- **Acțiune**: Creează automat un profil cu `subscription_tier = 'free'`

#### `update_profiles_updated_at`
- **Declanșator**: La actualizarea unui profil
- **Acțiune**: Actualizează automat câmpul `updated_at`

## Politici de Securitate (RLS)

### Tabela `stiri`
- ✅ **SELECT**: Utilizatorii autentificați pot citi toate știrile
- ❌ **INSERT/UPDATE/DELETE**: Blocate pentru utilizatori

### Tabela `profiles`
- ✅ **SELECT**: Utilizatorii pot citi doar propriul profil
- ✅ **UPDATE**: Utilizatorii pot actualiza doar propriul profil
- ❌ **INSERT/DELETE**: Blocate pentru utilizatori

### Tabela `usage_logs`
- ❌ **Toate operațiunile**: Blocate pentru utilizatori
- 🔑 **Acces**: Doar prin cheia `service_role` (API-ul)

## Instrucțiuni de Aplicare

### 1. Crearea Proiectului Supabase

1. Accesează [supabase.com](https://supabase.com) și creează un cont
2. Creează un proiect nou
3. Notează-ți URL-ul proiectului și cheia `service_role` din Settings > API

### 2. Aplicarea Schema-ului

#### Opțiunea A: Prin Supabase Dashboard (Recomandată)

1. Accesează proiectul tău Supabase
2. Mergi la **SQL Editor**
3. Execută fișierele în următoarea ordine:
   ```sql
   -- 1. Schema inițială
   -- Copiază și execută conținutul din database/schema.sql
   
   -- 2. Date de test (opțional pentru dezvoltare)
   -- Copiază și execută conținutul din database/seed.sql
   ```

#### Opțiunea B: Prin Migrații (Pentru Dezvoltare)

1. Execută migrațiile în ordine:
   ```sql
   -- 1. Schema inițială
   -- Execută database/migrations/001_initial_schema.sql
   
   -- 2. Date de test
   -- Execută database/migrations/002_seed_data.sql
   ```

#### Opțiunea C: Prin Supabase CLI

```bash
# Instalează Supabase CLI
npm install -g supabase

# Conectează-te la proiect
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Aplică schema-ul
supabase db push
```

### 3. Verificarea Configurării

După aplicarea schema-ului, execută scriptul de verificare:

```sql
-- Execută conținutul din database/verify_setup.sql
```

Acest script va verifica:
- ✅ Crearea tabelelor
- ✅ Activarea RLS
- ✅ Configurarea politicilor de securitate
- ✅ Crearea trigger-urilor
- ✅ Funcționarea funcțiilor utilitare
- ✅ Inserarea datelor de test

### 4. Testarea Configurării

```sql
-- Testează crearea unui utilizator nou
-- (acest lucru va declanșa automat crearea profilului)

-- Testează funcțiile utilitare
SELECT get_user_subscription_tier('user-uuid-here');
SELECT get_user_request_count_24h('user-uuid-here');

-- Verifică datele de test
SELECT 
    id,
    title,
    publication_date,
    content->>'summary' as summary,
    content->>'category' as category
FROM stiri 
ORDER BY publication_date DESC;
```

## Indecși pentru Performanță

- `idx_stiri_publication_date` - Pentru sortarea știrilor după dată
- `idx_stiri_created_at` - Pentru sortarea știrilor după creare
- `idx_usage_logs_user_timestamp` - Pentru rate limiting eficient
- `idx_profiles_subscription_tier` - Pentru filtrarea după tier

## Structura JSONB pentru Conținutul Știrilor

```json
{
    "summary": "Rezumatul știrii",
    "body": "Corpul principal al știrii",
    "keywords": ["cuvânt", "cheie", "1", "cuvânt", "cheie", "2"],
    "author": "Autorul știrii",
    "category": "Categoria știrii"
}
```

## Variabile de Mediu Necesare

După aplicarea schema-ului, vei avea nevoie de următoarele variabile de mediu:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Principii de Arhitectură Aplicate

### 1. Modularitate și Decuplare
- Schema-ul este organizat în secțiuni logice (tabele, funcții, trigger-uri, politici)
- Fiecare componentă are o responsabilitate clară

### 2. Principii SOLID
- **Single Responsibility**: Fiecare tabelă și funcție are o singură responsabilitate
- **Open/Closed**: Schema-ul este deschisă pentru extindere (noi tabele, funcții) dar închisă pentru modificare
- **Dependency Inversion**: Funcțiile utilitare nu depind de implementări specifice

### 3. Securitate
- Row Level Security (RLS) activat pentru toate tabelele
- Politici de securitate clare și restrictive
- Funcții cu `SECURITY DEFINER` pentru operațiuni privilegiate

### 4. Performanță
- Indecși optimizați pentru interogările frecvente
- Structură JSONB pentru flexibilitate și performanță
- Funcții utilitare pentru operațiuni comune

## Următorii Pași

1. ✅ Aplică schema-ul în Supabase
2. ✅ Configurează variabilele de mediu
3. 🔄 Proceedează la Partea 2 - Implementarea API-ului GraphQL

## Suport și Debugging

Pentru probleme sau întrebări:
1. Verifică logurile din Supabase Dashboard
2. Execută scriptul `verify_setup.sql` pentru diagnosticare
3. Consultă documentația Supabase pentru detalii suplimentare
