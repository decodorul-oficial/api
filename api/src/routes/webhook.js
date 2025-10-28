/**
 * Webhook Routes
 * Handles webhook endpoints for external services
 */

import express from 'express';
import WebhookHandler from '../middleware/webhookHandler.js';
import { createInternalApiKeyMiddleware } from '../middleware/internalApiKey.js';

const router = express.Router();
const webhookHandler = new WebhookHandler();
const internalApiKeyMiddleware = createInternalApiKeyMiddleware();

// Middleware for parsing JSON
router.use(express.json({ limit: '10mb' }));

// Netopia webhook endpoint
router.post('/netopia/ipn', internalApiKeyMiddleware, async (req, res) => {
  await webhookHandler.handleNetopiaWebhook(req, res);
});

// Health check endpoint
router.get('/health', async (req, res) => {
  await webhookHandler.healthCheck(req, res);
});

// Test webhook endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', async (req, res) => {
    await webhookHandler.testWebhook(req, res);
  });
}

export default router;
