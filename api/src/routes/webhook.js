/**
 * Webhook Routes — Stripe only
 */

import express from 'express';
import { handleStripeWebhookRequest } from './stripeWebhookDelegate.js';

const router = express.Router();

router.post('/stripe', (req, res) => {
  handleStripeWebhookRequest(req, res);
});

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', stripe: true });
});

export default router;
