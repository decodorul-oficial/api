# Extensii de Abonament pentru GetMyProfile

## Prezentare Generală

Query-ul `GetMyProfile` a fost extins cu proprietăți complete de abonament pentru a permite aplicației web să afișeze informații detaliate despre abonamentul utilizatorului în pagina de profil.

## Proprietăți Noi Adăugate

### 1. `activeSubscription: Subscription`

**Descriere**: Abonamentul activ al utilizatorului (dacă există).

**Când este null**: 
- Utilizatorul nu are abonament activ
- Utilizatorul are doar abonament gratuit
- Eroare la încărcarea datelor

**Utilizare în aplicația web**:
```javascript
if (profile.activeSubscription) {
  // Afișează detaliile abonamentului activ
  console.log(`Abonament: ${profile.activeSubscription.tier.displayName}`);
  console.log(`Status: ${profile.activeSubscription.status}`);
  console.log(`Perioada: ${profile.activeSubscription.currentPeriodStart} - ${profile.activeSubscription.currentPeriodEnd}`);
}
```

### 2. `subscriptionUsage: SubscriptionUsage`

**Descriere**: Informații despre utilizarea curentă a abonamentului.

**Când este null**:
- Utilizatorul nu are abonament activ
- Eroare la încărcarea datelor de utilizare

**Utilizare în aplicația web**:
```javascript
if (profile.subscriptionUsage) {
  // Afișează progress bar pentru utilizarea cererilor
  const usage = profile.subscriptionUsage;
  const percentage = (usage.requestsUsed / usage.requestsLimit) * 100;
  console.log(`Cereri folosite: ${usage.requestsUsed}/${usage.requestsLimit} (${percentage.toFixed(1)}%)`);
  console.log(`Cereri rămase: ${usage.requestsRemaining}`);
}
```

### 3. `paymentMethods: [PaymentMethod!]!`

**Descriere**: Lista metodelor de plată salvate ale utilizatorului.

**Când este array gol**: 
- Utilizatorul nu are metode de plată salvate
- Eroare la încărcarea datelor

**Utilizare în aplicația web**:
```javascript
// Afișează cardurile salvate
profile.paymentMethods.forEach(method => {
  console.log(`Card: ${method.brand} ****${method.last4}`);
  console.log(`Expiră: ${method.expMonth}/${method.expYear}`);
  if (method.isDefault) {
    console.log('(Metodă implicită)');
  }
});
```

### 4. `subscriptionHistory: [Subscription!]!`

**Descriere**: Istoricul complet al abonamentelor utilizatorului.

**Când este array gol**: 
- Utilizatorul nu are istoric de abonamente
- Eroare la încărcarea datelor

**Utilizare în aplicația web**:
```javascript
// Afișează istoricul abonamentelor
profile.subscriptionHistory.forEach(subscription => {
  console.log(`Abonament: ${subscription.tier.displayName}`);
  console.log(`Status: ${subscription.status}`);
  console.log(`Creat: ${subscription.createdAt}`);
  console.log(`Perioada: ${subscription.currentPeriodStart} - ${subscription.currentPeriodEnd}`);
});
```

## Query Complet pentru GetMyProfile

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
      # Subscription information
      activeSubscription {
        id
        userId
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
        status
        netopiaOrderId
        netopiaToken
        currentPeriodStart
        currentPeriodEnd
        cancelAtPeriodEnd
        canceledAt
        trialStart
        trialEnd
        metadata
        createdAt
        updatedAt
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
        userId
        netopiaToken
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
        userId
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
        status
        netopiaOrderId
        netopiaToken
        currentPeriodStart
        currentPeriodEnd
        cancelAtPeriodEnd
        canceledAt
        trialStart
        trialEnd
        metadata
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
}
```

## Exemple de Răspunsuri

### Utilizator cu Abonament Activ

```json
{
  "data": {
    "me": {
      "id": "user-123",
      "email": "user@example.com",
      "profile": {
        "id": "profile-123",
        "subscriptionTier": "pro-monthly",
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "isNewsletterSubscribed": true,
        "trialStatus": {
          "isTrial": false,
          "hasTrial": false,
          "trialStart": null,
          "trialEnd": null,
          "tierId": null,
          "daysRemaining": null,
          "expired": false
        },
        "preferences": {
          "preferredCategories": ["politics", "economy"],
          "notificationSettings": {
            "email": true,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-15T10:30:00Z"
        },
        "activeSubscription": {
          "id": "sub-123",
          "userId": "user-123",
          "tier": {
            "id": "tier-pro-monthly",
            "name": "pro-monthly",
            "displayName": "Pro Lunar",
            "description": "Abonament Pro cu acces complet lunar",
            "price": 37,
            "currency": "RON",
            "interval": "MONTHLY",
            "features": ["Acces nelimitat", "Căutare avansată"],
            "isPopular": true,
            "trialDays": 14,
            "isActive": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          },
          "status": "ACTIVE",
          "netopiaOrderId": "order-123",
          "netopiaToken": "token-123",
          "currentPeriodStart": "2024-01-01T00:00:00Z",
          "currentPeriodEnd": "2024-02-01T00:00:00Z",
          "cancelAtPeriodEnd": false,
          "canceledAt": null,
          "trialStart": null,
          "trialEnd": null,
          "metadata": {},
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-01T00:00:00Z"
        },
        "subscriptionUsage": {
          "subscriptionId": "sub-123",
          "currentPeriodStart": "2024-01-01T00:00:00Z",
          "currentPeriodEnd": "2024-02-01T00:00:00Z",
          "requestsUsed": 150,
          "requestsLimit": 1000,
          "requestsRemaining": 850,
          "lastResetAt": "2024-01-01T00:00:00Z"
        },
        "paymentMethods": [
          {
            "id": "pm-123",
            "userId": "user-123",
            "netopiaToken": "token-123",
            "last4": "1234",
            "brand": "Visa",
            "expMonth": 12,
            "expYear": 2025,
            "isDefault": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          }
        ],
        "subscriptionHistory": [
          {
            "id": "sub-123",
            "userId": "user-123",
            "tier": {
              "id": "tier-pro-monthly",
              "name": "pro-monthly",
              "displayName": "Pro Lunar",
              "description": "Abonament Pro cu acces complet lunar",
              "price": 37,
              "currency": "RON",
              "interval": "MONTHLY",
              "features": ["Acces nelimitat", "Căutare avansată"],
              "isPopular": true,
              "trialDays": 14,
              "isActive": true,
              "createdAt": "2024-01-01T00:00:00Z",
              "updatedAt": "2024-01-01T00:00:00Z"
            },
            "status": "ACTIVE",
            "netopiaOrderId": "order-123",
            "netopiaToken": "token-123",
            "currentPeriodStart": "2024-01-01T00:00:00Z",
            "currentPeriodEnd": "2024-02-01T00:00:00Z",
            "cancelAtPeriodEnd": false,
            "canceledAt": null,
            "trialStart": null,
            "trialEnd": null,
            "metadata": {},
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          }
        ],
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    }
  }
}
```

### Utilizator fără Abonament Activ

```json
{
  "data": {
    "me": {
      "id": "user-456",
      "email": "user2@example.com",
      "profile": {
        "id": "profile-456",
        "subscriptionTier": "free",
        "displayName": "Jane Doe",
        "avatarUrl": null,
        "isNewsletterSubscribed": false,
        "trialStatus": {
          "isTrial": false,
          "hasTrial": false,
          "trialStart": null,
          "trialEnd": null,
          "tierId": null,
          "daysRemaining": null,
          "expired": false
        },
        "preferences": {
          "preferredCategories": [],
          "notificationSettings": {
            "email": false,
            "push": false
          },
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-01T00:00:00Z"
        },
        "activeSubscription": null,
        "subscriptionUsage": null,
        "paymentMethods": [],
        "subscriptionHistory": [],
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    }
  }
}
```

## Beneficii pentru Aplicația Web

1. **Informații Complete**: Toate datele necesare pentru pagina de profil într-un singur request
2. **Performanță**: Un singur request în loc de multiple request-uri separate
3. **Consistență**: Toate datele sunt sincronizate și actualizate în același timp
4. **Flexibilitate**: Poți alege ce proprietăți să incluzi în query
5. **Ușor de Folosit**: Structura clară și bine documentată

## Implementare Tehnică

- **Resolver-i**: Toate proprietățile sunt implementate în `Profile` type resolvers
- **Transformare Date**: Datele din baza de date sunt transformate pentru a se potrivi cu schema GraphQL
- **Gestionare Erori**: Toate resolver-ii gestionează erorile și returnează valori default
- **Optimizare**: Query-urile sunt optimizate pentru performanță
- **Compatibilitate**: Suportă atât datele noi cât și cele vechi

## Concluzie

Extensiile de abonament pentru `GetMyProfile` oferă o soluție completă pentru afișarea informațiilor de abonament în aplicația web, permițând dezvoltatorilor să creeze o experiență utilizator bogată și informativă în pagina de profil.