/**
 * Rute REST Stripe (necesită același auth ca GraphQL).
 * @see docs/STRIPE_PAYMENTS.md
 */

import express from 'express';
import SubscriptionService from '../core/services/SubscriptionService.js';
import { isPaymentsEnabled } from '../utils/paymentsEnabled.js';

const router = express.Router();
const subscriptionService = new SubscriptionService();

router.post('/checkout-session', async (req, res) => {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(503).json({ error: 'Plățile sunt temporar dezactivate.', code: 'PAYMENTS_DISABLED' });
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      tierId,
      mode = 'subscription',
      successUrl,
      customerEmail,
      customerPhone,
      billingDetails,
      shippingAddress,
      stripePriceId,
      stripeProductId
    } = req.body || {};

    if (!tierId || typeof tierId !== 'string') {
      return res.status(400).json({
        error: 'tierId este obligatoriu (UUID-ul tier-ului ales din getSubscriptionTiers).'
      });
    }

    const checkoutMode = mode === 'payment' ? 'payment' : 'subscription';

    const result = await subscriptionService.startCheckout(req.user.id, tierId, {
      stripeCheckoutMode: checkoutMode,
      stripePriceId,
      stripeProductId,
      stripeSuccessUrl: successUrl,
      customerEmail,
      customerPhone,
      billingDetails,
      shippingAddress
    });

    return res.status(200).json({
      session_url: result.checkoutUrl,
      session_id: result.sessionId,
      order_id: result.orderId,
      expires_at: result.expiresAt
    });
  } catch (e) {
    console.error('Stripe checkout-session error:', e);
    const status = e?.code === 'PAYMENTS_DISABLED' ? 503 : 500;
    return res.status(status).json({ error: e?.message || 'Internal error', code: e?.code });
  }
});

router.post('/customer-portal', async (req, res) => {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(503).json({ error: 'Plățile sunt temporar dezactivate.', code: 'PAYMENTS_DISABLED' });
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { return_url: returnUrlSnake, returnUrl } = req.body || {};
    const { portalUrl } = await subscriptionService.createStripeCustomerPortalSession(
      req.user.id,
      returnUrl || returnUrlSnake
    );

    return res.status(200).json({ portal_url: portalUrl });
  } catch (e) {
    console.error('Stripe customer-portal error:', e);
    const status = e?.code === 'PAYMENTS_DISABLED' ? 503 : 500;
    return res.status(status).json({ error: e?.message || 'Internal error', code: e?.code });
  }
});

export default router;
