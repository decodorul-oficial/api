# Subscription-Based Content Limits

## Overview

This document describes the implementation of subscription-based content access control for the Monitorul Oficial API, specifically focusing on stories pagination limits.

## Feature Description

The API implements content access control based on user subscription status, limiting the number of stories that can be requested per page for users without active subscriptions.

### Business Logic

- **Free Users**: Maximum 10 stories per page
- **Trial Users**: Maximum 100 stories per page (trial grants full pagination benefits)
- **Paid Subscribers**: Maximum 100 stories per page

## Implementation Details

### Affected GraphQL Queries

The following queries enforce subscription-based access control:

#### Pagination Limits
1. `getStiri(limit: Int)` - Main stories listing
2. `searchStiri(query: String!, limit: Int)` - Story search functionality
3. `searchStiriByKeywords(query: String, keywords: [String!], limit: Int)` - Advanced keyword search
4. `getStiriByCategory(category: String!, limit: Int)` - Stories by category

#### Full Access Control (Trial/Subscription Required)
5. `getCategories(limit: Int)` - Categories listing (requires trial or active subscription)
6. `getStiriByCategorySlug(slug: String!, limit: Int, offset: Int, orderBy: String, orderDirection: String)` - Stories by category slug (requires trial or active subscription)

### Validation Logic

```javascript
// Check subscription/trial status for limit > 10
if (normalizedArgs.limit && normalizedArgs.limit > 10) {
  if (!context.user) {
    throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }

  // Check if user has active subscription or trial
  const hasAccess = await hasHighLimitAccess(context, subscriptionService, userService);
  if (!hasAccess) {
    throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ sau trial', {
      extensions: { 
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Această funcționalitate necesită un abonament activ sau trial. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină.'
      }
    });
  }
}
```

### Error Codes

| Code | Description | When Triggered |
|------|-------------|----------------|
| `UNAUTHENTICATED` | User not authenticated | When limit > 10 and no user context |
| `SUBSCRIPTION_REQUIRED` | Active subscription or trial required | When limit > 10 and no active subscription or trial, or when accessing getCategories without trial/subscription |

## getCategories Access Control

### Overview

The `getCategories` query requires users to have either an active trial or an active subscription. This endpoint is completely restricted for unauthenticated users and users without valid subscriptions.

## getStiriByCategorySlug Access Control

### Overview

The `getStiriByCategorySlug` query requires users to have either an active trial or an active subscription. This endpoint is completely restricted for unauthenticated users and users without valid subscriptions. Unlike other story queries that have pagination limits, this endpoint requires full subscription access.

### Access Requirements

- **Unauthenticated Users**: ❌ No access (returns `UNAUTHENTICATED` error)
- **Authenticated Users without Subscription**: ❌ No access (returns `SUBSCRIPTION_REQUIRED` error)
- **Users in Trial Period**: ✅ Full access
- **Users with Active Subscription**: ✅ Full access

### getStiriByCategorySlug Access Requirements

- **Unauthenticated Users**: ❌ No access (returns `UNAUTHENTICATED` error)
- **Authenticated Users without Subscription**: ❌ No access (returns `SUBSCRIPTION_REQUIRED` error)
- **Users in Trial Period**: ✅ Full access
- **Users with Active Subscription**: ✅ Full access

### Implementation

```javascript
// getCategories resolver
getCategories: async (parent, { limit }, context) => {
  try {
    // Verifică că utilizatorul are trial activ sau abonament valid
    requireTrialOrSubscription(context, true);
    
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 100;
    return await stiriService.getCategories({ limit: safeLimit });
  } catch (error) {
    throw error;
  }
},

// getStiriByCategorySlug resolver
getStiriByCategorySlug: async (parent, args, context) => {
  try {
    // Verifică că utilizatorul are trial activ sau abonament valid
    requireTrialOrSubscription(context, true);
    
    const { slug, limit, offset, orderBy, orderDirection } = args || {};
    const normalizedArgs = {
      limit,
      offset,
      orderBy: orderBy === 'publicationDate'
        ? 'publication_date'
        : orderBy === 'createdAt'
          ? 'created_at'
          : orderBy,
      orderDirection
    };

    const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
    return await stiriService.getStiriByCategorySlug({ slug, ...validatedArgs });
  } catch (error) {
    throw error;
  }
},
```

### Error Response

When access is denied, the API returns:

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

## API Examples

### getStiriByCategorySlug Examples

#### Successful Request (Trial/Subscription User)
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

**Response:**
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

#### Failed Request (Unauthenticated User)
```graphql
query GetStiriByCategorySlug {
  getStiriByCategorySlug(
    slug: "legislative"
    limit: 10
  ) {
    stiri {
      id
      title
    }
  }
}
```

**Response:**
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

#### Failed Request (Authenticated User without Subscription)
```graphql
query GetStiriByCategorySlug {
  getStiriByCategorySlug(
    slug: "legislative"
    limit: 10
  ) {
    stiri {
      id
      title
    }
  }
}
```

**Response:**
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

### getCategories Examples

#### Successful Request (Trial/Subscription User)
```graphql
query GetCategories {
  getCategories(limit: 50) {
    name
    slug
    count
  }
}
```

**Response:**
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
      }
    ]
  }
}
```

#### Failed Request (Unauthenticated User)
```graphql
query GetCategories {
  getCategories(limit: 10) {
    name
    slug
    count
  }
}
```

**Response:**
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

#### Failed Request (Authenticated User without Subscription)
```graphql
query GetCategories {
  getCategories(limit: 10) {
    name
    slug
    count
  }
}
```

**Response:**
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

### Successful Requests

#### Free User - Within Limits
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

**Response:**
```json
{
  "data": {
    "getStiri": {
      "stiri": [
        {
          "id": "1",
          "title": "Știre 1",
          "publicationDate": "2024-01-01T00:00:00Z"
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

#### Trial User - High Limits
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

#### Paid Subscriber - High Limits
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

**Response:**
```json
{
  "data": {
    "getStiri": {
      "stiri": [
        // 50 stories returned
      ],
      "pagination": {
        "totalCount": 100,
        "hasNextPage": true
      }
    }
  }
}
```

### Error Cases

#### Unauthenticated User - High Limit
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

**Response:**
```json
{
  "errors": [
    {
      "message": "Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

#### Authenticated User Without Subscription - High Limit
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

**Response:**
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

## Frontend Integration

### Checking Subscription Status

```javascript
async function checkSubscriptionStatus() {
  try {
    const result = await client.query({
      query: gql`
        query GetMyProfile {
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
      `
    });
    
    const profile = result.data.me.profile;
    const hasActiveSubscription = profile.activeSubscription?.status === 'ACTIVE';
    
    return {
      maxLimit: hasActiveSubscription ? 100 : 10,
      subscriptionTier: profile.subscriptionTier,
      isSubscribed: hasActiveSubscription
    };
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return { maxLimit: 10, subscriptionTier: 'free', isSubscribed: false };
  }
}
```

### Handling Subscription Errors

```javascript
async function getStories(limit = 10) {
  try {
    const result = await client.query({
      query: gql`
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
      `,
      variables: { limit }
    });
    
    return result.data.getStiri;
  } catch (error) {
    if (error.graphQLErrors) {
      const graphQLError = error.graphQLErrors[0];
      
      if (graphQLError.extensions?.code === 'SUBSCRIPTION_REQUIRED') {
        // Show upgrade prompt
        showUpgradeModal();
        return null;
      }
      
      if (graphQLError.extensions?.code === 'UNAUTHENTICATED') {
        // Redirect to login
        redirectToLogin();
        return null;
      }
    }
    
    throw error;
  }
}
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';

function useStoriesPagination() {
  const [maxLimit, setMaxLimit] = useState(10);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSubscription() {
      try {
        const status = await checkSubscriptionStatus();
        setMaxLimit(status.maxLimit);
        setIsSubscribed(status.isSubscribed);
      } catch (error) {
        console.error('Error checking subscription:', error);
      } finally {
        setLoading(false);
      }
    }

    checkSubscription();
  }, []);

  return { maxLimit, isSubscribed, loading };
}

// Usage in component
function StoriesList() {
  const { maxLimit, isSubscribed, loading } = useStoriesPagination();
  const [limit, setLimit] = useState(10);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <select 
        value={limit} 
        onChange={(e) => setLimit(parseInt(e.target.value))}
        max={maxLimit}
      >
        {Array.from({ length: maxLimit }, (_, i) => i + 1)
          .filter(n => n <= maxLimit)
          .map(n => (
            <option key={n} value={n}>{n} stories per page</option>
          ))}
      </select>
      
      {!isSubscribed && limit > 10 && (
        <div className="upgrade-prompt">
          <p>Upgrade to Pro to view more than 10 stories per page!</p>
          <button onClick={() => showUpgradeModal()}>
            Upgrade Now
          </button>
        </div>
      )}
    </div>
  );
}
```

## Testing

### Test Cases

#### Pagination Limits (getStiri, searchStiri, etc.)
1. **Unauthenticated User**
   - ✅ `limit: 5` - Should work
   - ✅ `limit: 10` - Should work
   - ❌ `limit: 15` - Should return `UNAUTHENTICATED` error

2. **Authenticated User Without Subscription**
   - ✅ `limit: 5` - Should work
   - ✅ `limit: 10` - Should work
   - ❌ `limit: 15` - Should return `SUBSCRIPTION_REQUIRED` error

3. **User with Active Subscription**
   - ✅ `limit: 5` - Should work
   - ✅ `limit: 10` - Should work
   - ✅ `limit: 50` - Should work
   - ✅ `limit: 100` - Should work
   - ❌ `limit: 150` - Should return validation error (exceeds max limit)

#### Full Access Control (getCategories, getStiriByCategorySlug)
4. **Unauthenticated User**
   - ❌ Any request - Should return `UNAUTHENTICATED` error

5. **Authenticated User Without Subscription**
   - ❌ Any request - Should return `SUBSCRIPTION_REQUIRED` error

6. **User in Trial Period**
   - ✅ Any valid request - Should work

7. **User with Active Subscription**
   - ✅ Any valid request - Should work

### Test Script

```javascript
// Test subscription limits
async function testSubscriptionLimits() {
  const testCases = [
    { limit: 5, shouldWork: true, description: 'Free user - within limits' },
    { limit: 10, shouldWork: true, description: 'Free user - at limit' },
    { limit: 15, shouldWork: false, description: 'Free user - exceeds limit' },
    { limit: 50, shouldWork: false, description: 'Free user - way over limit' }
  ];

  for (const testCase of testCases) {
    try {
      const result = await getStories(testCase.limit);
      if (testCase.shouldWork) {
        console.log(`✅ ${testCase.description}: PASS`);
      } else {
        console.log(`❌ ${testCase.description}: FAIL - Should have thrown error`);
      }
    } catch (error) {
      if (!testCase.shouldWork) {
        console.log(`✅ ${testCase.description}: PASS - Correctly blocked`);
      } else {
        console.log(`❌ ${testCase.description}: FAIL - ${error.message}`);
      }
    }
  }
}

// Test getCategories and getStiriByCategorySlug access control
async function testFullAccessControl() {
  const testCases = [
    { 
      userType: 'unauthenticated', 
      shouldWork: false, 
      expectedError: 'UNAUTHENTICATED',
      description: 'Unauthenticated user - should be blocked' 
    },
    { 
      userType: 'authenticated_no_subscription', 
      shouldWork: false, 
      expectedError: 'SUBSCRIPTION_REQUIRED',
      description: 'Authenticated user without subscription - should be blocked' 
    },
    { 
      userType: 'trial_user', 
      shouldWork: true, 
      expectedError: null,
      description: 'Trial user - should work' 
    },
    { 
      userType: 'subscribed_user', 
      shouldWork: true, 
      expectedError: null,
      description: 'Subscribed user - should work' 
    }
  ];

  // Test getCategories
  console.log('Testing getCategories...');
  for (const testCase of testCases) {
    try {
      const result = await getCategories(10);
      if (testCase.shouldWork) {
        console.log(`✅ getCategories - ${testCase.description}: PASS`);
      } else {
        console.log(`❌ getCategories - ${testCase.description}: FAIL - Should have thrown error`);
      }
    } catch (error) {
      if (!testCase.shouldWork) {
        const hasCorrectError = error.extensions?.code === testCase.expectedError;
        console.log(`✅ getCategories - ${testCase.description}: PASS - Correctly blocked (${hasCorrectError ? 'correct error' : 'wrong error'})`);
      } else {
        console.log(`❌ getCategories - ${testCase.description}: FAIL - ${error.message}`);
      }
    }
  }

  // Test getStiriByCategorySlug
  console.log('Testing getStiriByCategorySlug...');
  for (const testCase of testCases) {
    try {
      const result = await getStiriByCategorySlug('legislative', 10);
      if (testCase.shouldWork) {
        console.log(`✅ getStiriByCategorySlug - ${testCase.description}: PASS`);
      } else {
        console.log(`❌ getStiriByCategorySlug - ${testCase.description}: FAIL - Should have thrown error`);
      }
    } catch (error) {
      if (!testCase.shouldWork) {
        const hasCorrectError = error.extensions?.code === testCase.expectedError;
        console.log(`✅ getStiriByCategorySlug - ${testCase.description}: PASS - Correctly blocked (${hasCorrectError ? 'correct error' : 'wrong error'})`);
      } else {
        console.log(`❌ getStiriByCategorySlug - ${testCase.description}: FAIL - ${error.message}`);
      }
    }
  }
}
```

## Configuration

### Environment Variables

No additional environment variables are required for this feature. It uses the existing subscription system configuration.

### Database Requirements

The feature relies on the existing subscription tables:
- `payments.subscriptions` - For checking active subscriptions
- `profiles` - For user profile information

## Monitoring

### Metrics to Track

1. **Subscription Limit Hits**
   - Number of requests blocked due to subscription limits
   - Conversion rate from blocked requests to upgrades

2. **Error Rates**
   - `UNAUTHENTICATED` errors for high limits
   - `SUBSCRIPTION_REQUIRED` errors for high limits

3. **Usage Patterns**
   - Average limit requested by subscription tier
   - Most common limit values

### Logging

The system logs subscription validation attempts:

```javascript
console.log(`Subscription validation: User ${userId}, Limit: ${limit}, Has Subscription: ${hasSubscription}`);
```

## Security Considerations

1. **Authentication Required**: Users must be authenticated to access higher limits
2. **Subscription Validation**: Active subscription status is verified on each request
3. **Rate Limiting**: Existing rate limiting still applies
4. **Input Validation**: Limit values are validated against schema constraints

## Future Enhancements

1. **Gradual Limits**: Different limits for different subscription tiers
2. **Time-based Limits**: Higher limits during certain hours
3. **Feature Flags**: Ability to enable/disable limits per environment
4. **Analytics**: Detailed usage analytics for subscription optimization

## Troubleshooting

### Common Issues

1. **"Subscription not found" errors**
   - Check if user has active subscription in database
   - Verify subscription status is 'ACTIVE'

2. **Unexpected blocking of paid users**
   - Check subscription status in database
   - Verify user context is properly set

3. **Performance issues with high limits**
   - Monitor database query performance
   - Consider implementing caching for subscription status

### Debug Mode

Enable debug logging by setting:
```bash
SUBSCRIPTION_LIMITS_DEBUG=true
```

This will log detailed information about subscription validation attempts.
