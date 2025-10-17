# Subscription Management System

## Overview

This document describes the implementation of the subscription management system for Monitorul Oficial API, integrated with Netopia payment gateway.

## Architecture

### Components

1. **PaymentService** - Handles Netopia payment gateway integration
2. **SubscriptionService** - Manages subscription business logic
3. **GraphQL Schema** - Defines subscription types and operations
4. **Database Schema** - Stores subscription and payment data
5. **Webhook Handler** - Processes Netopia IPN webhooks

### Key Features

- ✅ **Secure Payment Processing** - AES-256-CBC encryption, signature validation
- ✅ **Idempotent Webhook Processing** - Prevents duplicate processing
- ✅ **Atomic Operations** - Subscription activation updates user profile atomically
- ✅ **Comprehensive Audit Logging** - Full payment event tracking
- ✅ **Tokenization Support** - Secure storage of payment methods
- ✅ **Recurring Billing** - Infrastructure for automated charges
- ✅ **Refund Management** - Complete refund workflow
- ✅ **Row-Level Security** - Users can only access their own data
- ✅ **Trial System** - 14-day trials for paid tiers with automatic conversion
- ✅ **Database Schema Separation** - Payment tables moved to `payments` schema
- ✅ **Subscription-Based Content Limits** - Stories pagination limits based on subscription status
- ⚠️ **Partial Admin Queries** - Some admin queries not yet implemented in resolvers

## Database Schema

### Tables (in `payments` schema)

- `payments.subscription_tiers` - Available subscription plans
- `payments.subscriptions` - User subscriptions
- `payments.payment_methods` - Tokenized payment methods
- `payments.orders` - Payment orders
- `payments.refunds` - Refund records
- `payments.payment_logs` - Audit trail
- `payments.webhook_processing` - Idempotency tracking

### Additional Tables

- `profiles.trial_start`, `profiles.trial_end`, `profiles.trial_tier_id` - Trial management fields

### Key Functions (in `payments` schema)

- `payments.activate_subscription()` - Atomically activate subscription and update user profile
- `payments.cancel_subscription()` - Cancel subscription with optional immediate effect
- `payments.process_webhook_idempotent()` - Process webhooks with idempotency protection

### Trial Management Functions

- `is_user_in_trial()` - Check if user is currently in trial period
- `get_user_trial_status()` - Get detailed trial status for user
- `downgrade_from_trial()` - Downgrade user from trial to free tier

## GraphQL API

### Queries

```graphql
# Get user profile with complete subscription information
me: User  # Profile now includes subscription data

# Get available subscription tiers
getSubscriptionTiers: [SubscriptionTier!]!

# Get user's current subscription
getMySubscription: Subscription

# Get user's payment methods
getMyPaymentMethods: [PaymentMethod!]!

# Get subscription usage
getSubscriptionUsage: SubscriptionUsage

# Get order details
getOrder(orderId: ID!): Order

# Get user's orders
getMyOrders(limit: Int, offset: Int): [Order!]!

# Admin queries
getSubscription(subscriptionId: ID!): Subscription
getOrderDetails(orderId: ID!): Order
getPaymentLogs(
  orderId: ID
  subscriptionId: ID
  eventType: PaymentEventType
  limit: Int
  offset: Int
): [PaymentLog!]!
getRefunds(orderId: ID, limit: Int, offset: Int): [Refund!]!

# Monitoring & Admin Dashboard
getPaymentMetrics(startDate: String, endDate: String): PaymentMetrics!
getOrphanPayments(limit: Int, offset: Int): [PaymentLog!]!
getWebhookStatus(webhookId: String): WebhookStatus
```

### Enhanced Profile Type

The `Profile` type now includes comprehensive subscription information:

```graphql
type Profile {
  id: ID!
  subscriptionTier: String!
  displayName: String
  avatarUrl: String
  preferences: UserPreferences
  trialStatus: TrialStatus
  isNewsletterSubscribed: Boolean!
  
  # NEW: Complete subscription information
  activeSubscription: Subscription
  subscriptionUsage: SubscriptionUsage
  paymentMethods: [PaymentMethod!]!
  subscriptionHistory: [Subscription!]!
  
  createdAt: String!
  updatedAt: String
}
```

### Mutations

```graphql
# Start checkout process
startCheckout(input: StartCheckoutInput!): CheckoutSession!

# Confirm payment
confirmPayment(orderId: ID!): Order!

# Reactivate subscription
reactivateSubscription(input: ReactivateSubscriptionInput!): Subscription!

# Cancel subscription
cancelSubscription(input: CancelSubscriptionInput!): Subscription!

# Update payment method
updatePaymentMethod(input: UpdatePaymentMethodInput!): PaymentMethod!

# Admin operations
adminRefund(input: AdminRefundInput!): Refund!
adminCancelSubscription(subscriptionId: ID!, reason: String): Subscription!

# Webhook handling (internal)
webhookNetopiaIPN(payload: JSON!): Boolean!
```

## Payment Flow

### 1. Checkout Process

```
User → startCheckout(tierId) → PaymentService.createOrder() → Netopia API
     ← CheckoutSession { orderId, checkoutUrl, expiresAt }
```

### 2. Payment Completion

```
User → Netopia Checkout → Payment Success → Redirect to success page
     → confirmPayment(orderId) → Check order status
```

### 3. Webhook Processing

```
Netopia → POST /webhook/netopia/ipn → WebhookHandler → SubscriptionService
       ← HTTP 200 (immediate response)
       → Process payment event → Update subscription → Update user profile
```

### 4. Trial System

```
User → Start trial → Set trial_start, trial_end, trial_tier_id in profiles
     → Convert trial to paid → Cancel trial subscription → Create paid subscription
     → Trial expires → Downgrade to free tier
```

## Security Features

### Authentication & Authorization

- JWT validation for all user operations
- Internal API key for service-to-service calls
- Role-based access for admin operations
- User isolation (users can only access their own data)

### Payment Security

- HTTPS only for all payment endpoints
- Netopia signature validation on all webhooks
- Timestamp validation (reject webhooks older than 5 minutes)
- IP allowlist for webhook endpoints (if available)
- AES-256-CBC payload encryption
- Idempotency protection for webhook processing

### Data Protection

- PCI compliance (no card data storage, only tokens)
- Encryption at rest for sensitive fields
- Comprehensive audit logging
- Data retention policies
- PII protection in logs

## Subscription Tiers

### Current Tiers

1. **Free** - `free`
   - Price: 0.00 RON
   - Interval: LIFETIME
   - Features: Basic access, Limited requests (5/zi), Max 10 stories per page
   - Trial: No trial

2. **Pro Monthly** - `pro-monthly`
   - Price: 29.99 RON
   - Interval: MONTHLY
   - Features: Unlimited requests, Advanced analytics, Priority support, PDF export, Up to 100 stories per page
   - Trial: 14 days
   - Popular: Yes

3. **Pro Yearly** - `pro-yearly`
   - Price: 299.99 RON (2 months free)
   - Interval: YEARLY
   - Features: All Pro features + 2 months free, Up to 100 stories per page
   - Trial: 14 days

4. **Enterprise Monthly** - `enterprise-monthly`
   - Price: 99.99 RON
   - Interval: MONTHLY
   - Features: All Pro features + Custom integrations + Dedicated support + Custom API, Up to 100 stories per page
   - Trial: 14 days

5. **Enterprise Yearly** - `enterprise-yearly`
   - Price: 999.99 RON (2 months free)
   - Interval: YEARLY
   - Features: All Enterprise features + 2 months free, Up to 100 stories per page
   - Trial: 14 days

## Content Access Control

### Stories Pagination Limits

The system implements subscription-based content access control for stories pagination:

#### Implementation Details

- **Free Users**: Maximum 10 stories per page
- **Trial Users**: Maximum 100 stories per page (trial grants full pagination benefits)
- **Paid Subscribers**: Maximum 100 stories per page

#### Affected Endpoints

The following GraphQL queries enforce subscription-based pagination limits:

- `getStiri(limit: Int)`
- `searchStiri(query: String!, limit: Int)`
- `searchStiriByKeywords(query: String, keywords: [String!], limit: Int)`
- `getStiriByCategory(category: String!, limit: Int)`
- `getStiriByCategorySlug(slug: String!, limit: Int)`

#### Error Handling

When a user without an active subscription attempts to request more than 10 stories:

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

#### Technical Implementation

The validation is implemented in the GraphQL resolvers:

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

#### Business Logic

1. **Authentication Check**: First verifies if user is authenticated
2. **Subscription Validation**: Checks for active subscription using `SubscriptionService.getUserSubscription()`
3. **Trial Validation**: If no active subscription, checks for active trial using `UserService.checkTrialStatus()`
4. **Status Verification**: Ensures either subscription status is `ACTIVE` or trial status is `isTrial: true`
5. **Graceful Degradation**: Users without subscriptions or trials can still access up to 10 stories per page

#### Benefits

- **Monetization**: Encourages users to upgrade for better pagination experience
- **Performance**: Limits resource usage for free users
- **User Experience**: Clear error messages guide users to upgrade
- **Scalability**: Prevents abuse of high-limit requests

## Environment Configuration

### Required Environment Variables

```bash
# Netopia Configuration
NETOPIA_SANDBOX_API_KEY=your_sandbox_api_key
NETOPIA_SANDBOX_SECRET_KEY=your_sandbox_secret_key
NETOPIA_PRODUCTION_API_KEY=your_production_api_key
NETOPIA_PRODUCTION_SECRET_KEY=your_production_secret_key

# Webhook Configuration
NETOPIA_WEBHOOK_URL=https://your-domain.com/webhook/netopia/ipn
NETOPIA_REDIRECT_URL=https://your-domain.com/payment/success

# Security
INTERNAL_API_KEY=your_secure_internal_api_key
```

## Testing

### Sandbox Testing

1. **Successful Payment Flow**
   - Create subscription tier
   - Start checkout with valid tier
   - Complete payment in Netopia sandbox
   - Verify IPN received and processed
   - Confirm subscription activated

2. **3DS Authentication Flow**
   - Start checkout with 3DS-enabled card
   - Complete 3DS challenge
   - Verify payment success
   - Confirm subscription activated

3. **Failed Payment Handling**
   - Start checkout with invalid card
   - Verify payment failure
   - Check order status updated
   - Verify subscription remains pending

4. **Webhook Processing**
   - Simulate Netopia IPN webhook
   - Verify signature validation
   - Check idempotency handling
   - Test duplicate webhook handling

### Test Cards

- **Successful**: 4111111111111111
- **Declined**: 4000000000000002
- **3DS Required**: 4000000000003220
- **Insufficient Funds**: 4000000000009995

## Deployment

### Database Migration

Run the subscription management migrations in order:

```sql
-- Apply all subscription management migrations
\i database/migrations/049_subscription_management.sql
\i database/migrations/050_add_subscription_tier_fields.sql
\i database/migrations/051_fix_subscription_tiers_for_trial_model.sql
\i database/migrations/052_move_payment_tables_to_payments_schema.sql
```

**Note**: Migration 052 moves all payment tables to the `payments` schema and creates views in the `public` schema for backward compatibility.

### Environment Setup

1. Copy `env.subscription.example` to `.env`
2. Configure Netopia API keys
3. Set webhook URLs
4. Configure internal API key
5. Deploy to Vercel

### Webhook Configuration

Configure Netopia webhook URL in your Netopia dashboard:
- **URL**: `https://your-domain.com/webhook/netopia/ipn`
- **Events**: Payment succeeded, Payment failed, Payment canceled
- **Method**: POST
- **Content-Type**: application/json
- **Headers**: `X-Internal-API-Key: your_internal_api_key`

### Webhook Endpoints

- `POST /webhook/netopia/ipn` - Main webhook endpoint for Netopia IPN
- `GET /webhook/health` - Health check for webhook service
- `POST /webhook/test` - Test webhook endpoint (development only)

## Monitoring & Alerting

### Key Metrics

- Payment success/failure rates
- Webhook processing times
- Subscription activation rates
- Refund processing times
- Error rates by endpoint

### Alerts

- Failed payment alerts
- Webhook processing failures
- High error rates
- Database connection issues
- External API failures

## Troubleshooting

### Common Issues

1. **Webhook Not Received**
   - Check Netopia webhook configuration
   - Verify webhook URL is accessible
   - Check firewall/security group settings

2. **Payment Processing Failures**
   - Verify API keys are correct
   - Check Netopia account status
   - Review payment logs

3. **Subscription Not Activated**
   - Check webhook processing logs
   - Verify order status in database
   - Review payment event logs

### Debug Mode

Enable debug logging by setting:
```bash
PAYMENT_LOG_LEVEL=debug
WEBHOOK_LOG_LEVEL=debug
```

## API Examples

### Start Checkout

```graphql
mutation StartCheckout {
  startCheckout(input: {
    tierId: "pro-tier-id"
    customerEmail: "user@example.com"
    billingAddress: {
      firstName: "John"
      lastName: "Doe"
      address: "123 Main St"
      city: "Bucharest"
      country: "RO"
      zipCode: "010001"
    }
  }) {
    orderId
    checkoutUrl
    expiresAt
  }
}
```

### Get Subscription

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
  }
}
```

### Cancel Subscription

```graphql
mutation CancelSubscription {
  cancelSubscription(input: {
    subscriptionId: "sub-id"
    immediate: false
    refund: false
    reason: "User requested"
  }) {
    id
    status
    cancelAtPeriodEnd
  }
}
```

## Security Checklist

- [ ] JWT validation enabled
- [ ] Internal API key configured
- [ ] HTTPS enforced
- [ ] Signature validation working
- [ ] Timestamp validation enabled
- [ ] Idempotency protection active
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] Input validation active
- [ ] Error handling secure
- [ ] Monitoring configured
- [ ] Alerting set up

## Support

For issues related to the subscription system:

1. Check the payment logs in the database
2. Review webhook processing logs
3. Verify Netopia account status
4. Check environment configuration
5. Review security settings

## Implementation Status

### ✅ Completed Features

- PaymentService with Netopia v2.x integration
- SubscriptionService with full business logic
- WebhookHandler with async processing
- Database schema with payments schema separation
- Trial system with 14-day trials
- GraphQL schema definitions
- Basic resolvers for core functionality

### ⚠️ Missing Implementations

The following GraphQL queries/mutations are defined in the schema but not yet implemented in resolvers:

- `getSubscription(subscriptionId: ID!): Subscription`
- `getOrderDetails(orderId: ID!): Order`
- `getPaymentLogs(...): [PaymentLog!]!`
- `getRefunds(...): [Refund!]!`

These should be implemented for complete admin functionality.

### 🔧 Database Migrations Applied

- Migration 049: Initial subscription management tables
- Migration 050: Added description, isPopular, trialDays fields
- Migration 051: Fixed subscription tiers for trial model
- Migration 052: Moved payment tables to payments schema

## Changelog

### v1.1.0
- **NEW**: Subscription-based content access control for stories pagination
- **NEW**: Stories pagination limits (10 for free users, 100 for paid subscribers and trial users)
- **NEW**: Trial users now have full pagination access (same as paid subscribers)
- **NEW**: Enhanced error handling with subscription and trial validation
- **NEW**: Updated documentation for content access control
- **IMPROVED**: Better user experience with clear upgrade prompts

### v1.0.0
- Initial implementation
- Netopia payment integration
- Subscription management
- Webhook processing
- Refund handling
- Security features
- Audit logging
- Trial system
- Database schema separation
