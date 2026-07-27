/**
 * SubscriptionService — comenzi, abonamente, Stripe Checkout / PaymentIntent.
 * Plăți Stripe (consum API): docs/STRIPE_PAYMENTS.md
 */

import StripePaymentService from './StripePaymentService.js';
import OblioInvoiceService from './OblioInvoiceService.js';
import BillingNotificationService from './BillingNotificationService.js';
import supabaseClient from '../../database/supabaseClient.js';
import { orderAmountToStripeMinorUnits } from '../../utils/stripeAmount.js';
import { assertPaymentsEnabled } from '../../utils/paymentsEnabled.js';

class SubscriptionService {
  constructor(supabaseClientParam) {
    this.supabase = supabaseClientParam || supabaseClient.getServiceClient();
    this.stripePaymentService = null;
    this.oblioInvoiceService = null;
    this.billingNotificationService = null;
  }

  _getStripePaymentService() {
    if (!this.stripePaymentService) {
      this.stripePaymentService = new StripePaymentService();
    }
    return this.stripePaymentService;
  }

  _getOblioInvoiceService() {
    if (!this.oblioInvoiceService) {
      this.oblioInvoiceService = new OblioInvoiceService(this.supabase);
    }
    return this.oblioInvoiceService;
  }

  _getBillingNotificationService() {
    if (!this.billingNotificationService) {
      this.billingNotificationService = new BillingNotificationService(this.supabase);
    }
    return this.billingNotificationService;
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
      assertPaymentsEnabled();

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

      const resolvedStripePriceId = options.stripePriceId || tier.stripe_price_id || null;

      if (!resolvedStripePriceId && !options.stripeProductId) {
        throw new Error(
          'Stripe: lipsește Price ID. Setează payments.subscription_tiers.stripe_price_id pentru acest tier sau trimite stripePriceId / stripeProductId în startCheckout.'
        );
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

      // payments.orders: payment_provider_reference nullable; se setează după răspunsul gateway.
      // public.orders = VIEW; trebuie să expună billing_details (migrație aplicată în Supabase + în repo).
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .insert({
          user_id: userId,
          amount: tier.price,
          currency: tier.currency,
          status: 'PENDING',
          billing_details: options.billingDetails || {},
          metadata: {
            tier_id: tierId,
            tier_name: tier.name,
            is_converting_from_trial: isConvertingFromTrial,
            ...options.metadata
          }
        })
        .select()
        .single();

      if (orderError) {
        console.error('orders.insert failed:', orderError.message, orderError.code, orderError.details, orderError.hint);
        throw new Error(orderError.message || 'Failed to create order');
      }

      // Prepare order data for Stripe
      const orderData = {
        orderId: order.id,
        amount: tier.price,
        currency: tier.currency,
        description: `Subscription: ${tier.display_name}`,
        customerEmail: options.customerEmail,
        customerPhone: options.customerPhone,
        billingAddress: options.billingDetails,
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
          interval: tier.interval,
          stripePriceId: resolvedStripePriceId || undefined,
          stripeProductId: options.stripeProductId,
          stripeCheckoutMode: options.stripeCheckoutMode,
          stripeSuccessUrl: options.stripeSuccessUrl
        }
      };

      const paymentResult = await this._getStripePaymentService().createOrder(orderData);

      const paymentProviderReference = paymentResult.paymentProviderReference || paymentResult.sessionId;

      // Update order cu ID sesiune / tranzacție gateway
      await this.supabase
        .from('orders')
        .update({
          payment_provider_reference: paymentProviderReference,
          checkout_url: paymentResult.checkoutUrl,
          metadata: {
            ...order.metadata,
            payment_provider_reference: paymentProviderReference,
            expires_at: paymentResult.expiresAt
          }
        })
        .eq('id', order.id);

      // Log the event
      await this.logPaymentEvent({
        orderId: order.id,
        eventType: 'ORDER_CREATED',
        paymentProviderReference,
        amount: tier.price,
        currency: tier.currency,
        rawPayload: orderData
      });

      return {
        orderId: order.id,
        checkoutUrl: paymentResult.checkoutUrl,
        expiresAt: paymentResult.expiresAt,
        sessionId: paymentResult.sessionId || paymentProviderReference,
        rawResponse: paymentResult.rawResponse
      };

    } catch (error) {
      console.error('SubscriptionService.startCheckout error:', error);
      throw error;
    }
  }

  /**
   * PaymentIntent pentru Stripe Elements: validează comanda și suma, creează intent pe Stripe.
   * @param {string} userId
   * @param {string} orderId
   * @param {number} amountMinor - unități minore Stripe (trebuie să coincidă cu order.amount)
   * @returns {Promise<{ clientSecret: string }>}
   */
  async createPaymentIntent(userId, orderId, amountMinor) {
    assertPaymentsEnabled();

    const { data: order, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !order) {
      throw new Error('Comanda nu a fost găsită sau nu aparține utilizatorului');
    }

    if (order.status !== 'PENDING' && order.status !== 'PROCESSING') {
      throw new Error(`Comanda nu poate fi plătită (status: ${order.status})`);
    }

    const expectedMinor = orderAmountToStripeMinorUnits(order.amount, order.currency);
    if (expectedMinor == null || amountMinor !== expectedMinor) {
      throw new Error(
        `Suma nu corespunde comenzii. Trimite ${expectedMinor} (unități minore Stripe pentru ${order.currency}).`
      );
    }

    const stripe = this._getStripePaymentService();
    const { clientSecret, paymentIntentId } = await stripe.createPaymentIntent({
      orderId: order.id,
      amount: amountMinor,
      currency: order.currency
    });

    const nowIso = new Date().toISOString();
    const meta = {
      ...(order.metadata || {}),
      stripe_payment_intent_id: paymentIntentId
    };
    await this.supabase
      .from('orders')
      .update({
        status: 'PROCESSING',
        payment_provider_reference: paymentIntentId,
        metadata: meta,
        updated_at: nowIso
      })
      .eq('id', order.id);

    return { clientSecret };
  }

  /**
   * Handle successful payment
   * @param {Object} order - Order record
   * @param {Object} webhookData - Webhook data
   * @returns {Object} Result
   */
  async handlePaymentSuccess(order, webhookData) {
    try {
      // Ensure we have a subscription linked to the order before delegating to DB logic
      let subscriptionId = order.subscription_id;

      if (!subscriptionId) {
        const subscription = await this.createOrUpdateSubscription(order, webhookData);
        subscriptionId = subscription?.id;

        if (subscriptionId) {
          await this.supabase
            .from('orders')
            .update({ subscription_id: subscriptionId })
            .eq('id', order.id);
        }
      }

      // Call DB-side function to update order and activate subscription atomically
      const transactionId = webhookData?.transactionId
        || webhookData?.paymentProviderReference
        || order.payment_provider_reference
        || null;

      const { data: rpcResult, error: rpcError } = await this.supabase
        .rpc('update_order_status_rpc', {
          p_order_id: order.id,
          p_status: 'SUCCEEDED',
          p_transaction_id: String(transactionId || ''),
          p_amount: order.amount,
          p_currency: order.currency,
          p_raw_data: webhookData || {}
        });

      if (rpcError || !rpcResult?.success) {
        throw new Error(`DB update_order_status failed: ${rpcError?.message || JSON.stringify(rpcResult)}`);
      }

      return {
        action: 'Order and subscription updated via DB function',
        subscriptionId: subscriptionId || null,
        orderId: order.id,
        dbResult: rpcResult
      };

    } catch (error) {
      console.error('SubscriptionService.handlePaymentSuccess error:', error);
      throw error;
    }
  }

  /**
   * Plată reușită din webhook Stripe: subscriptions + payments.update_order_status (RPC) + profil (activateSubscription).
   *
   * @param {Object} order - rând orders (metadata.tier_id de la startCheckout)
   * @param {{ transactionId?: string, rawData?: object }} stripePayload
   */
  async handleStripePaymentSuccess(order, { transactionId, rawData }) {
    const stripe = this._getStripePaymentService();
    const { stripeCustomerId, stripeSubscriptionId } = stripe.extractCustomerAndSubscriptionIds(rawData || {});

    const webhookData = {
      transactionId: transactionId || order.payment_provider_reference,
      paymentProviderReference: order.payment_provider_reference,
      paymentToken: null
    };

    let subscriptionId = order.subscription_id;

    if (!subscriptionId) {
      const subscription = await this.createOrUpdateSubscription(order, webhookData, {
        stripeSubscriptionId
      });
      subscriptionId = subscription?.id;
      if (subscriptionId) {
        await this.supabase
          .from('orders')
          .update({ subscription_id: subscriptionId })
          .eq('id', order.id);
      }
    } else if (stripeSubscriptionId) {
      await this.supabase
        .from('subscriptions')
        .update({
          stripe_subscription_id: stripeSubscriptionId,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);
    }

    if (stripeCustomerId) {
      await this.supabase
        .from('profiles')
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.user_id);
    }

    const txId = String(
      transactionId
      || webhookData.paymentProviderReference
      || order.payment_provider_reference
      || ''
    );

    const payloadForDb =
      rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData
        : { source: 'stripe_webhook', ...webhookData };

    const { data: rpcResult, error: rpcError } = await this.supabase.rpc('update_order_status_rpc', {
      p_order_id: order.id,
      p_status: 'SUCCEEDED',
      p_transaction_id: txId,
      p_amount: order.amount,
      p_currency: order.currency,
      p_raw_data: payloadForDb
    });

    if (rpcError || !rpcResult?.success) {
      throw new Error(`DB update_order_status failed: ${rpcError?.message || JSON.stringify(rpcResult)}`);
    }

    const { data: orderRow } = await this.supabase
      .from('orders')
      .select('subscription_id')
      .eq('id', order.id)
      .single();

    if (orderRow?.subscription_id) {
      try {
        await this.activateSubscription(
          orderRow.subscription_id,
          order.payment_provider_reference || txId,
          null,
          { stripeSubscriptionId }
        );
      } catch (e) {
        console.warn('SubscriptionService.handleStripePaymentSuccess activateSubscription:', e?.message || e);
      }
    }

    const stripeInvoiceId =
      (rawData?.object === 'invoice' && rawData?.id)
      || rawData?.invoice
      || (typeof rawData?.id === 'string' && String(rawData.id).startsWith('in_') ? rawData.id : null);

    if (stripeInvoiceId) {
      await this.supabase
        .from('orders')
        .update({
          stripe_invoice_id: typeof stripeInvoiceId === 'string' ? stripeInvoiceId : stripeInvoiceId?.id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
    }

    await this.afterPaymentSuccessSideEffects(order.id, order.user_id);

    return {
      action: 'Stripe webhook: order + subscription + profile',
      subscriptionId: orderRow?.subscription_id || subscriptionId || null,
      orderId: order.id,
      dbResult: rpcResult
    };
  }

  /**
   * Emit Oblio (enqueue/issue) + email după plată reușită.
   */
  async afterPaymentSuccessSideEffects(orderId, userId) {
    const oblio = this._getOblioInvoiceService();
    await oblio.enqueueInvoiceForOrder(orderId);

    let oblioLink = null;
    try {
      const result = await oblio.issueInvoiceForOrder(orderId);
      oblioLink = result?.link || null;
    } catch (e) {
      console.warn('Oblio issue deferred to queue:', e?.message || e);
    }

    const { data: order } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    try {
      await this._getBillingNotificationService().notifyPaymentSuccess({
        userId,
        order,
        oblioLink: oblioLink || order?.oblio_link
      });
    } catch (e) {
      console.warn('Billing notify payment success:', e?.message || e);
    }
  }

  /**
   * Fallback post-redirect: reconciliază statusul unei comenzi Stripe folosind Checkout Session.
   * Se folosește când UI-ul revine din Stripe dar webhook-ul nu a fost procesat încă.
   *
   * @param {Object} order
   * @returns {Promise<{ reconciled: boolean, reason?: string, status?: string }>}
   */
  async reconcileStripeCheckoutOrder(order) {
    const sessionId = order?.payment_provider_reference;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return { reconciled: false, reason: 'Order is not linked to a Stripe Checkout session' };
    }

    const stripe = this._getStripePaymentService();
    const session = await stripe.retrieveCheckoutSession(sessionId);

    if (!session) {
      return { reconciled: false, reason: 'Stripe session not found' };
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      await this.handleStripePaymentSuccess(order, {
        transactionId: session.payment_intent || session.id,
        rawData: {
          source: 'stripe_confirm_payment_fallback',
          checkout_session: session
        }
      });
      return { reconciled: true, status: 'SUCCEEDED' };
    }

    if (session.status === 'expired') {
      await this.supabase
        .from('orders')
        .update({
          status: 'CANCELED',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .neq('status', 'SUCCEEDED');
      return { reconciled: true, status: 'CANCELED' };
    }

    return { reconciled: false, reason: `Stripe session still pending (${session.status}/${session.payment_status})` };
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
        paymentProviderReference: order.payment_provider_reference,
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
  async createOrUpdateSubscription(order, webhookData, stripeIds = {}) {
    try {
      const { stripeSubscriptionId } = stripeIds;
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
            payment_provider_reference: order.payment_provider_reference,
            payment_method_token: webhookData.paymentToken,
            ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
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
            payment_provider_reference: order.payment_provider_reference,
            payment_method_token: webhookData.paymentToken,
            ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
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
   * @param {string} paymentProviderReference - Gateway transaction/session reference
   * @param {string} paymentMethodToken - Saved payment method token
   * @param {{ stripeSubscriptionId?: string }} [stripeIds]
   * @returns {Object} Result
   */
  async activateSubscription(subscriptionId, paymentProviderReference, paymentMethodToken = null, stripeIds = {}) {
    try {
      const { stripeSubscriptionId } = stripeIds;
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
          payment_provider_reference: paymentProviderReference,
          payment_method_token: paymentMethodToken || subscription.payment_method_token,
          ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);

      if (updateError) {
        throw new Error('Failed to update subscription');
      }

      // Update user profile subscription tier
      const resolvedProfileTier = this._mapProfileSubscriptionTier(subscription.subscription_tiers?.name);
      const { error: profileError } = await this.supabase
        .from('profiles')
        .update({
          subscription_tier: resolvedProfileTier,
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
        paymentProviderReference,
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
   * Mapează numele tier-ului (ex. pro-monthly, enterprise-yearly) la valorile permise în profiles.subscription_tier.
   * @param {string} tierName
   * @returns {string}
   */
  _mapProfileSubscriptionTier(tierName) {
    const normalized = String(tierName || '').toLowerCase();
    if (normalized.includes('enterprise')) return 'enterprise';
    if (normalized.includes('pro')) return 'pro';
    return 'free';
  }

  /**
   * Cancel subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {boolean} immediate - Cancel immediately
   * @param {string} reason - Cancellation reason
   * @param {{ userId?: string }} [options] - If userId set, enforces ownership
   * @returns {Object} Result
   */
  async cancelSubscription(subscriptionId, immediate = false, reason = null, options = {}) {
    try {
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

      if (options.userId && subscription.user_id !== options.userId) {
        throw new Error('Subscription does not belong to user');
      }

      if (subscription.stripe_subscription_id) {
        const stripe = this._getStripePaymentService();
        await stripe.cancelStripeSubscription({
          stripeSubscriptionId: subscription.stripe_subscription_id,
          immediate
        });
      }

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

      try {
        await this._getBillingNotificationService().notifySubscriptionCanceled({
          userId: subscription.user_id,
          immediate,
          periodEnd: subscription.current_period_end
        });
      } catch (_) {
        /* ignore */
      }

      return { success: true };

    } catch (error) {
      console.error('SubscriptionService.cancelSubscription error:', error);
      throw error;
    }
  }

  /**
   * Reactivează abonamentul (Stripe cancel_at_period_end=false + DB).
   */
  async reactivateSubscription(subscriptionId, { userId } = {}) {
    const { data: subscription, error } = await this.supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_tiers!inner(*)
      `)
      .eq('id', subscriptionId)
      .single();

    if (error || !subscription) {
      throw new Error('Subscription not found');
    }

    if (userId && subscription.user_id !== userId) {
      throw new Error('Subscription does not belong to user');
    }

    if (subscription.stripe_subscription_id) {
      const stripe = this._getStripePaymentService();
      await stripe.reactivateStripeSubscription({
        stripeSubscriptionId: subscription.stripe_subscription_id
      });
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('subscriptions')
      .update({
        status: 'ACTIVE',
        cancel_at_period_end: false,
        canceled_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscriptionId)
      .select(`
        *,
        subscription_tiers!inner(*)
      `)
      .single();

    if (updateError) {
      throw new Error('Failed to reactivate subscription');
    }

    const profileTier = this._mapProfileSubscriptionTier(subscription.subscription_tiers?.name);
    await this.supabase
      .from('profiles')
      .update({
        subscription_tier: profileTier,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.user_id);

    return updated;
  }

  _mapStripeSubStatus(stripeStatus) {
    const map = {
      active: 'ACTIVE',
      trialing: 'TRIALING',
      past_due: 'PAST_DUE',
      unpaid: 'UNPAID',
      canceled: 'CANCELED',
      incomplete: 'INCOMPLETE',
      incomplete_expired: 'INCOMPLETE_EXPIRED',
      paused: 'PAST_DUE'
    };
    return map[String(stripeStatus || '').toLowerCase()] || 'ACTIVE';
  }

  async _findLocalSubscriptionByStripeId(stripeSubscriptionId) {
    if (!stripeSubscriptionId) return null;
    const { data } = await this.supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_tiers(*)
      `)
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    return data || null;
  }

  async _resolveTierIdFromStripePrice(priceId) {
    if (!priceId) return null;
    const { data } = await this.supabase
      .from('subscription_tiers')
      .select('id, name')
      .eq('stripe_price_id', priceId)
      .eq('is_active', true)
      .maybeSingle();
    if (data?.id) return data;

    // lookup_key style stored in DB
    const { data: all } = await this.supabase
      .from('subscription_tiers')
      .select('id, name, stripe_price_id')
      .eq('is_active', true);
    return (all || []).find((t) => t.stripe_price_id === priceId) || null;
  }

  /**
   * Sync local subscription from Stripe customer.subscription.updated
   */
  async syncSubscriptionFromStripe(stripeSub) {
    const stripeId = stripeSub?.id;
    if (!stripeId) return { synced: false, reason: 'no_id' };

    let local = await this._findLocalSubscriptionByStripeId(stripeId);
    if (!local) {
      const orderId = stripeSub.metadata?.order_id || stripeSub.metadata?.orderId;
      if (orderId) {
        const { data: order } = await this.supabase
          .from('orders')
          .select('subscription_id, user_id')
          .eq('id', orderId)
          .maybeSingle();
        if (order?.subscription_id) {
          const { data } = await this.supabase
            .from('subscriptions')
            .select('*, subscription_tiers(*)')
            .eq('id', order.subscription_id)
            .maybeSingle();
          local = data;
          if (local && !local.stripe_subscription_id) {
            await this.supabase
              .from('subscriptions')
              .update({ stripe_subscription_id: stripeId })
              .eq('id', local.id);
          }
        }
      }
    }

    if (!local) {
      return { synced: false, reason: 'local_subscription_not_found' };
    }

    const priceId =
      stripeSub.items?.data?.[0]?.price?.id
      || stripeSub.plan?.id
      || null;
    const tierRow = await this._resolveTierIdFromStripePrice(priceId);

    const periodStart = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000).toISOString()
      : local.current_period_start;
    const periodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : local.current_period_end;

    const status = this._mapStripeSubStatus(stripeSub.status);
    const cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);

    const updatePayload = {
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      stripe_subscription_id: stripeId,
      updated_at: new Date().toISOString()
    };
    if (tierRow?.id) {
      updatePayload.tier_id = tierRow.id;
    }
    if (status === 'CANCELED') {
      updatePayload.canceled_at = new Date().toISOString();
    }

    await this.supabase
      .from('subscriptions')
      .update(updatePayload)
      .eq('id', local.id);

    const tierName = tierRow?.name || local.subscription_tiers?.name;
    const profileTier = status === 'CANCELED' || status === 'UNPAID' || status === 'INCOMPLETE_EXPIRED'
      ? 'free'
      : this._mapProfileSubscriptionTier(tierName);

    if (status === 'ACTIVE' || status === 'TRIALING' || status === 'PAST_DUE' || profileTier === 'free') {
      await this.supabase
        .from('profiles')
        .update({
          subscription_tier: profileTier,
          updated_at: new Date().toISOString()
        })
        .eq('id', local.user_id);
    }

    return { synced: true, subscriptionId: local.id, status };
  }

  /**
   * customer.subscription.deleted → cancel local + free tier
   */
  async handleStripeSubscriptionDeleted(stripeSub) {
    const result = await this.syncSubscriptionFromStripe({
      ...stripeSub,
      status: 'canceled',
      cancel_at_period_end: false
    });

    const local = await this._findLocalSubscriptionByStripeId(stripeSub?.id);
    if (local) {
      await this.supabase
        .from('subscriptions')
        .update({
          status: 'CANCELED',
          canceled_at: new Date().toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', local.id);

      await this.supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          updated_at: new Date().toISOString()
        })
        .eq('id', local.user_id);

      try {
        await this._getBillingNotificationService().notifySubscriptionCanceled({
          userId: local.user_id,
          immediate: true,
          periodEnd: local.current_period_end
        });
      } catch (_) {
        /* ignore */
      }
    }

    return result;
  }

  /**
   * invoice.payment_failed → PAST_DUE + email
   */
  async handleStripeInvoicePaymentFailed(invoice) {
    const stripeSubId =
      typeof invoice?.subscription === 'string'
        ? invoice.subscription
        : invoice?.subscription?.id;

    const local = await this._findLocalSubscriptionByStripeId(stripeSubId);
    if (!local) {
      return { handled: false, reason: 'subscription_not_found' };
    }

    await this.supabase
      .from('subscriptions')
      .update({
        status: 'PAST_DUE',
        updated_at: new Date().toISOString()
      })
      .eq('id', local.id);

    await this.logPaymentEvent({
      subscriptionId: local.id,
      eventType: 'PAYMENT_FAILED',
      paymentProviderReference: invoice?.id,
      amount: invoice?.amount_due != null ? invoice.amount_due / 100 : undefined,
      currency: invoice?.currency,
      status: 'FAILED',
      rawPayload: invoice
    });

    try {
      await this._getBillingNotificationService().notifyPaymentFailed({
        userId: local.user_id,
        reason: invoice?.last_finalization_error?.message || invoice?.billing_reason
      });
    } catch (_) {
      /* ignore */
    }

    return { handled: true, subscriptionId: local.id };
  }

  /**
   * invoice.paid — first payment vs renewal
   */
  async handleStripeInvoicePaid(invoice, { eventId } = {}) {
    const billingReason = invoice?.billing_reason || '';
    const stripeSubId =
      typeof invoice?.subscription === 'string'
        ? invoice.subscription
        : invoice?.subscription?.id;

    const isRenewal =
      billingReason === 'subscription_cycle'
      || billingReason === 'subscription_update'
      || billingReason === 'subscription';

    // Prefer metadata order for initial checkout invoices
    const orderIdFromMeta = invoice?.metadata?.order_id || invoice?.metadata?.orderId;
    let orderId = orderIdFromMeta;

    if (!orderId && stripeSubId) {
      try {
        const stripe = this._getStripePaymentService();
        const sub = await stripe.retrieveSubscription(stripeSubId);
        orderId = sub?.metadata?.order_id || sub?.metadata?.orderId || null;
      } catch (_) {
        /* ignore */
      }
    }

    // Renewal: create a new SUCCEEDED order + extend period (never reuse Already paid path)
    if (isRenewal || (orderId && billingReason === 'subscription_cycle')) {
      return this._handleRenewalInvoice(invoice, { stripeSubId, eventId });
    }

    if (orderId) {
      const { data: order } = await this.supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (order?.status === 'SUCCEEDED') {
        // Ensure Oblio for first payment if invoice.paid arrives after checkout.session.completed
        if (!order.oblio_status || order.oblio_status === 'pending' || order.oblio_status === 'failed') {
          if (invoice?.id) {
            await this.supabase
              .from('orders')
              .update({ stripe_invoice_id: invoice.id, updated_at: new Date().toISOString() })
              .eq('id', order.id);
          }
          await this.afterPaymentSuccessSideEffects(order.id, order.user_id);
        }
        if (stripeSubId) {
          await this.syncSubscriptionFromStripe(
            await this._safeRetrieveSub(stripeSubId)
          );
        }
        return { processed: false, reason: 'Already paid', orderId: order.id, oblioEnsured: true };
      }

      if (order) {
        await this.handleStripePaymentSuccess(order, {
          transactionId: invoice.payment_intent || invoice.id,
          rawData: invoice
        });
        return { processed: true, orderId: order.id, kind: 'initial' };
      }
    }

    // Fallback: treat as renewal if we have a local subscription
    if (stripeSubId) {
      return this._handleRenewalInvoice(invoice, { stripeSubId, eventId });
    }

    return { processed: false, reason: 'unmapped_invoice' };
  }

  async _safeRetrieveSub(stripeSubId) {
    try {
      return await this._getStripePaymentService().retrieveSubscription(stripeSubId);
    } catch (_) {
      return { id: stripeSubId };
    }
  }

  async _handleRenewalInvoice(invoice, { stripeSubId, eventId }) {
    const local = await this._findLocalSubscriptionByStripeId(stripeSubId);
    if (!local) {
      return { processed: false, reason: 'subscription_not_found_for_renewal' };
    }

    // Idempotency: same stripe invoice already stored
    if (invoice?.id) {
      const { data: existing } = await this.supabase
        .from('orders')
        .select('id')
        .eq('stripe_invoice_id', invoice.id)
        .maybeSingle();
      if (existing?.id) {
        return { processed: false, reason: 'invoice_already_recorded', orderId: existing.id };
      }
    }

    const amountMajor =
      typeof invoice.amount_paid === 'number'
        ? invoice.amount_paid / 100
        : Number(local.subscription_tiers?.price) || 0;

    const periodStart = invoice.lines?.data?.[0]?.period?.start
      ? new Date(invoice.lines.data[0].period.start * 1000).toISOString()
      : new Date().toISOString();
    const periodEnd = invoice.lines?.data?.[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
      : this.calculatePeriodEnd(new Date(), local.subscription_tiers?.interval || 'MONTHLY').toISOString();

    const { data: renewalOrder, error: orderErr } = await this.supabase
      .from('orders')
      .insert({
        user_id: local.user_id,
        subscription_id: local.id,
        amount: amountMajor,
        currency: String(invoice.currency || 'ron').toUpperCase(),
        status: 'SUCCEEDED',
        payment_provider_reference: invoice.payment_intent || invoice.id,
        stripe_invoice_id: invoice.id || null,
        billing_details: {},
        metadata: {
          tier_id: local.tier_id,
          tier_name: local.subscription_tiers?.name,
          kind: 'renewal',
          stripe_event_id: eventId || null,
          billing_reason: invoice.billing_reason
        }
      })
      .select()
      .single();

    if (orderErr) {
      throw new Error(`Failed to create renewal order: ${orderErr.message}`);
    }

    await this.supabase
      .from('subscriptions')
      .update({
        status: 'ACTIVE',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString()
      })
      .eq('id', local.id);

    const profileTier = this._mapProfileSubscriptionTier(local.subscription_tiers?.name);
    await this.supabase
      .from('profiles')
      .update({
        subscription_tier: profileTier,
        updated_at: new Date().toISOString()
      })
      .eq('id', local.user_id);

    await this.logPaymentEvent({
      orderId: renewalOrder.id,
      subscriptionId: local.id,
      eventType: 'PAYMENT_SUCCEEDED',
      paymentProviderReference: invoice.id,
      amount: amountMajor,
      currency: renewalOrder.currency,
      status: 'SUCCEEDED',
      rawPayload: invoice
    });

    await this.afterPaymentSuccessSideEffects(renewalOrder.id, local.user_id);

    return { processed: true, kind: 'renewal', orderId: renewalOrder.id };
  }

  /**
   * Free-tier maintenance: Oblio queue + light Stripe drift sync (batch capped).
   */
  async runPaymentsMaintenanceSweeper({ oblioLimit = 20, driftLimit = 10 } = {}) {
    const oblioResult = await this._getOblioInvoiceService().processQueue({ limit: oblioLimit });

    const { data: due } = await this.supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, cancel_at_period_end, current_period_end')
      .not('stripe_subscription_id', 'is', null)
      .in('status', ['ACTIVE', 'PAST_DUE', 'TRIALING'])
      .lte('current_period_end', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .limit(driftLimit);

    let synced = 0;
    const stripe = this._getStripePaymentService();
    for (const row of due || []) {
      try {
        const remote = await stripe.retrieveSubscription(row.stripe_subscription_id);
        await this.syncSubscriptionFromStripe(remote);
        synced += 1;
      } catch (e) {
        console.warn('Drift sync failed for', row.id, e?.message || e);
      }
    }

    return { oblio: oblioResult, driftSynced: synced };
  }

  /**
   * Creează sesiune Stripe Customer Portal pentru utilizator.
   * @param {string} userId
   * @param {string} [returnUrl]
   * @returns {Promise<{ portalUrl: string }>}
   */
  async createStripeCustomerPortalSession(userId, returnUrl) {
    assertPaymentsEnabled();

    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error('Profilul utilizatorului nu a fost găsit');
    }

    const stripe = this._getStripePaymentService();
    let stripeCustomerId = profile?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const { data: userData, error: userError } = await this.supabase.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        throw new Error('Nu s-a putut determina email-ul utilizatorului pentru Stripe Customer Portal');
      }

      stripeCustomerId = await stripe.createOrFindCustomer({
        email: userData.user.email,
        userId
      });

      await this.supabase
        .from('profiles')
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    }

    return stripe.createCustomerPortalLink({
      customerId: stripeCustomerId,
      returnUrl
    });
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
      assertPaymentsEnabled();

      // Get order details
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      if (!order.payment_provider_reference) {
        throw new Error('Comanda nu are referință de plată pentru refund');
      }

      const stripe = this._getStripePaymentService();
      const refundResult = await stripe.createRefund({
        paymentReference: order.payment_provider_reference,
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
          payment_refund_reference: refundResult.paymentRefundReference,
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
        paymentProviderReference: order.payment_provider_reference,
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
        paymentProviderReference,
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
          payment_provider_reference: paymentProviderReference,
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
   * Get orphan payments (confirmed but no subscription match)
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
        updatedAt: tier.updated_at,
        stripePriceId: tier.stripe_price_id || null
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
          updatedAt: subscription.subscription_tiers.updated_at,
          stripePriceId: subscription.subscription_tiers.stripe_price_id || null
        } : null
      };

    } catch (error) {
      console.error('SubscriptionService.getUserSubscription error:', error);
      throw error;
    }
  }

  /**
   * Get subscription tiers
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
