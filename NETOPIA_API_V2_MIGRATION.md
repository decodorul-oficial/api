# NETOPIA API v2 Migration Guide

## Overview
This document outlines the migration from NETOPIA classic API to NETOPIA API v2 for the Monitorul Oficial payment system.

## Changes Made

### 1. PaymentService.js - Complete Refactor
- **Removed**: Classic API encryption/decryption methods
- **Removed**: HMAC signature generation and validation
- **Removed**: Certificate-based authentication
- **Added**: Simple API Key authentication
- **Updated**: All endpoints to use `/v2/` prefix
- **Updated**: Base URLs to use official NETOPIA API v2 endpoints

### 2. Environment Configuration
- **Removed**: `NETOPIA_SANDBOX_SECRET_KEY` and `NETOPIA_PRODUCTION_SECRET_KEY`
- **Removed**: `NETOPIA_SIGNATURE`
- **Updated**: `env.example` with correct API v2 configuration
- **Added**: Clear documentation for API Key setup

### 3. Webhook Handler Updates
- **Simplified**: Webhook processing (no more signature validation)
- **Updated**: Direct JSON payload processing
- **Removed**: Complex encryption/decryption logic

### 4. SubscriptionService Integration
- **Updated**: To use new PaymentService instead of PaymentServiceClassic
- **Maintained**: Same GraphQL interface for backward compatibility

## API v2 Configuration

### Required Environment Variables
```bash
# NETOPIA API v2 Configuration
NETOPIA_SANDBOX_API_KEY=your_sandbox_api_key_here
NETOPIA_PRODUCTION_API_KEY=your_production_api_key_here

# Base URLs for NETOPIA API v2
NETOPIA_SANDBOX_BASE_URL=https://secure.sandbox.netopia-payments.com
NETOPIA_PRODUCTION_BASE_URL=https://secure.netopia-payments.com

# Webhook and redirect URLs
NETOPIA_WEBHOOK_URL=http://localhost:3000/api/payment/netopia/webhook
NETOPIA_REDIRECT_URL=http://localhost:3000/api/payment/netopia/success
```

### API Endpoints
- **Sandbox**: `https://secure.sandbox.netopia-payments.com`
- **Production**: `https://secure.netopia-payments.com`
- **Payment Start**: `/payment/card/start`
- **Payment Verify**: `/payment/card/verify-auth`
- **Refund**: `/v2/payment/refund`
- **Status**: `/v2/payment/status`

## Key Differences from Classic API

### Authentication
- **Classic**: Certificate-based with HMAC signatures
- **v2**: API Key directly in Authorization header (no Bearer prefix)

### Payload Format
- **Classic**: Encrypted XML/JSON with complex structure
- **v2**: Plain JSON with straightforward structure

### Webhook Processing
- **Classic**: Encrypted payloads requiring decryption
- **v2**: Direct JSON payloads over HTTPS

### Amount Handling
- **Classic**: Mixed units (sometimes cents, sometimes normal)
- **v2**: Consistent cents for API, normal units for internal processing

## Testing

### Test Script
Run the test script to verify the integration:
```bash
node test-netopia-api-v2.js
```

### GraphQL Mutation Test
Use the existing GraphQL mutation:
```graphql
mutation StartCheckout($input: StartCheckoutInput!) {
  startCheckout(input: $input) {
    orderId
    checkoutUrl
    expiresAt
  }
}
```

With payload:
```json
{
  "input": {
    "tierId": "ebeae9fd-1679-4026-9d34-10888611ed89",
    "customerEmail": "nie.radu@gmail.com",
    "billingAddress": {
      "firstName": "Utilizator",
      "lastName": "PRO",
      "address": "Adresa de facturare",
      "city": "București",
      "country": "RO",
      "zipCode": "010001"
    }
  }
}
```

## Migration Checklist

- [x] Update PaymentService to use API v2
- [x] Remove classic API dependencies
- [x] Update webhook handler
- [x] Update environment configuration
- [x] Update SubscriptionService integration
- [x] Create test script
- [x] Update documentation

## Next Steps

1. **Set up API Keys**: Get your API keys from NETOPIA dashboard
2. **Update .env**: Add the correct API keys to your environment
3. **Test Integration**: Run the test script to verify everything works
4. **Test Webhooks**: Ensure webhook URL is accessible
5. **Production Deploy**: Deploy with production API keys

## Troubleshooting

### Common Issues

1. **API Key Authentication Failed**
   - Verify API key is correct
   - Check if key has proper permissions
   - Ensure you're using sandbox key for testing

2. **Webhook Not Receiving Data**
   - Check webhook URL is accessible
   - Verify HTTPS is enabled
   - Check firewall settings

3. **Amount Conversion Errors**
   - API v2 expects amounts in cents
   - Internal processing uses normal units
   - Check conversion logic in PaymentService

### Support
- NETOPIA API v2 Documentation: https://doc.netopia-payments.com/docs/payment-api/v2.x/introduction
- API Reference: https://netopia-system.stoplight.io/docs/payments-api/6530c434c2f93-netopia-payments-merchant-api
