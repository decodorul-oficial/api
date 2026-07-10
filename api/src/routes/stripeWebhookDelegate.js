/**
 * O singură instanță StripeWebhookService pentru toate rutele HTTP de webhook Stripe.
 * @see docs/STRIPE_PAYMENTS.md
 */

import StripeWebhookService from '../core/services/StripeWebhookService.js';

let stripeWebhookService = null;

export function handleStripeWebhookRequest(req, res) {
  if (!stripeWebhookService) {
    stripeWebhookService = new StripeWebhookService();
  }
  return stripeWebhookService.handleStripeWebhook(req, res);
}
