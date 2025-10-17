# Ghid de Consumare API - Monitorul Oficial

## Prezentare Generală

Acest ghid explică cum să consumi API-ul Monitorul Oficial pentru toate scenariile de utilizare, incluzând sistemul de abonamente cu trial de 14 zile.

## Structura Abonamentelor

### Tier-uri Disponibile

1. **Free** - Acces gratuit cu limitări
2. **Pro Lunar** - 29.99 RON/lună (cu trial de 14 zile)
3. **Pro Anual** - 299.99 RON/an (cu trial de 14 zile + 2 luni gratuite)
4. **Enterprise Lunar** - 99.99 RON/lună (cu trial de 14 zile)
5. **Enterprise Anual** - 999.99 RON/an (cu trial de 14 zile + 2 luni gratuite)

### ID-uri Tier-uri

- `free` - Tier gratuit
- `pro-monthly` - Pro Lunar
- `pro-yearly` - Pro Anual
- `enterprise-monthly` - Enterprise Lunar
- `enterprise-yearly` - Enterprise Anual

## Scenarii de Utilizare

### 1. Înregistrare Utilizator Nou

Când un utilizator se înregistrează, primește automat un trial de 14 zile pentru tier-ul Pro.

#### Request

```graphql
mutation SignUp($input: SignUpInput!) {
  signUp(input: $input) {
    token
    user {
      id
      email
      profile {
        id
        subscriptionTier
        trialStatus {
          isTrial
          hasTrial
          trialStart
          trialEnd
          daysRemaining
        }
      }
    }
  }
}
```

#### Variables

```json
{
  "input": {
    "email": "utilizator@example.com",
    "password": "Parola123!"
  }
}
```

**Reține:** Parola trebuie să conțină:
- Cel puțin 8 caractere
- Cel puțin o literă mică
- Cel puțin o literă mare  
- Cel puțin o cifră
- Cel puțin un caracter special (@$!%*?&)

#### Răspuns

```json
{
  "data": {
    "signUp": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "utilizator@example.com",
        "profile": {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "subscriptionTier": "pro",
          "trialStatus": {
            "isTrial": true,
            "hasTrial": true,
            "trialStart": "2024-01-01T00:00:00Z",
            "trialEnd": "2024-01-15T00:00:00Z",
            "daysRemaining": 14
          }
        }
      }
    }
  }
}
```

### 2. Autentificare Utilizator

#### Request

```graphql
mutation SignIn($input: SignInInput!) {
  signIn(input: $input) {
    token
    user {
      id
      email
      profile {
        id
        subscriptionTier
        trialStatus {
          isTrial
          hasTrial
          trialStart
          trialEnd
          daysRemaining
        }
      }
    }
  }
}
```

#### Variables

```json
{
  "input": {
    "email": "utilizator@example.com",
    "password": "Parola123!"
  }
}
```

### 3. Verificare Status Trial și Informații Complete de Abonament

#### Request

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
      createdAt
      updatedAt
      
      # Informații despre trial
      trialStatus {
        isTrial
        hasTrial
        trialStart
        trialEnd
        tierId
        daysRemaining
        expired
      }
      
      # Preferințe utilizator
      preferences {
        preferredCategories
        notificationSettings
        createdAt
        updatedAt
      }
      
      # =====================================================
      # INFORMATII COMPLETE DE ABONAMENT
      # =====================================================
      
      # Abonamentul activ (dacă există)
      activeSubscription {
        id
        userId
        status
        netopiaOrderId
        currentPeriodStart
        currentPeriodEnd
        cancelAtPeriodEnd
        canceledAt
        trialStart
        trialEnd
        metadata
        createdAt
        updatedAt
        
        # Detalii despre tier-ul de abonament
        tier {
          id
          name
          displayName
          description
          price
          currency
          interval
          features
          isPopular
          trialDays
          isActive
          createdAt
          updatedAt
        }
      }
      
      # Utilizarea abonamentului (limite de request-uri)
      subscriptionUsage {
        subscriptionId
        currentPeriodStart
        currentPeriodEnd
        requestsUsed
        requestsLimit
        requestsRemaining
        lastResetAt
      }
      
      # Metodele de plată salvate
      paymentMethods {
        id
        userId
        last4
        brand
        expMonth
        expYear
        isDefault
        createdAt
        updatedAt
      }
      
      # Istoricul abonamentelor (toate abonamentele utilizatorului)
      subscriptionHistory {
        id
        userId
        status
        netopiaOrderId
        currentPeriodStart
        currentPeriodEnd
        cancelAtPeriodEnd
        canceledAt
        trialStart
        trialEnd
        metadata
        createdAt
        updatedAt
        
        # Detalii despre tier-ul de abonament
        tier {
          id
          name
          displayName
          description
          price
          currency
          interval
          features
          isPopular
          trialDays
          isActive
          createdAt
          updatedAt
        }
      }
    }
  }
}
```

#### Răspuns pentru Utilizator în Trial

```json
{
  "data": {
    "me": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "utilizator@example.com",
      "profile": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "subscriptionTier": "pro",
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "isNewsletterSubscribed": true,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-10T10:30:00Z",
        "trialStatus": {
          "isTrial": true,
          "hasTrial": true,
          "trialStart": "2024-01-01T00:00:00Z",
          "trialEnd": "2024-01-15T00:00:00Z",
          "tierId": "pro-tier-uuid",
          "daysRemaining": 5,
          "expired": false
        },
        "preferences": {
          "preferredCategories": ["legislative", "government"],
          "notificationSettings": {
            "email": true,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-10T10:30:00Z"
        },
        "activeSubscription": null,
        "subscriptionUsage": null,
        "paymentMethods": [],
        "subscriptionHistory": []
      }
    }
  }
}
```

#### Răspuns pentru Trial Expirat

```json
{
  "data": {
    "me": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "utilizator@example.com",
      "profile": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "subscriptionTier": "free",
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "isNewsletterSubscribed": true,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-16T10:30:00Z",
        "trialStatus": {
          "isTrial": false,
          "hasTrial": true,
          "trialStart": "2024-01-01T00:00:00Z",
          "trialEnd": "2024-01-15T00:00:00Z",
          "tierId": "pro-tier-uuid",
          "daysRemaining": 0,
          "expired": true
        },
        "preferences": {
          "preferredCategories": ["legislative", "government"],
          "notificationSettings": {
            "email": true,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-16T10:30:00Z"
        },
        "activeSubscription": null,
        "subscriptionUsage": null,
        "paymentMethods": [],
        "subscriptionHistory": []
      }
    }
  }
}
```

#### Răspuns pentru Utilizator cu Abonament Activ

```json
{
  "data": {
    "me": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "utilizator@example.com",
      "profile": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "subscriptionTier": "pro",
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "isNewsletterSubscribed": true,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-16T10:30:00Z",
        "trialStatus": {
          "isTrial": false,
          "hasTrial": true,
          "trialStart": "2024-01-01T00:00:00Z",
          "trialEnd": "2024-01-15T00:00:00Z",
          "tierId": "pro-tier-uuid",
          "daysRemaining": 0,
          "expired": true
        },
        "preferences": {
          "preferredCategories": ["legislative", "government"],
          "notificationSettings": {
            "email": true,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-16T10:30:00Z"
        },
        "activeSubscription": {
          "id": "subscription-uuid",
          "userId": "123e4567-e89b-12d3-a456-426614174000",
          "status": "ACTIVE",
          "netopiaOrderId": "netopia-order-123",
          "currentPeriodStart": "2024-01-15T00:00:00Z",
          "currentPeriodEnd": "2024-02-15T00:00:00Z",
          "cancelAtPeriodEnd": false,
          "canceledAt": null,
          "trialStart": "2024-01-01T00:00:00Z",
          "trialEnd": "2024-01-15T00:00:00Z",
          "metadata": {
            "source": "trial_conversion"
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-15T10:30:00Z",
          "tier": {
            "id": "pro-tier-uuid",
            "name": "pro-monthly",
            "displayName": "Pro Lunar",
            "description": "Acces complet la toate funcționalitățile",
            "price": 29.99,
            "currency": "RON",
            "interval": "MONTHLY",
            "features": [
              "Acces nelimitat la știri",
              "Căutări avansate",
              "Notificări personalizate",
              "Export PDF",
              "API access"
            ],
            "isPopular": true,
            "trialDays": 14,
            "isActive": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          }
        },
        "subscriptionUsage": {
          "subscriptionId": "subscription-uuid",
          "currentPeriodStart": "2024-01-15T00:00:00Z",
          "currentPeriodEnd": "2024-02-15T00:00:00Z",
          "requestsUsed": 1250,
          "requestsLimit": 10000,
          "requestsRemaining": 8750,
          "lastResetAt": "2024-01-15T00:00:00Z"
        },
        "paymentMethods": [
          {
            "id": "payment-method-uuid",
            "userId": "123e4567-e89b-12d3-a456-426614174000",
            "last4": "1234",
            "brand": "Visa",
            "expMonth": 12,
            "expYear": 2025,
            "isDefault": true,
            "createdAt": "2024-01-15T10:30:00Z",
            "updatedAt": "2024-01-15T10:30:00Z"
          }
        ],
        "subscriptionHistory": [
          {
            "id": "subscription-uuid",
            "userId": "123e4567-e89b-12d3-a456-426614174000",
            "status": "ACTIVE",
            "netopiaOrderId": "netopia-order-123",
            "currentPeriodStart": "2024-01-15T00:00:00Z",
            "currentPeriodEnd": "2024-02-15T00:00:00Z",
            "cancelAtPeriodEnd": false,
            "canceledAt": null,
            "trialStart": "2024-01-01T00:00:00Z",
            "trialEnd": "2024-01-15T00:00:00Z",
            "metadata": {
              "source": "trial_conversion"
            },
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-15T10:30:00Z",
            "tier": {
              "id": "pro-tier-uuid",
              "name": "pro-monthly",
              "displayName": "Pro Lunar",
              "description": "Acces complet la toate funcționalitățile",
              "price": 29.99,
              "currency": "RON",
              "interval": "MONTHLY",
              "features": [
                "Acces nelimitat la știri",
                "Căutări avansate",
                "Notificări personalizate",
                "Export PDF",
                "API access"
              ],
              "isPopular": true,
              "trialDays": 14,
              "isActive": true,
              "createdAt": "2024-01-01T00:00:00Z",
              "updatedAt": "2024-01-01T00:00:00Z"
            }
          }
        ]
      }
    }
  }
}
```

### 4. Obținere Tier-uri Disponibile

#### Request

```graphql
query GetSubscriptionTiers {
  getSubscriptionTiers {
    id
    name
    displayName
    description
    price
    currency
    interval
    features
    isPopular
    trialDays
    isActive
  }
}
```

#### Răspuns

```json
{
  "data": {
    "getSubscriptionTiers": [
      {
        "id": "tier-1",
        "name": "free",
        "displayName": "Free",
        "description": "Acces gratuit cu limitări",
        "price": 0,
        "currency": "RON",
        "interval": "LIFETIME",
        "features": ["Acces limitat la știri", "Căutare de bază", "5 cereri/zi"],
        "isPopular": false,
        "trialDays": 0,
        "isActive": true
      },
      {
        "id": "tier-2",
        "name": "pro-monthly",
        "displayName": "Pro Lunar",
        "description": "Abonament Pro cu acces complet lunar",
        "price": 29.99,
        "currency": "RON",
        "interval": "MONTHLY",
        "features": ["Acces nelimitat la știri", "Căutare avansată", "Analiză de rețea", "Suport prioritar", "Export PDF"],
        "isPopular": true,
        "trialDays": 14,
        "isActive": true
      },
      {
        "id": "tier-3",
        "name": "pro-yearly",
        "displayName": "Pro Anual",
        "description": "Abonament Pro cu acces complet anual (2 luni gratuite)",
        "price": 299.99,
        "currency": "RON",
        "interval": "YEARLY",
        "features": ["Acces nelimitat la știri", "Căutare avansată", "Analiză de rețea", "Suport prioritar", "Export PDF", "2 luni gratuite"],
        "isPopular": false,
        "trialDays": 14,
        "isActive": true
      }
    ]
  }
}
```

### 5. Începere Proces de Checkout

#### Pentru Pro Lunar

```graphql
mutation StartCheckout($input: StartCheckoutInput!) {
  startCheckout(input: $input) {
    orderId
    checkoutUrl
    expiresAt
  }
}
```

#### Variables

```json
{
  "input": {
    "tierId": "pro-monthly",
    "customerEmail": "utilizator@example.com",
    "billingAddress": {
      "firstName": "Ion",
      "lastName": "Popescu",
      "address": "Strada Principală 123",
      "city": "București",
      "country": "RO",
      "zipCode": "010001"
    }
  }
}
```

#### Pentru Pro Anual

```json
{
  "input": {
    "tierId": "pro-yearly",
    "customerEmail": "utilizator@example.com",
    "billingAddress": {
      "firstName": "Ion",
      "lastName": "Popescu",
      "address": "Strada Principală 123",
      "city": "București",
      "country": "RO",
      "zipCode": "010001"
    }
  }
}
```

#### Răspuns

```json
{
  "data": {
    "startCheckout": {
      "orderId": "order-123",
      "checkoutUrl": "https://netopia.ro/checkout/...",
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 6. Confirmare Plată

#### Request

```graphql
mutation ConfirmPayment($orderId: ID!) {
  confirmPayment(orderId: $orderId) {
    id
    status
    amount
    currency
    checkoutUrl
  }
}
```

#### Variables

```json
{
  "orderId": "order-123"
}
```

#### Răspuns

```json
{
  "data": {
    "confirmPayment": {
      "id": "order-123",
      "status": "SUCCEEDED",
      "amount": 29.99,
      "currency": "RON",
      "checkoutUrl": null
    }
  }
}
```

### 7. Verificare Abonament Activ

#### Request

```graphql
query GetMySubscription {
  getMySubscription {
    id
    status
    tier {
      name
      displayName
      price
      interval
    }
    currentPeriodStart
    currentPeriodEnd
    cancelAtPeriodEnd
  }
}
```

#### Răspuns

```json
{
  "data": {
    "getMySubscription": {
      "id": "sub-123",
      "status": "ACTIVE",
      "tier": {
        "name": "pro-monthly",
        "displayName": "Pro Lunar",
        "price": 29.99,
        "interval": "MONTHLY"
      },
      "currentPeriodStart": "2024-01-01T00:00:00Z",
      "currentPeriodEnd": "2024-02-01T00:00:00Z",
      "cancelAtPeriodEnd": false
    }
  }
}
```

### 8. Obținere Știri după Slug de Categorie (getStiriByCategorySlug)

**IMPORTANT**: Endpoint-ul `getStiriByCategorySlug` necesită trial activ sau abonament valid. Nu este accesibil pentru utilizatorii neautentificați sau cei fără abonament.

#### Request

```graphql
query GetStiriByCategorySlug {
  getStiriByCategorySlug(
    slug: "legislative"
    limit: 20
    offset: 0
    orderBy: "publicationDate"
    orderDirection: "desc"
  ) {
    stiri {
      id
      title
      publicationDate
      category
    }
    pagination {
      totalCount
      hasNextPage
    }
  }
}
```

#### Răspuns pentru Utilizator cu Trial/Abonament

```json
{
  "data": {
    "getStiriByCategorySlug": {
      "stiri": [
        {
          "id": "1",
          "title": "Știre legislative 1",
          "publicationDate": "2024-01-01T00:00:00Z",
          "category": "Legislative"
        },
        {
          "id": "2",
          "title": "Știre legislative 2",
          "publicationDate": "2024-01-02T00:00:00Z",
          "category": "Legislative"
        }
      ],
      "pagination": {
        "totalCount": 100,
        "hasNextPage": true
      }
    }
  }
}
```

#### Răspuns pentru Utilizator fără Trial/Abonament

```json
{
  "errors": [
    {
      "message": "Această funcționalitate necesită un abonament activ sau trial",
      "extensions": {
        "code": "SUBSCRIPTION_REQUIRED",
        "trialStatus": {
          "isTrial": false,
          "hasTrial": false,
          "expired": false
        }
      }
    }
  ]
}
```

### 9. Obținere Categorii (getCategories)

**IMPORTANT**: Endpoint-ul `getCategories` necesită trial activ sau abonament valid. Nu este accesibil pentru utilizatorii neautentificați sau cei fără abonament.

#### Request

```graphql
query GetCategories {
  getCategories(limit: 50) {
    name
    slug
    count
  }
}
```

#### Răspuns pentru Utilizator cu Trial/Abonament

```json
{
  "data": {
    "getCategories": [
      {
        "name": "Legislative",
        "slug": "legislative",
        "count": 1250
      },
      {
        "name": "Government",
        "slug": "government",
        "count": 890
      },
      {
        "name": "Economic",
        "slug": "economic",
        "count": 650
      }
    ]
  }
}
```

#### Răspuns pentru Utilizator fără Trial/Abonament

```json
{
  "errors": [
    {
      "message": "Această funcționalitate necesită un abonament activ sau trial",
      "extensions": {
        "code": "SUBSCRIPTION_REQUIRED",
        "trialStatus": {
          "isTrial": false,
          "hasTrial": false,
          "expired": false
        }
      }
    }
  ]
}
```

### 10. Anulare Abonament

#### Request

```graphql
mutation CancelSubscription($input: CancelSubscriptionInput!) {
  cancelSubscription(input: $input) {
    id
    status
    cancelAtPeriodEnd
    canceledAt
  }
}
```

#### Variables

```json
{
  "input": {
    "subscriptionId": "sub-123",
    "immediate": false,
    "refund": false,
    "reason": "Utilizator a solicitat anularea"
  }
}
```

#### Răspuns

```json
{
  "data": {
    "cancelSubscription": {
      "id": "sub-123",
      "status": "ACTIVE",
      "cancelAtPeriodEnd": true,
      "canceledAt": null
    }
  }
}
```

## Noile Proprietăți de Abonament în GetMyProfile

### Descrierea Proprietăților

#### `activeSubscription`
Returnează abonamentul activ al utilizatorului (dacă există). Include toate detaliile despre abonament, inclusiv tier-ul asociat.

**Când este `null`:**
- Utilizatorul nu are abonament activ
- Utilizatorul este în trial (trial-ul nu este considerat abonament activ)
- Utilizatorul are abonament anulat

#### `subscriptionUsage`
Returnează informații despre utilizarea curentă a abonamentului, inclusiv limitele de request-uri.

**Când este `null`:**
- Utilizatorul nu are abonament activ
- Nu se pot calcula limitele de utilizare

#### `paymentMethods`
Returnează lista metodelor de plată salvate ale utilizatorului.

**Când este array gol:**
- Utilizatorul nu a salvat nicio metodă de plată
- Toate metodele de plată au fost șterse

#### `subscriptionHistory`
Returnează istoricul complet al abonamentelor utilizatorului, ordonat cronologic (cel mai recent primul).

**Când este array gol:**
- Utilizatorul nu a avut niciodată abonamente
- Toate abonamentele au fost șterse din istoric

### Cazuri de Utilizare

#### 1. Utilizator în Trial
```json
{
  "activeSubscription": null,
  "subscriptionUsage": null,
  "paymentMethods": [],
  "subscriptionHistory": []
}
```

#### 2. Utilizator cu Abonament Activ
```json
{
  "activeSubscription": {
    "id": "sub-123",
    "status": "ACTIVE",
    "tier": { "displayName": "Pro Lunar" },
    "currentPeriodEnd": "2024-02-15T00:00:00Z"
  },
  "subscriptionUsage": {
    "requestsUsed": 1250,
    "requestsLimit": 10000,
    "requestsRemaining": 8750
  },
  "paymentMethods": [
    { "brand": "Visa", "last4": "1234", "isDefault": true }
  ],
  "subscriptionHistory": [
    { "id": "sub-123", "status": "ACTIVE" }
  ]
}
```

#### 3. Utilizator cu Abonament Anulat
```json
{
  "activeSubscription": null,
  "subscriptionUsage": null,
  "paymentMethods": [
    { "brand": "Visa", "last4": "1234", "isDefault": true }
  ],
  "subscriptionHistory": [
    { "id": "sub-123", "status": "CANCELED", "canceledAt": "2024-01-20T10:00:00Z" }
  ]
}
```

### Beneficii pentru Aplicația WEB

1. **Dashboard de Abonament** - Afișează statusul complet al abonamentului
2. **Monitorizare Utilizare** - Urmărește limitele de request-uri în timp real
3. **Gestionare Plăți** - Gestionează metodele de plată salvate
4. **Istoric Complet** - Afișează toate abonamentele din trecut
5. **Experiență Unificată** - Toate informațiile într-un singur request

## Gestionarea Erorilor

### Erori Comune

#### 1. Trial Expirat

```json
{
  "errors": [
    {
      "message": "Această funcționalitate necesită un abonament activ sau trial",
      "extensions": {
        "code": "SUBSCRIPTION_REQUIRED",
        "trialStatus": {
          "isTrial": false,
          "hasTrial": true,
          "expired": true
        }
      }
    }
  ]
}
```

#### 2. Tier Invalid

```json
{
  "errors": [
    {
      "message": "Invalid subscription tier",
      "extensions": {
        "code": "INTERNAL_SERVER_ERROR"
      }
    }
  ]
}
```

#### 3. Utilizator Neautentificat

```json
{
  "errors": [
    {
      "message": "Utilizator neautentificat",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

## Headers de Autentificare

### Opțiunea 1: Bearer Token

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Opțiunea 2: Cookie Supabase

```http
Cookie: sb-kwgfkcxlgxikmzdpxulp-auth-token=base64_encoded_token
```

## Rate Limiting

### Limite pe Tier

- **Free**: 5 cereri/zi
- **Pro (Trial)**: Nelimitat
- **Pro (Plătit)**: Nelimitat
- **Enterprise**: Nelimitat

### Limitări de Paginare pentru Știri

Pentru a controla accesul la funcționalitățile avansate, API-ul implementează următoarele limitări:

#### Utilizatori Fără Abonament Activ
- **Limită maximă**: 10 știri per pagină
- **Aplicabil pentru**: `getStiri`, `searchStiri`, `searchStiriByKeywords`, `getStiriByCategory`, `getStiriByCategorySlug`
- **Eroare**: `SUBSCRIPTION_REQUIRED` când se încearcă limit > 10

#### Utilizatori în Perioada de Trial
- **Limită maximă**: 100 știri per pagină
- **Aplicabil pentru**: Toate query-urile de știri
- **Beneficii**: Acces complet la toate funcționalitățile de paginare (la fel ca utilizatorii cu abonament activ)

#### Utilizatori cu Abonament Activ
- **Limită maximă**: 100 știri per pagină
- **Aplicabil pentru**: Toate query-urile de știri
- **Beneficii**: Acces complet la toate funcționalitățile de paginare

#### Exemple de Utilizare

**✅ Utilizator fără abonament - limit ≤ 10:**
```graphql
query GetStiri {
  getStiri(limit: 10) {
    stiri {
      id
      title
      publicationDate
    }
    pagination {
      totalCount
      hasNextPage
    }
  }
}
```

**❌ Utilizator fără abonament - limit > 10:**
```graphql
query GetStiri {
  getStiri(limit: 20) {
    stiri {
      id
      title
    }
  }
}
```

**Răspuns cu eroare:**
```json
{
  "errors": [
    {
      "message": "Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ",
      "extensions": {
        "code": "SUBSCRIPTION_REQUIRED",
        "message": "Această funcționalitate necesită un abonament activ. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină."
      }
    }
  ]
}
```

**✅ Utilizator în trial - limit > 10:**
```graphql
query GetStiri {
  getStiri(limit: 50) {
    stiri {
      id
      title
      publicationDate
    }
    pagination {
      totalCount
      hasNextPage
    }
  }
}
```

**✅ Utilizator cu abonament activ - limit > 10:**
```graphql
query GetStiri {
  getStiri(limit: 50) {
    stiri {
      id
      title
      publicationDate
    }
    pagination {
      totalCount
      hasNextPage
    }
  }
}
```

#### Verificare Status Abonament

Pentru a verifica dacă utilizatorul poate accesa limite mai mari, folosiți:

```graphql
query CheckSubscriptionStatus {
  me {
    profile {
      subscriptionTier
      activeSubscription {
        status
        tier {
          name
          displayName
        }
      }
    }
  }
}
```

#### Implementare în Aplicația Frontend

```javascript
class StoriesAPI {
  async getStories(limit = 10) {
    try {
      const result = await this.query(`
        query GetStiri($limit: Int) {
          getStiri(limit: $limit) {
            stiri {
              id
              title
              publicationDate
            }
            pagination {
              totalCount
              hasNextPage
            }
          }
        }
      `, { limit });
      
      return result.getStiri;
    } catch (error) {
      if (error.extensions?.code === 'SUBSCRIPTION_REQUIRED') {
        // Redirect la pagina de upgrade
        this.redirectToUpgrade();
        return null;
      }
      throw error;
    }
  }
  
  async getMaxAllowedLimit() {
    try {
      const result = await this.query(`
        query GetMyProfile {
          me {
            profile {
              activeSubscription {
                status
              }
              trialStatus {
                isTrial
              }
            }
          }
        }
      `);
      
      const hasActiveSubscription = result.me?.profile?.activeSubscription?.status === 'ACTIVE';
      const isInTrial = result.me?.profile?.trialStatus?.isTrial;
      
      return (hasActiveSubscription || isInTrial) ? 100 : 10;
    } catch (error) {
      return 10; // Default pentru utilizatori neautentificați
    }
  }
  
  redirectToUpgrade() {
    // Implementare redirect la pagina de upgrade
    window.location.href = '/upgrade';
  }
}
```

### Verificare Rate Limit

#### Request

```graphql
query GetRateLimitInfo {
  getRateLimitInfo {
    hasUnlimitedRequests
    requestLimit
    currentRequests
    remainingRequests
    tier
    tierName
  }
}
```

#### Răspuns

```json
{
  "data": {
    "getRateLimitInfo": {
      "hasUnlimitedRequests": true,
      "requestLimit": null,
      "currentRequests": 0,
      "remainingRequests": null,
      "tier": "pro",
      "tierName": "Pro"
    }
  }
}
```

## Exemple de Integrare

### JavaScript/TypeScript

```javascript
class MonitorulOficialAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async query(query, variables = {}) {
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }
    
    return data.data;
  }

  async signUp(email, password) {
    return this.query(`
      mutation SignUp($input: SignUpInput!) {
        signUp(input: $input) {
          token
          user {
            id
            email
            profile {
              subscriptionTier
              trialStatus {
                isTrial
                daysRemaining
              }
            }
          }
        }
      }
    `, {
      input: { email, password }
    });
  }

  async startCheckout(tierId, customerEmail, billingAddress) {
    return this.query(`
      mutation StartCheckout($input: StartCheckoutInput!) {
        startCheckout(input: $input) {
          orderId
          checkoutUrl
          expiresAt
        }
      }
    `, {
      input: { tierId, customerEmail, billingAddress }
    });
  }

  async getMyProfile() {
    return this.query(`
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
            createdAt
            updatedAt
            
            # Informații despre trial
            trialStatus {
              isTrial
              hasTrial
              trialStart
              trialEnd
              tierId
              daysRemaining
              expired
            }
            
            # Preferințe utilizator
            preferences {
              preferredCategories
              notificationSettings
              createdAt
              updatedAt
            }
            
            # Informații complete de abonament
            activeSubscription {
              id
              status
              currentPeriodStart
              currentPeriodEnd
              cancelAtPeriodEnd
              canceledAt
              trialStart
              trialEnd
              metadata
              createdAt
              updatedAt
              
              tier {
                id
                name
                displayName
                description
                price
                currency
                interval
                features
                isPopular
                trialDays
                isActive
                createdAt
                updatedAt
              }
            }
            
            subscriptionUsage {
              subscriptionId
              currentPeriodStart
              currentPeriodEnd
              requestsUsed
              requestsLimit
              requestsRemaining
              lastResetAt
            }
            
            paymentMethods {
              id
              last4
              brand
              expMonth
              expYear
              isDefault
              createdAt
              updatedAt
            }
            
            subscriptionHistory {
              id
              status
              currentPeriodStart
              currentPeriodEnd
              cancelAtPeriodEnd
              canceledAt
              trialStart
              trialEnd
              metadata
              createdAt
              updatedAt
              
              tier {
                id
                name
                displayName
                description
                price
                currency
                interval
                features
                isPopular
                trialDays
                isActive
                createdAt
                updatedAt
              }
            }
          }
        }
      }
    `);
  }

  async getMySubscription() {
    return this.query(`
      query GetMySubscription {
        getMySubscription {
          id
          status
          tier {
            name
            displayName
            price
            interval
          }
          currentPeriodStart
          currentPeriodEnd
        }
      }
    `);
  }
}

// Utilizare
const api = new MonitorulOficialAPI('https://api.monitoruloficial.ro', 'your-token');

// Înregistrare utilizator nou
const signUpResult = await api.signUp('user@example.com', 'password123');
console.log('Trial days remaining:', signUpResult.signUp.user.profile.trialStatus.daysRemaining);

// Obținere profil complet cu informații de abonament
const profileResult = await api.getMyProfile();
const profile = profileResult.me.profile;

console.log('Subscription Tier:', profile.subscriptionTier);
console.log('Trial Status:', profile.trialStatus);

// Verificare abonament activ
if (profile.activeSubscription) {
  console.log('Active Subscription:', profile.activeSubscription.tier.displayName);
  console.log('Status:', profile.activeSubscription.status);
  console.log('Period End:', profile.activeSubscription.currentPeriodEnd);
  
  // Verificare utilizare
  if (profile.subscriptionUsage) {
    console.log('Requests Used:', profile.subscriptionUsage.requestsUsed);
    console.log('Requests Remaining:', profile.subscriptionUsage.requestsRemaining);
  }
  
  // Verificare metode de plată
  if (profile.paymentMethods.length > 0) {
    console.log('Payment Methods:', profile.paymentMethods.map(pm => `${pm.brand} ****${pm.last4}`));
  }
  
  // Verificare istoric abonamente
  console.log('Subscription History:', profile.subscriptionHistory.length, 'subscriptions');
} else {
  console.log('No active subscription');
}

// Start checkout pentru Pro Lunar
const checkout = await api.startCheckout('pro-monthly', 'user@example.com', {
  firstName: 'Ion',
  lastName: 'Popescu',
  address: 'Strada Principală 123',
  city: 'București',
  country: 'RO',
  zipCode: '010001'
});

// Redirect la Netopia
window.location.href = checkout.startCheckout.checkoutUrl;
```

### React Hook pentru Trial Status

```javascript
import { useState, useEffect } from 'react';

function useTrialStatus(api) {
  const [trialStatus, setTrialStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrialStatus() {
      try {
        const result = await api.query(`
          query Me {
            me {
              profile {
                subscriptionTier
                trialStatus {
                  isTrial
                  hasTrial
                  daysRemaining
                  expired
                }
              }
            }
          }
        `);
        
        setTrialStatus(result.me.profile.trialStatus);
      } catch (error) {
        console.error('Error fetching trial status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchTrialStatus();
  }, [api]);

  return { trialStatus, loading };
}

// Componentă React
function TrialBanner() {
  const { trialStatus, loading } = useTrialStatus(api);

  if (loading) return <div>Loading...</div>;

  if (trialStatus?.isTrial) {
    return (
      <div className="trial-banner">
        <p>Ai {trialStatus.daysRemaining} zile rămase din trial-ul Pro!</p>
        <button onClick={() => startCheckout()}>
          Upgrade acum
        </button>
      </div>
    );
  }

  if (trialStatus?.expired) {
    return (
      <div className="trial-expired">
        <p>Trial-ul tău a expirat. Upgrade pentru a continua!</p>
        <button onClick={() => startCheckout()}>
          Upgrade acum
        </button>
      </div>
    );
  }

  return null;
}
```

## Webhook-uri Netopia

### Configurare Webhook

URL: `https://your-domain.com/webhook/netopia/ipn`
Events: Payment succeeded, Payment failed, Payment canceled

### Procesare Webhook

Webhook-urile sunt procesate automat și:
1. Activează abonamentul când plata reușește
2. Anulează abonamentul când plata eșuează
3. Gestionează conversia de la trial la abonament plătit

## Monitorizare și Debugging

### Log-uri Importante

1. **Trial Setup**: Când un utilizator nou primește trial
2. **Trial Expiration**: Când trial-ul expiră și utilizatorul este downgradat
3. **Payment Success**: Când o plată reușește și abonamentul este activat
4. **Trial Conversion**: Când un utilizator convertește de la trial la plată

### Verificare Status în Database

```sql
-- Verificare utilizatori în trial
SELECT 
  p.id,
  p.subscription_tier,
  p.trial_start,
  p.trial_end,
  EXTRACT(EPOCH FROM (p.trial_end - NOW())) / 86400 as days_remaining
FROM profiles p
WHERE p.trial_end IS NOT NULL 
  AND p.trial_end > NOW();

-- Verificare abonamente active
SELECT 
  s.id,
  s.status,
  st.name as tier_name,
  s.current_period_start,
  s.current_period_end
FROM subscriptions s
JOIN subscription_tiers st ON s.tier_id = st.id
WHERE s.status = 'ACTIVE';
```

## Concluzie

Acest ghid acoperă toate scenariile de utilizare ale API-ului Monitorul Oficial, incluzând:

- Înregistrare și autentificare cu trial automat
- Gestionarea trial-ului de 14 zile
- Procesul de checkout pentru abonamente
- Conversia de la trial la abonament plătit
- Gestionarea erorilor și rate limiting
- Exemple de integrare în aplicații web

Pentru întrebări sau suport tehnic, contactează echipa de dezvoltare.
