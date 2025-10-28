# Câmpul isAdmin în GetMyProfile

## Prezentare Generală

Câmpul `isAdmin` a fost adăugat la tipul `Profile` din GraphQL schema pentru a permite aplicației web să verifice dacă utilizatorul curent are privilegii de administrator.

## Implementare

### 1. Schema GraphQL

Câmpul `isAdmin` a fost adăugat la tipul `Profile`:

```graphql
type Profile {
  id: ID
  subscriptionTier: String!
  displayName: String
  avatarUrl: String
  preferences: UserPreferences
  trialStatus: TrialStatus
  isNewsletterSubscribed: Boolean!
  isAdmin: Boolean!  # ← NOU
  # ... alte câmpuri
}
```

### 2. Resolver

Resolver-ul pentru `isAdmin` verifică statusul de admin din `raw_user_meta_data`:

```javascript
isAdmin: async (parent, args, context) => {
  if (!context.user) {
    return false;
  }
  try {
    return await userService.isAdmin(context.user.id);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}
```

### 3. UserService Method

Metoda `isAdmin` din `UserService` folosește o funcție RPC care accesează schema `auth`:

```javascript
async isAdmin(userId) {
  try {
    // Folosește funcția RPC care accesează schema auth
    const { data, error } = await this.supabase.rpc('check_user_admin_status', {
      user_id: userId
    });

    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}
```

### 4. Funcția RPC

Pentru a accesa schema `auth`, am creat o funcție RPC `check_user_admin_status`:

```sql
CREATE OR REPLACE FUNCTION public.check_user_admin_status(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN := FALSE;
BEGIN
    -- Verifică dacă utilizatorul este admin prin raw_user_meta_data
    SELECT COALESCE(
        (au.raw_user_meta_data->>'isAdmin')::BOOLEAN, 
        FALSE
    ) INTO is_admin
    FROM auth.users au
    WHERE au.id = user_id;
    
    RETURN is_admin;
END;
$$;
```

## Utilizare

### Query GraphQL

```graphql
query GetMyProfile {
  me {
    id
    email
    profile {
      id
      subscriptionTier
      displayName
      avatarUrl
      isNewsletterSubscribed
      isAdmin  # ← NOU
      trialStatus {
        isTrial
        hasTrial
        trialStart
        trialEnd
        tierId
        daysRemaining
        expired
      }
      preferences {
        preferredCategories
        notificationSettings
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
}
```

### Răspunsul JSON

```json
{
  "data": {
    "me": {
      "id": "user-uuid",
      "email": "user@example.com",
      "profile": {
        "id": "profile-uuid",
        "subscriptionTier": "free",
        "displayName": "John Doe",
        "avatarUrl": null,
        "isNewsletterSubscribed": true,
        "isAdmin": false,  // ← NOU
        "trialStatus": {
          "isTrial": true,
          "hasTrial": true,
          "trialStart": "2024-01-01T00:00:00Z",
          "trialEnd": "2024-01-15T00:00:00Z",
          "tierId": "trial-tier-id",
          "daysRemaining": 10,
          "expired": false
        },
        "preferences": {
          "preferredCategories": ["politics", "economy"],
          "notificationSettings": {
            "email": true,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-01T00:00:00Z"
        },
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    }
  }
}
```

## Setarea unui Utilizator ca Admin

Pentru a seta un utilizator ca admin, actualizează câmpul `raw_user_meta_data` în tabela `auth.users`:

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{isAdmin}',
  'true'::jsonb
)
WHERE email = 'admin@example.com';
```

## Securitate

- Câmpul `isAdmin` este întotdeauna `false` pentru utilizatorii neautentificați
- În caz de eroare la verificarea statusului de admin, câmpul returnează `false`
- Verificarea se face prin query direct la tabela `auth.users` cu service role

## Testare

Pentru a testa implementarea, rulează:

```bash
# Test GraphQL query
node test-isadmin-field.js

# Test UserService method
TEST_USER_ID=your-user-id node test-isadmin-service.js
```

## Compatibilitate

- Câmpul `isAdmin` este non-breaking - aplicațiile existente vor continua să funcționeze
- Câmpul este opțional în query-uri - poate fi omis dacă nu este necesar
- Valoarea implicită este `false` pentru toți utilizatorii
