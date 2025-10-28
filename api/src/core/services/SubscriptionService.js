/**
 * SubscriptionService - Handles subscription business logic
 * Manages subscriptions, orders, payment methods, and webhook processing
 */

import PaymentService from './PaymentService.js';

class SubscriptionService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.paymentService = new PaymentService();
  }

  /**
   * Start checkout process for a subscription
   * @param {string} userId - User ID
   * @param {string} tierId - Subscription tier ID
   * @param {Object} options - Additional options
   * @returns {Object} Checkout session
   */
  async startCheckout(userId, tierId, options = {}) {
    try {
      // Get subscription tier details
      const { data: tier, error: tierError } = await this.supabase
        .from('subscription_tiers')
        .select('*')
        .eq('id', tierId)
        .eq('is_active', true)
        .single();

      if (tierError || !tier) {
        throw new Error('Invalid subscription tier');
      }

      // Check if user is currently in trial and converting to paid
      const { data: currentProfile } = await this.supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

      // Check if user has active trial subscription
      const { data: trialSubscription } = await this.supabase
        .from('subscriptions')
        .select('trial_start, trial_end, tier_id, status')
        .eq('user_id', userId)
        .eq('status', 'TRIALING')
        .single();

      const isConvertingFromTrial = trialSubscription?.trial_end && 
        new Date() < new Date(trialSubscription.trial_end) &&
        currentProfile?.subscription_tier === 'pro';

      // Create order record
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .insert({
          user_id: userId,
          amount: tier.price,
          currency: tier.currency,
          status: 'PENDING',
          metadata: {
            tier_id: tierId,
            tier_name: tier.name,
            is_converting_from_trial: isConvertingFromTrial,
            trial_tier_id: currentProfile?.trial_tier_id,
            ...options.metadata
          }
        })
        .select()
        .single();

      if (orderError) {
        throw new Error('Failed to create order');
      }

      // Prepare order data for Netopia
      const orderData = {
        orderId: order.id,
        amount: tier.price,
        currency: tier.currency,
        description: `Subscription: ${tier.display_name}`,
        customerEmail: options.customerEmail,
        customerPhone: options.customerPhone,
        billingAddress: options.billingAddress,
        shippingAddress: options.shippingAddress,
        items: [{
          name: tier.display_name,
          code: tier.name,
          quantity: 1,
          price: tier.price,
          vat: 0
        }],
        customData: {
          userId,
          tierId,
          subscriptionType: 'recurring',
          interval: tier.interval
        }
      };

      // Create Netopia order
      const paymentResult = await this.paymentService.createOrder(orderData);

      // Update order with Netopia details
      await this.supabase
        .from('orders')
        .update({
          netopia_order_id: paymentResult.netopiaOrderId,
          checkout_url: paymentResult.checkoutUrl,
          metadata: {
            ...order.metadata,
            netopia_order_id: paymentResult.netopiaOrderId,
            expires_at: paymentResult.expiresAt
          }
        })
        .eq('id', order.id);

      // Log the event
      await this.logPaymentEvent({
        orderId: order.id,
        eventType: 'ORDER_CREATED',
        netopiaOrderId: paymentResult.netopiaOrderId,
        amount: tier.price,
        currency: tier.currency,
        rawPayload: orderData
      });

      return {
        orderId: order.id,
        checkoutUrl: paymentResult.checkoutUrl,
        expiresAt: paymentResult.expiresAt,
        rawResponse: paymentResult.rawResponse
      };

    } catch (error) {
      console.error('SubscriptionService.startCheckout error:', error);
      throw error;
    }
  }

  /**
   * Process Netopia webhook (IPN)
   * @param {Object} webhookData - Webhook payload
   * @returns {Object} Processing result
   */
  async processWebhook(webhookData) {
    try {
      // Process webhook through payment service
      const webhookResult = await this.paymentService.processWebhook(webhookData);
      
      if (!webhookResult.success) {
        throw new Error('Webhook processing failed');
      }

      const { data } = webhookResult;
      const { netopiaOrderId, status, amount, currency } = data;

      // Check idempotency
      const idempotencyKey = this.paymentService.generateIdempotencyKey(
        netopiaOrderId,
        'WEBHOOK_RECEIVED',
        webhookData.signature
      );

      const { data: existingWebhook } = await this.supabase
        .from('webhook_processing')
        .select('id, status')
        .eq('netopia_order_id', netopiaOrderId)
        .eq('event_type', 'WEBHOOK_RECEIVED')
        .eq('signature_hash', idempotencyKey)
        .single();

      if (existingWebhook) {
        return { processed: false, reason: 'Already processed' };
      }

      // Insert webhook processing record
      const { error: webhookError } = await this.supabase
        .from('webhook_processing')
        .insert({
          netopia_order_id: netopiaOrderId,
          event_type: 'WEBHOOK_RECEIVED',
          signature_hash: idempotencyKey,
          status: 'PROCESSING'
        });

      if (webhookError) {
        throw new Error('Failed to record webhook processing');
      }

      // Get order details
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select('*')
        .eq('netopia_order_id', netopiaOrderId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      // Process based on status
      let result;
      switch (status) {
        case 'SUCCEEDED':
          result = await this.handlePaymentSuccess(order, data);
          break;
        case 'FAILED':
          result = await this.handlePaymentFailure(order, data);
          break;
        case 'CANCELED':
          result = await this.handlePaymentCanceled(order, data);
          break;
        default:
          result = { processed: true, action: 'No action required' };
      }

      // Update webhook processing status
      await this.supabase
        .from('webhook_processing')
        .update({ status: 'SUCCEEDED' })
        .eq('netopia_order_id', netopiaOrderId)
        .eq('signature_hash', idempotencyKey);

      // Log webhook event
      await this.logPaymentEvent({
        orderId: order.id,
        eventType: 'WEBHOOK_PROCESSED',
        netopiaOrderId,
        amount,
        currency,
        rawPayload: data
      });

      return { processed: true, result };

    } catch (error) {
      console.error('SubscriptionService.processWebhook error:', error);
      
      // Update webhook processing status to failed
      if (webhookData.netopiaOrderId) {
        await this.supabase
          .from('webhook_processing')
          .update({ 
            status: 'FAILED',
            error_message: error.message
          })
          .eq('netopia_order_id', webhookData.netopiaOrderId);
      }

      throw error;
    }
  }

  /**
   * Handle successful payment
   * @param {Object} order - Order record
   * @param {Object} webhookData - Webhook data
   * @returns {Object} Result
   */
  async handlePaymentSuccess(order, webhookData) {
    try {
      // Update order status
      await this.supabase
        .from('orders')
        .update({
          status: 'SUCCEEDED',
          payment_method_id: webhookData.paymentMethodId,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      // Check if this is a conversion from trial
      const isConvertingFromTrial = order.metadata?.is_converting_from_trial;
      
      if (isConvertingFromTrial) {
        // Cancel existing trial subscription
        await this.supabase
          .from('subscriptions')
          .update({
            status: 'CANCELED',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', order.user_id)
          .eq('status', 'TRIALING');
        
        // Trial info is now managed in subscriptions table, no need to clear from profile
      }

      // Create or update subscription
      const subscription = await this.createOrUpdateSubscription(order, webhookData);

      // Activate subscription
      await this.activateSubscription(subscription.id, order.netopia_order_id, webhookData.paymentToken);

      return {
        action: isConvertingFromTrial ? 'Trial converted to paid subscription' : 'Subscription activated',
        subscriptionId: subscription.id,
        orderId: order.id,
        convertedFromTrial: isConvertingFromTrial
      };

    } catch (error) {
      console.error('SubscriptionService.handlePaymentSuccess error:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment
   * @param {Object} order - Order record
   * @param {Object} webhookData - Webhook data
   * @returns {Object} Result
   */
  async handlePaymentFailure(order, webhookData) {
    try {
      // Update order status
      await this.supabase
        .from('orders')
        .update({
          status: 'FAILED',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      // Log payment failure
      await this.logPaymentEvent({
        orderId: order.id,
        eventType: 'PAYMENT_FAILED',
        netopiaOrderId: order.netopia_order_id,
        amount: order.amount,
        currency: order.currency,
        rawPayload: webhookData
      });

      return {
        action: 'Payment failed',
        orderId: order.id
      };

    } catch (error) {
      console.error('SubscriptionService.handlePaymentFailure error:', error);
      throw error;
    }
  }

  /**
   * Handle canceled payment
   * @param {Object} order - Order record
   * @param {Object} webhookData - Webhook data
   * @returns {Object} Result
   */
  async handlePaymentCanceled(order, webhookData) {
    try {
      // Update order status
      await this.supabase
        .from('orders')
        .update({
          status: 'CANCELED',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      return {
        action: 'Payment canceled',
        orderId: order.id
      };

    } catch (error) {
      console.error('SubscriptionService.handlePaymentCanceled error:', error);
      throw error;
    }
  }

  /**
   * Create or update subscription
   * @param {Object} order - Order record
   * @param {Object} webhookData - Webhook data
   * @returns {Object} Subscription
   */
  async createOrUpdateSubscription(order, webhookData) {
    try {
      const { data: tier } = await this.supabase
        .from('subscription_tiers')
        .select('*')
        .eq('id', order.metadata.tier_id)
        .single();

      // Check if subscription already exists
      const { data: existingSubscription } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', order.user_id)
        .eq('tier_id', order.metadata.tier_id)
        .single();

      if (existingSubscription) {
        // Update existing subscription
        const { data: updatedSubscription } = await this.supabase
          .from('subscriptions')
          .update({
            netopia_order_id: order.netopia_order_id,
            netopia_token: webhookData.paymentToken,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSubscription.id)
          .select()
          .single();

        return updatedSubscription;
      } else {
        // Create new subscription
        const now = new Date();
        const periodStart = now;
        const periodEnd = this.calculatePeriodEnd(now, tier.interval);

        const { data: newSubscription } = await this.supabase
          .from('subscriptions')
          .insert({
            user_id: order.user_id,
            tier_id: order.metadata.tier_id,
            status: 'PENDING',
            netopia_order_id: order.netopia_order_id,
            netopia_token: webhookData.paymentToken,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            metadata: {
              order_id: order.id,
              created_via: 'checkout'
            }
          })
          .select()
          .single();

        return newSubscription;
      }

    } catch (error) {
      console.error('SubscriptionService.createOrUpdateSubscription error:', error);
      throw error;
    }
  }

  /**
   * Activate subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {string} netopiaOrderId - Netopia order ID
   * @param {string} netopiaToken - Netopia token
   * @returns {Object} Result
   */
  async activateSubscription(subscriptionId, netopiaOrderId, netopiaToken = null) {
    try {
      // Get subscription details
      const { data: subscription, error: subError } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_tiers!inner(name, display_name)
        `)
        .eq('id', subscriptionId)
        .single();

      if (subError || !subscription) {
        throw new Error('Subscription not found');
      }

      // Update subscription status
      const { error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          status: 'ACTIVE',
          netopia_order_id: netopiaOrderId,
          netopia_token: netopiaToken || subscription.netopia_token,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);

      if (updateError) {
        throw new Error('Failed to update subscription');
      }

      // Update user profile subscription tier
      const { error: profileError } = await this.supabase
        .from('profiles')
        .update({
          subscription_tier: subscription.subscription_tiers.name.toLowerCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.user_id);

      if (profileError) {
        throw new Error('Failed to update user profile');
      }

      // Log subscription creation
      await this.logPaymentEvent({
        subscriptionId: subscriptionId,
        eventType: 'SUBSCRIPTION_CREATED',
        netopiaOrderId: netopiaOrderId,
        rawPayload: {
          subscription_id: subscriptionId,
          tier: subscription.subscription_tiers.name,
          user_id: subscription.user_id
        }
      });

      return { success: true };

    } catch (error) {
      console.error('SubscriptionService.activateSubscription error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {boolean} immediate - Cancel immediately
   * @param {string} reason - Cancellation reason
   * @returns {Object} Result
   */
  async cancelSubscription(subscriptionId, immediate = false, reason = null) {
    try {
      // Get subscription details
      const { data: subscription, error: subError } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_tiers!inner(name, display_name)
        `)
        .eq('id', subscriptionId)
        .single();

      if (subError || !subscription) {
        throw new Error('Subscription not found');
      }

      // Update subscription
      const { error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          status: immediate ? 'CANCELED' : subscription.status,
          cancel_at_period_end: true,
          canceled_at: immediate ? new Date().toISOString() : subscription.canceled_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);

      if (updateError) {
        throw new Error('Failed to update subscription');
      }

      // If immediate cancellation, downgrade user profile
      if (immediate) {
        const { error: profileError } = await this.supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.user_id);

        if (profileError) {
          throw new Error('Failed to update user profile');
        }
      }

      // Log cancellation
      await this.logPaymentEvent({
        subscriptionId: subscriptionId,
        eventType: 'SUBSCRIPTION_CANCELED',
        rawPayload: {
          subscription_id: subscriptionId,
          immediate,
          reason,
          user_id: subscription.user_id
        }
      });

      return { success: true };

    } catch (error) {
      console.error('SubscriptionService.cancelSubscription error:', error);
      throw error;
    }
  }

  /**
   * Create refund
   * @param {string} orderId - Order ID
   * @param {number} amount - Refund amount
   * @param {string} reason - Refund reason
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Refund result
   */
  async createRefund(orderId, amount, reason, metadata = {}) {
    try {
      // Get order details
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      // Create refund via Netopia
      const refundResult = await this.paymentService.createRefund({
        orderId: order.netopia_order_id,
        amount,
        currency: order.currency,
        reason,
        description: `Refund for order ${orderId}`
      });

      // Store refund record
      const { data: refund, error: refundError } = await this.supabase
        .from('refunds')
        .insert({
          order_id: orderId,
          netopia_refund_id: refundResult.netopiaRefundId,
          amount,
          currency: order.currency,
          reason,
          status: refundResult.status,
          metadata
        })
        .select()
        .single();

      if (refundError) {
        throw new Error('Failed to create refund record');
      }

      // Update order status
      await this.supabase
        .from('orders')
        .update({
          status: amount >= order.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      // Log refund creation
      await this.logPaymentEvent({
        orderId: orderId,
        eventType: 'REFUND_CREATED',
        netopiaOrderId: order.netopia_order_id,
        amount,
        currency: order.currency,
        rawPayload: refundResult
      });

      return refund;

    } catch (error) {
      console.error('SubscriptionService.createRefund error:', error);
      throw error;
    }
  }

  /**
   * Calculate period end date
   * @param {Date} startDate - Start date
   * @param {string} interval - Interval (MONTHLY, YEARLY, LIFETIME)
   * @returns {Date} End date
   */
  calculatePeriodEnd(startDate, interval) {
    const endDate = new Date(startDate);
    
    switch (interval) {
      case 'MONTHLY':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'YEARLY':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      case 'LIFETIME':
        endDate.setFullYear(endDate.getFullYear() + 100); // 100 years = lifetime
        break;
      default:
        endDate.setMonth(endDate.getMonth() + 1);
    }
    
    return endDate;
  }

  /**
   * Log payment event
   * @param {Object} eventData - Event data
   * @returns {void}
   */
  async logPaymentEvent(eventData) {
    try {
      const {
        orderId,
        subscriptionId,
        eventType,
        netopiaOrderId,
        amount,
        currency,
        status,
        rawPayload
      } = eventData;

      await this.supabase
        .from('payment_logs')
        .insert({
          order_id: orderId,
          subscription_id: subscriptionId,
          event_type: eventType,
          netopia_order_id: netopiaOrderId,
          amount,
          currency,
          status,
          raw_payload: rawPayload
        });

    } catch (error) {
      console.error('SubscriptionService.logPaymentEvent error:', error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get subscription tiers
   * @returns {Array} Subscription tiers
   */
  async getSubscriptionTiers() {
    try {
      const { data: tiers, error } = await this.supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch subscription tiers');
      }

      // Transform tiers to include missing fields with default values and map database fields to GraphQL fields
      return tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        displayName: tier.display_name || tier.name,
        description: tier.description || `Subscription tier: ${tier.display_name || tier.name}`,
        price: tier.price,
        currency: tier.currency,
        interval: tier.interval,
        features: tier.features || [],
        isPopular: tier.is_popular || false,
        trialDays: tier.trial_days || 0,
        isActive: tier.is_active,
        createdAt: tier.created_at,
        updatedAt: tier.updated_at
      }));

    } catch (error) {
      console.error('SubscriptionService.getSubscriptionTiers error:', error);
      throw error;
    }
  }

  /**
   * Get user subscription
   * @param {string} userId - User ID
   * @returns {Object} Subscription
   */
  async getUserSubscription(userId) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_tiers!inner(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error('Failed to fetch subscription');
      }

      if (!subscription) {
        return null;
      }

      // Transform the subscription data to match GraphQL schema
      return {
        ...subscription,
        subscription_tiers: subscription.subscription_tiers ? {
          id: subscription.subscription_tiers.id,
          name: subscription.subscription_tiers.name,
          displayName: subscription.subscription_tiers.display_name || subscription.subscription_tiers.name,
          description: subscription.subscription_tiers.description || `Subscription tier: ${subscription.subscription_tiers.display_name || subscription.subscription_tiers.name}`,
          price: subscription.subscription_tiers.price,
          currency: subscription.subscription_tiers.currency,
          interval: subscription.subscription_tiers.interval,
          features: subscription.subscription_tiers.features || [],
          isPopular: subscription.subscription_tiers.is_popular || false,
          trialDays: subscription.subscription_tiers.trial_days || 0,
          isActive: subscription.subscription_tiers.is_active,
          createdAt: subscription.subscription_tiers.created_at,
          updatedAt: subscription.subscription_tiers.updated_at
        } : null
      };

    } catch (error) {
      console.error('SubscriptionService.getUserSubscription error:', error);
      throw error;
    }
  }

  /**
   * Validate webhook signature
   * @param {Object} webhookData - Webhook data
   * @returns {boolean} Is valid signature
   */
  validateWebhookSignature(webhookData) {
    try {
      return this.paymentService.validateSignature(
        webhookData.payload,
        webhookData.signature,
        webhookData.timestamp
      );
    } catch (error) {
      console.error('SubscriptionService.validateWebhookSignature error:', error);
      return false;
    }
  }

  /**
   * Enhanced payment event logging with detailed tracking
   * @param {Object} eventData - Event data
   * @returns {void}
   */
  async logPaymentEvent(eventData) {
    try {
      const {
        orderId,
        subscriptionId,
        eventType,
        netopiaOrderId,
        amount,
        currency,
        status,
        rawPayload,
        ipnReceivedAt,
        ipnStatus,
        webhookId,
        retryCount = 0,
        errorMessage,
        processingTimeMs
      } = eventData;

      await this.supabase
        .from('payment_logs')
        .insert({
          order_id: orderId,
          subscription_id: subscriptionId,
          event_type: eventType,
          netopia_order_id: netopiaOrderId,
          amount,
          currency,
          status,
          raw_payload: rawPayload,
          ipn_received_at: ipnReceivedAt,
          ipn_status: ipnStatus,
          webhook_id: webhookId,
          retry_count: retryCount,
          error_message: errorMessage,
          processing_time_ms: processingTimeMs
        });

    } catch (error) {
      console.error('SubscriptionService.logPaymentEvent error:', error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get orphan payments (confirmed by Netopia but no subscription match)
   * @param {Object} options - Query options
   * @returns {Array} Orphan payments
   */
  async getOrphanPayments(options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      const { data: orphanPayments, error } = await this.supabase
        .from('payment_logs')
        .select(`
          *,
          orders!inner(*)
        `)
        .eq('event_type', 'PAYMENT_SUCCEEDED')
        .is('subscription_id', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error('Failed to fetch orphan payments');
      }

      return orphanPayments || [];

    } catch (error) {
      console.error('SubscriptionService.getOrphanPayments error:', error);
      throw error;
    }
  }

  /**
   * Get payment metrics for monitoring
   * @param {Object} options - Query options
   * @returns {Object} Payment metrics
   */
  async getPaymentMetrics(options = {}) {
    try {
      const { startDate, endDate } = options;
      
      let query = supabase
        .from('payment_logs')
        .select('event_type, status, created_at, amount');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data: logs, error } = await query;

      if (error) {
        throw new Error('Failed to fetch payment metrics');
      }

      // Calculate metrics
      const metrics = {
        totalEvents: logs.length,
        pendingPayments: logs.filter(log => 
          log.event_type === 'ORDER_CREATED' && log.status === 'PENDING'
        ).length,
        successfulPayments: logs.filter(log => 
          log.event_type === 'PAYMENT_SUCCEEDED'
        ).length,
        failedPayments: logs.filter(log => 
          log.event_type === 'PAYMENT_FAILED'
        ).length,
        webhookFailures: logs.filter(log => 
          log.event_type === 'WEBHOOK_FAILED'
        ).length,
        retryQueue: logs.filter(log => 
          log.retry_count > 0
        ).length,
        totalAmount: logs
          .filter(log => log.amount && log.event_type === 'PAYMENT_SUCCEEDED')
          .reduce((sum, log) => sum + parseFloat(log.amount), 0),
        averageProcessingTime: logs
          .filter(log => log.processing_time_ms)
          .reduce((sum, log) => sum + log.processing_time_ms, 0) / 
          logs.filter(log => log.processing_time_ms).length || 0
      };

      return metrics;

    } catch (error) {
      console.error('SubscriptionService.getPaymentMetrics error:', error);
      throw error;
    }
  }

  /**
   * Get user's trial status and subscription info
   * @param {string} userId - User ID
   * @returns {Object} Trial and subscription info
   */
  async getUserTrialAndSubscriptionInfo(userId) {
    try {
      // Get user profile (only subscription_tier now)
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

      if (profileError) {
        throw new Error('Failed to fetch user profile');
      }

      // Get trial subscription
      const { data: trialSubscription } = await this.supabase
        .from('subscriptions')
        .select('trial_start, trial_end, tier_id, status')
        .eq('user_id', userId)
        .eq('status', 'TRIALING')
        .single();

      // Get active subscription
      const { data: subscription } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_tiers!inner(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .single();

      // Calculate trial status from trial subscription
      let trialStatus = { isTrial: false, hasTrial: false };
      if (trialSubscription?.trial_end) {
        const now = new Date();
        const trialEnd = new Date(trialSubscription.trial_end);
        
        if (now < trialEnd) {
          const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
          trialStatus = {
            isTrial: true,
            hasTrial: true,
            trialStart: trialSubscription.trial_start,
            trialEnd: trialSubscription.trial_end,
            tierId: trialSubscription.tier_id,
            daysRemaining: daysRemaining
          };
        } else {
          trialStatus = {
            isTrial: false,
            hasTrial: true,
            expired: true,
            trialStart: trialSubscription.trial_start,
            trialEnd: trialSubscription.trial_end,
            tierId: trialSubscription.tier_id
          };
        }
      }

      return {
        profile: {
          subscriptionTier: profile.subscription_tier,
          trialStart: trialSubscription?.trial_start || null,
          trialEnd: trialSubscription?.trial_end || null,
          trialTierId: trialSubscription?.tier_id || null
        },
        subscription: subscription || null,
        trialStatus: trialStatus,
        isInTrial: trialStatus.isTrial,
        hasActiveSubscription: !!subscription
      };

    } catch (error) {
      console.error('SubscriptionService.getUserTrialAndSubscriptionInfo error:', error);
      throw error;
    }
  }
}

export default SubscriptionService;
