/**
 * POST /api/payment/stripe/webhook — același handler ca POST /webhook/stripe.
 * Body brut: `req.rawBody` (express.json verify din index.js).
 * @see docs/STRIPE_PAYMENTS.md
 */

import express from 'express';
import { handleStripeWebhookRequest } from './stripeWebhookDelegate.js';

const router = express.Router();

router.post('/webhook', (req, res) => {
  handleStripeWebhookRequest(req, res);
});

export default router;
