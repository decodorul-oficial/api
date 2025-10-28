#!/usr/bin/env node

/**
 * Test script for NETOPIA API v2 integration
 * Tests the updated PaymentService with the new API v2 endpoints
 */

import dotenv from 'dotenv';
import PaymentService from './api/src/core/services/PaymentService.js';

// Load environment variables
dotenv.config();

async function testNetopiaApiV2() {
  console.log('🧪 Testing NETOPIA API v2 Integration...\n');

  try {
    // Initialize PaymentService
    const paymentService = new PaymentService();
    console.log('✅ PaymentService initialized successfully');
    console.log(`📍 Using ${paymentService.isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);
    console.log(`🔗 Base URL: ${paymentService.baseUrl}`);
    console.log(`🔑 API Key: ${paymentService.apiKey ? 'Set' : 'Missing'}\n`);

    // Test order data (matching your GraphQL mutation)
    const testOrderData = {
      orderId: `test-${Date.now()}`,
      amount: 29.99, // RON
      currency: 'RON',
      description: 'Test subscription: Pro Monthly',
      customerEmail: 'nie.radu@gmail.com',
      customerPhone: '+40712345678',
      billingAddress: {
        firstName: 'Utilizator',
        lastName: 'PRO',
        address: 'Adresa de facturare',
        city: 'București',
        country: 'RO',
        zipCode: '010001',
        email: 'nie.radu@gmail.com'
      },
      items: [{
        name: 'Pro Monthly Subscription',
        code: 'pro-monthly',
        quantity: 1,
        price: 29.99,
        vat: 0
      }],
      customData: {
        userId: 'test-user-id',
        tierId: 'ebeae9fd-1679-4026-9d34-10888611ed89',
        subscriptionType: 'recurring',
        interval: 'monthly'
      }
    };

    console.log('📋 Test Order Data:');
    console.log(JSON.stringify(testOrderData, null, 2));
    console.log('\n');

    // Test createOrder method
    console.log('🚀 Testing createOrder...');
    const orderResult = await paymentService.createOrder(testOrderData);
    
    console.log('✅ Order created successfully!');
    console.log('📊 Order Result:');
    console.log(JSON.stringify(orderResult, null, 2));
    console.log('\n');

    // Test webhook processing
    console.log('🔔 Testing webhook processing...');
    const mockWebhookData = {
      orderId: orderResult.orderId,
      netopiaOrderId: orderResult.netopiaOrderId,
      status: 'CONFIRMED',
      amount: 2999, // Amount in cents
      currency: 'RON',
      timestamp: Math.floor(Date.now() / 1000)
    };

    const webhookResult = await paymentService.processWebhook(mockWebhookData);
    console.log('✅ Webhook processed successfully!');
    console.log('📊 Webhook Result:');
    console.log(JSON.stringify(webhookResult, null, 2));
    console.log('\n');

    // Test order status (if we have a netopia order ID)
    if (orderResult.netopiaOrderId) {
      console.log('📊 Testing getOrderStatus...');
      try {
        const statusResult = await paymentService.getOrderStatus(orderResult.netopiaOrderId);
        console.log('✅ Order status retrieved successfully!');
        console.log('📊 Status Result:');
        console.log(JSON.stringify(statusResult, null, 2));
      } catch (statusError) {
        console.log('⚠️  Order status check failed (expected for test orders):', statusError.message);
      }
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file with the correct NETOPIA_SANDBOX_API_KEY');
    console.log('2. Test the GraphQL mutation: startCheckout');
    console.log('3. Verify webhook handling at: ' + process.env.NETOPIA_WEBHOOK_URL);
    console.log('4. Test payment flow end-to-end');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n🔍 Debug information:');
    console.error('Error details:', error);
    
    console.log('\n🛠️  Troubleshooting:');
    console.log('1. Check if NETOPIA_SANDBOX_API_KEY is set in .env');
    console.log('2. Check if NETOPIA_SANDBOX_BASE_URL is set in .env');
    console.log('3. Verify the API key is valid and has proper permissions');
    console.log('4. Ensure NETOPIA_WEBHOOK_URL and NETOPIA_REDIRECT_URL are configured');
    console.log('5. Check network connectivity to NETOPIA API');
    console.log('6. Verify API key format (should be the key directly, not Bearer token)');
    
    process.exit(1);
  }
}

// Run the test
testNetopiaApiV2();
