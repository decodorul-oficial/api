# Ajustări Necesare în Aplicația Web

Acest document descrie modificările necesare în aplicația web pentru a folosi API-ul GraphQL Admin Users implementat.

## 🔄 Modificări în Schema GraphQL

### 1. Tipuri de Subscripție Actualizate

**Înainte:**
```typescript
enum SubscriptionType {
  FREE
  PREMIUM
  PRO
}
```

**Acum:**
```typescript
enum AdminSubscriptionType {
  FREE
  PRO_MONTHLY
  PRO_YEARLY
  ENTERPRISE_MONTHLY
  ENTERPRISE_YEARLY
}
```

### 2. Statusuri de Subscripție Actualizate

**Înainte:**
```typescript
enum SubscriptionStatus {
  ACTIVE
  CANCELLED
  EXPIRED
  PENDING
}
```

**Acum:**
```typescript
enum AdminSubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  UNPAID
  TRIALING
  PENDING
  INCOMPLETE
  INCOMPLETE_EXPIRED
}
```

## 🔧 Modificări în Numele Mutations

Toate mutations-urile admin au primit prefixul `adminUsers` pentru a evita conflictele:

### Mutations Actualizate:
- `adminCancelSubscription` → `adminUsersCancelSubscription`
- `adminReactivateSubscription` → `adminUsersReactivateSubscription`
- `adminSuspendUser` → `adminUsersSuspendUser`
- `adminActivateUser` → `adminUsersActivateUser`
- `adminDeleteUser` → `adminUsersDeleteUser`
- `adminPromoteToAdmin` → `adminUsersPromoteToAdmin`
- `adminDemoteFromAdmin` → `adminUsersDemoteFromAdmin`

## 📊 Mapping-ul Corect pentru Statistici

**IMPORTANT**: Statisticile din API au următorul mapping:

```typescript
// În API-ul GraphQL
const stats = {
  totalUsers: data.adminUserStats.totalUsers,     // Total utilizatori
  activeUsers: data.adminUserStats.activeUsers,   // Utilizatori activi
  freeUsers: data.adminUserStats.freeUsers,       // Utilizatori gratuiti (subscription_tier = null sau 'free')
  proUsers: data.adminUserStats.proUsers,         // Utilizatori PRO (subscription_tier = 'pro')
  enterpriseUsers: data.adminUserStats.enterpriseUsers // Utilizatori ENTERPRISE (subscription_tier = 'enterprise*')
};

// Mapping-ul din baza de date:
// - subscription_tier = null → FREE
// - subscription_tier = 'free' → FREE  
// - subscription_tier = 'pro' → PRO_MONTHLY (afișat ca "Pro")
// - subscription_tier = 'enterprise*' → ENTERPRISE_* (afișat ca "Enterprise")
```

## 📝 Exemple de Query-uri Actualizate

### 1. Lista Utilizatorilor cu Filtrare

```graphql
query GetAdminUsers(
  $page: Int
  $limit: Int
  $search: String
  $sortField: AdminSortField
  $sortDirection: AdminSortDirection
  $filters: AdminUserFilters
) {
  adminUsers(
    page: $page
    limit: $limit
    search: $search
    sortField: $sortField
    sortDirection: $sortDirection
    filters: $filters
  ) {
    users {
      id
      name
      email
      avatar
      createdAt
      lastLoginAt
      isActive
      isAdmin
      statusLabel
      subscription {
        id
        type
        status
        startDate
        endDate
        autoRenew
        price
        currency
        typeLabel
        statusLabel
      }
      # ... alte câmpuri
    }
    pagination {
      totalCount
      totalPages
      currentPage
      hasNextPage
      hasPreviousPage
    }
  }
}
```

### 2. Statistici Utilizatori

```graphql
query GetAdminUserStats {
  adminUserStats {
    totalUsers
    activeUsers
    freeUsers        # Utilizatori cu subscription_tier = null sau 'free'
    proUsers         # Utilizatori cu subscription_tier = 'pro' (afișat ca "Pro")
    enterpriseUsers  # Utilizatori cu subscription_tier = 'enterprise*' (afișat ca "Enterprise")
  }
}
```

### 3. Mutations Actualizate

```graphql
# Suspendare utilizator
mutation SuspendUser($userId: ID!) {
  adminUsersSuspendUser(userId: $userId) {
    success
    message
  }
}

# Activare utilizator
mutation ActivateUser($userId: ID!) {
  adminUsersActivateUser(userId: $userId) {
    success
    message
  }
}

# Anulare subscripție
mutation CancelSubscription($userId: ID!, $subscriptionId: ID!) {
  adminUsersCancelSubscription(userId: $userId, subscriptionId: $subscriptionId) {
    success
    message
  }
}
```

## 🎨 Modificări în Interfața Utilizator

### 1. Filtre pentru Tipuri de Subscripție

Actualizați opțiunile de filtrare:

```typescript
const subscriptionTypeOptions = [
  { value: 'FREE', label: 'Gratuit' },
  { value: 'PRO_MONTHLY', label: 'Pro' },        // Pentru 'pro' din baza de date
  { value: 'PRO_YEARLY', label: 'Pro Anual' },
  { value: 'ENTERPRISE_MONTHLY', label: 'Enterprise' }, // Pentru 'enterprise' din baza de date
  { value: 'ENTERPRISE_YEARLY', label: 'Enterprise Anual' }
];
```

### 2. Filtre pentru Statusuri de Subscripție

```typescript
const subscriptionStatusOptions = [
  { value: 'ACTIVE', label: 'Activă' },
  { value: 'CANCELED', label: 'Anulată' },
  { value: 'PAST_DUE', label: 'Restantă' },
  { value: 'UNPAID', label: 'Neplătită' },
  { value: 'TRIALING', label: 'Trial' },
  { value: 'PENDING', label: 'În așteptare' },
  { value: 'INCOMPLETE', label: 'Incompletă' },
  { value: 'INCOMPLETE_EXPIRED', label: 'Trial expirat' }
];
```

### 3. Afișare Tipuri de Subscripție

```typescript
const getSubscriptionTypeLabel = (type: string) => {
  const labels = {
    'FREE': 'Gratuit',
    'PRO_MONTHLY': 'Pro',        // Pentru 'pro' din baza de date
    'PRO_YEARLY': 'Pro Anual',
    'ENTERPRISE_MONTHLY': 'Enterprise', // Pentru 'enterprise' din baza de date
    'ENTERPRISE_YEARLY': 'Enterprise Anual'
  };
  return labels[type] || 'Necunoscut';
};
```

### 4. Afișare Statusuri de Subscripție

```typescript
const getSubscriptionStatusLabel = (status: string) => {
  const labels = {
    'ACTIVE': 'Activă',
    'CANCELED': 'Anulată',
    'PAST_DUE': 'Restantă',
    'UNPAID': 'Neplătită',
    'TRIALING': 'Trial',
    'PENDING': 'În așteptare',
    'INCOMPLETE': 'Incompletă',
    'INCOMPLETE_EXPIRED': 'Trial expirat'
  };
  return labels[status] || 'Necunoscut';
};
```

## 📊 Modificări în Statistici

### Mapping Statistici Corect

```typescript
// Mapping-ul corect pentru statistici:
const stats = {
  totalUsers: data.adminUserStats.totalUsers,     // Total utilizatori
  activeUsers: data.adminUserStats.activeUsers,   // Utilizatori activi
  freeUsers: data.adminUserStats.freeUsers,       // Utilizatori gratuiti (subscription_tier = null sau 'free')
  proUsers: data.adminUserStats.proUsers,         // Utilizatori PRO (subscription_tier = 'pro')
  enterpriseUsers: data.adminUserStats.enterpriseUsers // Utilizatori ENTERPRISE (subscription_tier = 'enterprise*')
};

// Exemple de afișare în UI:
// - freeUsers: 1 (utilizator cu subscription_tier = null)
// - proUsers: 2 (utilizatori cu subscription_tier = 'pro')
// - enterpriseUsers: 0 (nu avem utilizatori enterprise încă)
```

## 🔄 Variabile pentru Query-uri

### Exemple de variabile actualizate:

```typescript
// Filtrare după tipul de subscripție
const variables = {
  page: 1,
  limit: 10,
  filters: {
    subscriptionType: {
      eq: 'PRO_MONTHLY'  // În loc de 'PREMIUM'
    }
  }
};

// Filtrare după status
const variables = {
  page: 1,
  limit: 10,
  filters: {
    subscriptionStatus: {
      eq: 'TRIALING'  // Status nou disponibil
    }
  }
};
```

## 🎯 Câmpuri Modificate

### 1. lastLoginAt este acum opțional

```typescript
// Înainte
type AdminUser {
  lastLoginAt: DateTime!  // Era obligatoriu
}

// Acum
type AdminUser {
  lastLoginAt: DateTime   // Este opțional (poate fi null)
}
```

### 2. Gestionarea valorilor null

```typescript
// În componentele React
const formatLastLogin = (lastLoginAt: string | null) => {
  if (!lastLoginAt) {
    return 'Niciodată';
  }
  return new Date(lastLoginAt).toLocaleDateString('ro-RO');
};

// Gestionarea avatar-ului (string lucide icon)
const getAvatarIcon = (avatarUrl: string | null) => {
  if (!avatarUrl) {
    return 'user'; // Icon default
  }
  // avatarUrl conține URL-ul complet către icon-ul Lucide
  // ex: "https://lucide.dev/icons/crown"
  const iconName = avatarUrl.split('/').pop(); // Extrage numele icon-ului
  return iconName || 'user';
};
```

## 🚀 Checklist pentru Implementare

- [ ] Actualizați schema GraphQL cu noile tipuri
- [ ] Modificați numele mutations-urilor (adaugați prefixul `adminUsers`)
- [ ] Actualizați opțiunile de filtrare pentru tipurile de subscripție
- [ ] Actualizați opțiunile de filtrare pentru statusurile de subscripție
- [ ] Modificați afișarea label-urilor pentru tipurile și statusurile de subscripție
- [ ] Actualizați mapping-ul pentru statistici
- [ ] Gestionați câmpul `lastLoginAt` ca opțional
- [ ] Testați toate funcționalitățile cu noile tipuri
- [ ] Actualizați documentația internă

## 📋 Exemple Complete Request/Response

### Request pentru Lista Utilizatorilor

```graphql
query GetAdminUsers {
  adminUsers(
    page: 1
    limit: 10
    search: ""
    sortField: CREATED_AT
    sortDirection: DESC
    filters: {
      status: { eq: true }
      subscriptionType: { eq: PRO_MONTHLY }
    }
  ) {
    users {
      id
      name
      email
      avatar
      createdAt
      lastLoginAt
      isActive
      isAdmin
      statusLabel
      subscription {
        id
        type
        status
        typeLabel
        statusLabel
      }
    }
    pagination {
      totalCount
      totalPages
      currentPage
      hasNextPage
      hasPreviousPage
    }
  }
}
```

### Response Example

```json
{
  "data": {
    "adminUsers": {
      "users": [
        {
          "id": "b96d32ab-2729-4c22-ae4a-db1b05faeaf7",
          "name": "Nie Radu Alexandru",
          "email": "nie.radu@gmail.com",
          "avatar": "https://lucide.dev/icons/crown",
          "createdAt": "2025-09-21T11:38:32.780765Z",
          "lastLoginAt": "2025-10-08T13:39:37.988145Z",
          "isActive": true,
          "isAdmin": false,
          "statusLabel": "Activ",
          "subscription": {
            "id": null,
            "type": "PRO_MONTHLY",
            "status": "ACTIVE",
            "typeLabel": "Pro",
            "statusLabel": "Activă"
          }
        }
      ],
      "pagination": {
        "totalCount": 2,
        "totalPages": 1,
        "currentPage": 1,
        "hasNextPage": false,
        "hasPreviousPage": false
      }
    }
  }
}
```

### Request pentru Statistici

```graphql
query GetAdminUserStats {
  adminUserStats {
    totalUsers
    activeUsers
    freeUsers
    proUsers
    enterpriseUsers
  }
}
```

### Response pentru Statistici

```json
{
  "data": {
    "adminUserStats": {
      "totalUsers": 3,
      "activeUsers": 3,
      "freeUsers": 1,
      "proUsers": 2,
      "enterpriseUsers": 0
    }
  }
}
```

## 📞 Suport

Dacă aveți întrebări despre implementare, consultați:
- `docs/ADMIN_USERS_API.md` - Documentația completă a API-ului
- Testele din `test-admin-users.js` (șters după implementare)
- Funcțiile RPC din baza de date pentru logica de backend
