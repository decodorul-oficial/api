# API GraphQL pentru Gestionarea Utilizatorilor (Admin)

Acest document descrie API-ul GraphQL pentru gestionarea utilizatorilor de către administratori în aplicația Monitorul Oficial.

## 🔐 Autentificare și Autorizare

Toate operațiunile din acest API necesită:
- **Autentificare**: Utilizatorul trebuie să fie autentificat
- **Autorizare**: Utilizatorul trebuie să aibă rolul de administrator (câmpul `isAdmin: true` în `raw_user_meta_data`)

## 📊 Query-uri Disponibile

### 1. Lista Utilizatorilor cu Filtrare și Sortare

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
      favoriteNews {
        id
        title
        url
        addedAt
        category
      }
      savedSearches {
        id
        query
        filters {
          categories
          dateRange {
            start
            end
          }
        }
        createdAt
        lastUsed
      }
      preferences {
        categories
        notifications {
          email
          push
          newsletter
        }
        language
        theme
      }
      paymentHistory {
        id
        amount
        currency
        status
        method
        transactionId
        createdAt
        description
        statusLabel
        methodLabel
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

**Parametri:**
- `page`: Numărul paginii (default: 1)
- `limit`: Numărul de utilizatori pe pagină (default: 10, max: 100)
- `search`: Căutare după nume sau email
- `sortField`: Câmpul pentru sortare (`NAME`, `EMAIL`, `CREATED_AT`, `LAST_LOGIN_AT`, `IS_ACTIVE`, `SUBSCRIPTION_TYPE`, `SUBSCRIPTION_STATUS`)
- `sortDirection`: Direcția sortării (`ASC`, `DESC`)
- `filters`: Filtre avansate

**Exemplu de variabile:**
```json
{
  "page": 1,
  "limit": 10,
  "search": "Ion",
  "sortField": "NAME",
  "sortDirection": "ASC",
  "filters": {
    "status": {
      "eq": true
    },
    "subscriptionType": {
      "eq": "PRO_MONTHLY"
    },
    "subscriptionStatus": {
      "eq": "ACTIVE"
    },
    "isAdmin": {
      "eq": false
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
    freeUsers
    proUsers
    enterpriseUsers
  }
}
```

## 🔧 Mutations Disponibile

### 1. Anulare Subscripție

```graphql
mutation CancelSubscription($userId: ID!, $subscriptionId: ID!) {
  adminUsersCancelSubscription(userId: $userId, subscriptionId: $subscriptionId) {
    success
    message
  }
}
```

### 2. Reactivare Subscripție

```graphql
mutation ReactivateSubscription($userId: ID!, $subscriptionId: ID!) {
  adminUsersReactivateSubscription(userId: $userId, subscriptionId: $subscriptionId) {
    success
    message
  }
}
```

### 3. Suspendare Utilizator

```graphql
mutation SuspendUser($userId: ID!) {
  adminUsersSuspendUser(userId: $userId) {
    success
    message
  }
}
```

### 4. Activare Utilizator

```graphql
mutation ActivateUser($userId: ID!) {
  adminUsersActivateUser(userId: $userId) {
    success
    message
  }
}
```

### 5. Ștergere Utilizator

```graphql
mutation DeleteUser($userId: ID!) {
  adminUsersDeleteUser(userId: $userId) {
    success
    message
  }
}
```

### 6. Promovare la Administrator

```graphql
mutation PromoteToAdmin($userId: ID!) {
  adminUsersPromoteToAdmin(userId: $userId) {
    success
    message
  }
}
```

### 7. Demotare de la Administrator

```graphql
mutation DemoteFromAdmin($userId: ID!) {
  adminUsersDemoteFromAdmin(userId: $userId) {
    success
    message
  }
}
```

## 📋 Tipuri de Date

### AdminUser
```graphql
type AdminUser {
  id: ID!
  name: String!
  email: String!
  avatar: String
  createdAt: DateTime!
  lastLoginAt: DateTime
  isActive: Boolean!
  isAdmin: Boolean!
  statusLabel: String!
  subscription: AdminSubscription
  favoriteNews: [AdminFavoriteNews!]!
  savedSearches: [AdminSavedSearch!]!
  preferences: AdminUserPreferences!
  paymentHistory: [AdminPayment!]!
}
```

### AdminSubscription
```graphql
type AdminSubscription {
  id: ID!
  type: AdminSubscriptionType!
  status: AdminSubscriptionStatus!
  startDate: DateTime!
  endDate: DateTime!
  autoRenew: Boolean!
  price: Float!
  currency: String!
  typeLabel: String!
  statusLabel: String!
}
```

### Enums

```graphql
enum AdminSubscriptionType {
  FREE
  PRO_MONTHLY
  PRO_YEARLY
  ENTERPRISE_MONTHLY
  ENTERPRISE_YEARLY
}

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

enum AdminPaymentStatus {
  SUCCESS
  FAILED
  PENDING
  REFUNDED
}

enum AdminPaymentMethod {
  CARD
  PAYPAL
  BANK_TRANSFER
}

enum AdminTheme {
  LIGHT
  DARK
  AUTO
}

enum AdminSortField {
  NAME
  EMAIL
  CREATED_AT
  LAST_LOGIN_AT
  IS_ACTIVE
  SUBSCRIPTION_TYPE
  SUBSCRIPTION_STATUS
}

enum AdminSortDirection {
  ASC
  DESC
}
```

## 🌐 Localizare

Toate label-urile sunt în română:
- **Tipuri de subscripție**: `Gratuit`, `Pro Lunar`, `Pro Anual`, `Enterprise Lunar`, `Enterprise Anual`
- **Statusuri de subscripție**: `Activă`, `Anulată`, `Restantă`, `Neplătită`, `Trial`, `În așteptare`, `Incompletă`, `Trial expirat`
- **Statusuri de plată**: `Succes`, `Eșuată`, `În așteptare`, `Rambursată`
- **Metode de plată**: `Card`, `PayPal`, `Transfer bancar`
- **Status utilizator**: `Activ`, `Inactiv`

## 🔒 Securitate

1. **Verificare Admin**: Toate operațiunile verifică dacă utilizatorul curent este administrator
2. **Validare Input**: Toate input-urile sunt validate folosind Zod schemas
3. **Rate Limiting**: Aplicațiile rate limiting existente
4. **Audit Trail**: Toate operațiunile sunt loggate pentru audit

## 📊 Exemple de Răspunsuri

### Răspuns pentru Lista Utilizatorilor
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
          "lastLoginAt": "2025-10-08T12:39:01.694361Z",
          "isActive": true,
          "isAdmin": true,
          "statusLabel": "Activ",
          "subscription": {
            "id": "sub_123",
            "type": "PRO_MONTHLY",
            "status": "ACTIVE",
            "startDate": "2025-09-21T11:38:32.780765Z",
            "endDate": "2025-10-21T11:38:32.780765Z",
            "autoRenew": true,
            "price": 49.99,
            "currency": "RON",
            "typeLabel": "Pro Lunar",
            "statusLabel": "Activă"
          },
          "favoriteNews": [],
          "savedSearches": [],
          "preferences": {
            "categories": [],
            "notifications": {
              "email": false,
              "push": false,
              "newsletter": false
            },
            "language": "ro",
            "theme": "LIGHT"
          },
          "paymentHistory": []
        }
      ],
      "pagination": {
        "totalCount": 3,
        "totalPages": 1,
        "currentPage": 1,
        "hasNextPage": false,
        "hasPreviousPage": false
      }
    }
  }
}
```

### Răspuns pentru Statistici
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

### Răspuns pentru Mutations
```json
{
  "data": {
    "adminUsersSuspendUser": {
      "success": true,
      "message": "Utilizatorul a fost suspendat cu succes"
    }
  }
}
```

## 🚀 Implementare

API-ul este implementat în:
- **Schema**: `api/src/api/schema.js`
- **Resolvers**: `api/src/api/resolvers/adminUsersResolvers.js`
- **Funcții RPC**: Baza de date Supabase

## 🧪 Testare

Pentru testarea API-ului, rulați:
```bash
node test-admin-users.js
```

Acest script va testa toate funcționalitățile API-ului și va afișa rezultatele.
