/**
 * Webhook Handler for Netopia IPN
 * Handles incoming webhooks from Netopia payment gateway
 */

import SubscriptionService from '../core/services/SubscriptionService.js';
import { createInternalApiKeyMiddleware } from './internalApiKey.js';

class WebhookHandler {
  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Handle Netopia webhook with instant ACK and async processing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {void}
   */
  async handleNetopiaWebhook(req, res) {
    const startTime = Date.now();
    let webhookId = null;
    
    try {
      // Validate internal API key for security
      const expectedKey = process.env.INTERNAL_API_KEY;
      const providedKey = req.headers['x-internal-api-key'];
      
      if (!expectedKey || !providedKey || String(providedKey) !== String(expectedKey)) {
        console.error('Invalid internal API key for webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Extract webhook data - NETOPIA API v2 sends JSON directly
      const webhookData = req.body;

      if (!webhookData || !webhookData.orderId) {
        console.error('Missing required webhook fields');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate webhook ID for tracking
      webhookId = this.generateWebhookId(JSON.stringify(webhookData), webhookData.orderId, Date.now());
      
      // Log incoming webhook
      console.log(`[${webhookId}] Webhook received at ${new Date().toISOString()}`);

      // For NETOPIA API v2, we don't need signature validation as it uses HTTPS
      // The webhook data comes directly as JSON

      // Send immediate ACK to Netopia
      res.status(200).json({ 
        success: true, 
        received: true,
        webhookId,
        timestamp: new Date().toISOString()
      });

      // Process webhook asynchronously (don't await)
      this.processWebhookAsync(webhookId, webhookData)
        .catch(error => {
          console.error(`[${webhookId}] Async webhook processing failed:`, error);
          // Log to monitoring system
          this.logWebhookError(webhookId, error);
        });

      const processingTime = Date.now() - startTime;
      console.log(`[${webhookId}] Webhook ACK sent in ${processingTime}ms`);

    } catch (error) {
      console.error(`[${webhookId}] Webhook handling error:`, error);
      
      // Always return 200 to prevent Netopia retries
      if (!res.headersSent) {
        res.status(200).json({ 
          success: false, 
          error: 'Webhook processing failed',
          webhookId,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Process webhook asynchronously
   * @param {string} webhookId - Webhook tracking ID
   * @param {Object} webhookData - Webhook data
   * @returns {Promise<void>}
   */
  async processWebhookAsync(webhookId, webhookData) {
    const startTime = Date.now();
    
    try {
      console.log(`[${webhookId}] Starting async webhook processing`);
      
      // Process webhook through subscription service
      const result = await this.subscriptionService.processWebhook(webhookData);
      
      const processingTime = Date.now() - startTime;
      
      if (result.processed) {
        console.log(`[${webhookId}] Webhook processed successfully in ${processingTime}ms:`, result);
        this.logWebhookSuccess(webhookId, result, processingTime);
      } else {
        console.log(`[${webhookId}] Webhook already processed in ${processingTime}ms:`, result.reason);
        this.logWebhookDuplicate(webhookId, result.reason, processingTime);
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[${webhookId}] Async webhook processing failed after ${processingTime}ms:`, error);
      this.logWebhookError(webhookId, error, processingTime);
      
      // Implement retry logic for critical errors
      if (this.shouldRetryWebhook(error)) {
        await this.scheduleWebhookRetry(webhookId, webhookData, error);
      }
    }
  }

  /**
   * Generate unique webhook ID for tracking
   * @param {string} payload - Webhook payload
   * @param {string} signature - Webhook signature
   * @param {number} timestamp - Webhook timestamp
   * @returns {string} Webhook ID
   */
  generateWebhookId(payload, signature, timestamp) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`${payload}-${signature}-${timestamp}`)
      .digest('hex')
      .substring(0, 16);
    return `wh_${Date.now()}_${hash}`;
  }

  /**
   * Check if webhook should be retried
   * @param {Error} error - Error object
   * @returns {boolean} Should retry
   */
  shouldRetryWebhook(error) {
    // Retry for network errors, timeouts, and temporary database issues
    const retryableErrors = [
      'ECONNABORTED',
      'ECONNRESET',
      'ETIMEDOUT',
      'database connection',
      'temporary failure'
    ];
    
    return retryableErrors.some(errorType => 
      error.message.toLowerCase().includes(errorType.toLowerCase())
    );
  }

  /**
   * Schedule webhook retry
   * @param {string} webhookId - Webhook ID
   * @param {Object} webhookData - Webhook data
   * @param {Error} error - Original error
   * @returns {Promise<void>}
   */
  async scheduleWebhookRetry(webhookId, webhookData, error) {
    // Implement exponential backoff retry
    const retryDelay = Math.min(1000 * Math.pow(2, 0), 30000); // Start with 1s, max 30s
    
    console.log(`[${webhookId}] Scheduling retry in ${retryDelay}ms`);
    
    setTimeout(async () => {
      try {
        await this.processWebhookAsync(`${webhookId}_retry`, webhookData);
      } catch (retryError) {
        console.error(`[${webhookId}] Retry failed:`, retryError);
        this.logWebhookRetryFailure(webhookId, retryError);
      }
    }, retryDelay);
  }

  /**
   * Log webhook success
   * @param {string} webhookId - Webhook ID
   * @param {Object} result - Processing result
   * @param {number} processingTime - Processing time in ms
   */
  logWebhookSuccess(webhookId, result, processingTime) {
    // Log to monitoring system
    console.log(`[MONITORING] Webhook Success: ${webhookId}, Time: ${processingTime}ms, Result: ${JSON.stringify(result)}`);
  }

  /**
   * Log webhook duplicate
   * @param {string} webhookId - Webhook ID
   * @param {string} reason - Duplicate reason
   * @param {number} processingTime - Processing time in ms
   */
  logWebhookDuplicate(webhookId, reason, processingTime) {
    console.log(`[MONITORING] Webhook Duplicate: ${webhookId}, Time: ${processingTime}ms, Reason: ${reason}`);
  }

  /**
   * Log webhook error
   * @param {string} webhookId - Webhook ID
   * @param {Error} error - Error object
   * @param {number} processingTime - Processing time in ms
   */
  logWebhookError(webhookId, error, processingTime = 0) {
    console.error(`[MONITORING] Webhook Error: ${webhookId}, Time: ${processingTime}ms, Error: ${error.message}`);
  }

  /**
   * Log webhook retry failure
   * @param {string} webhookId - Webhook ID
   * @param {Error} error - Retry error
   */
  logWebhookRetryFailure(webhookId, error) {
    console.error(`[MONITORING] Webhook Retry Failure: ${webhookId}, Error: ${error.message}`);
  }

  /**
   * Health check endpoint for webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {void}
   */
  async healthCheck(req, res) {
    try {
      return res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'webhook-handler'
      });
    } catch (error) {
      console.error('Health check error:', error);
      return res.status(500).json({ 
        status: 'unhealthy',
        error: error.message 
      });
    }
  }

  /**
   * Test webhook endpoint (for development)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {void}
   */
  async testWebhook(req, res) {
    try {
      // Validate internal API key
      const apiKey = req.headers['x-internal-api-key'];
      if (!validateInternalApiKey(apiKey)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Create test webhook payload
      const testPayload = {
        payload: 'test-encrypted-payload',
        signature: 'test-signature',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const result = await this.subscriptionService.processWebhook(testPayload);
      
      return res.status(200).json({
        success: true,
        test: true,
        result
      });

    } catch (error) {
      console.error('Test webhook error:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}

export default WebhookHandler;
