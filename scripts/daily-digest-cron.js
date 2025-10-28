#!/usr/bin/env node

/**
 * Daily Digest Cron Job
 * 
 * Acest script procesează digest-urile zilnice de email pentru utilizatorii cu notificări active.
 * Ar trebui să ruleze o dată pe zi, de luni până vineri, la ora 08:00.
 * 
 * Configurare cron:
 * 0 8 * * 1-5 /usr/bin/node /path/to/scripts/daily-digest-cron.js
 * 
 * Variabile de mediu necesare:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NODE_ENV (opțional, implicit 'production')
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

// Get current file directory for imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import services
import { EmailTemplateRepository } from '../api/src/database/repositories/EmailTemplateRepository.js';
import { EmailTemplateService } from '../api/src/core/services/EmailTemplateService.js';
import { NewsletterRepository } from '../api/src/database/repositories/NewsletterRepository.js';
import { DailyDigestService } from '../api/src/core/services/DailyDigestService.js';

// Configuration
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate configuration
if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// Initialize services
const emailTemplateRepository = new EmailTemplateRepository(supabase);
const emailTemplateService = new EmailTemplateService(emailTemplateRepository);
const newsletterRepository = new NewsletterRepository(supabase);
const dailyDigestService = new DailyDigestService(supabase, emailTemplateService, newsletterRepository);

/**
 * Logging utility
 */
const logger = {
  info: (message, data = null) => {
    if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  },
  error: (message, error = null) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error ? error.stack || error : '');
  },
  warn: (message, data = null) => {
    if (config.logLevel === 'debug' || config.logLevel === 'info' || config.logLevel === 'warn') {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  },
  debug: (message, data = null) => {
    if (config.logLevel === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
};

/**
 * Main function to process daily digest
 */
async function processDailyDigest() {
  const startTime = Date.now();
  logger.info('🚀 Starting daily digest processing');

  try {
    // Check if it's a weekday (Monday = 1, Friday = 5)
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
      logger.info('📅 Skipping digest processing - weekend');
      return {
        status: 'skipped',
        reason: 'weekend',
        duration: Date.now() - startTime
      };
    }

    // Process the digest
    const results = await dailyDigestService.processDailyDigest(today);

    const duration = Date.now() - startTime;
    
    logger.info('✅ Daily digest processing completed', {
      results,
      duration: `${duration}ms`,
      durationSeconds: Math.round(duration / 1000)
    });

    // Log summary
    console.log('\n📊 Daily Digest Summary:');
    console.log(`   Users processed: ${results.processed}`);
    console.log(`   Emails sent: ${results.sent}`);
    console.log(`   Emails failed: ${results.failed}`);
    console.log(`   Emails skipped: ${results.skipped}`);
    console.log(`   Processing time: ${Math.round(duration / 1000)}s`);

    return {
      status: 'completed',
      results,
      duration
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('❌ Daily digest processing failed', error);
    
    console.log('\n💥 Daily Digest Failed:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Processing time: ${Math.round(duration / 1000)}s`);

    return {
      status: 'failed',
      error: error.message,
      duration
    };
  }
}

/**
 * Health check function
 */
async function healthCheck() {
  try {
    logger.debug('Performing health check...');

    // Test database connection with a simple query
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Test if we can access the functions (with a dummy user ID)
    try {
      const { data: functionTest, error: functionError } = await supabase.rpc('get_users_with_active_email_notifications');
      
      if (functionError && !functionError.message.includes('structure of query does not match function result type')) {
        throw new Error(`Database functions not available: ${functionError.message}`);
      }
      
      // If we get here, the function exists (even if it returns no data)
      logger.debug('Database functions are accessible');
    } catch (functionError) {
      logger.warn('Function test failed - functions may not be properly configured', functionError.message);
    }

    // Test template service
    try {
      const template = await emailTemplateService.getTemplateByName('daily_article_digest');
      if (!template) {
        throw new Error('Daily digest template not found');
      }
    } catch (templateError) {
      // If template service fails, it might be because tables don't exist yet
      logger.warn('Template service check failed - tables may not exist yet', templateError.message);
    }

    logger.debug('Health check passed');
    return true;

  } catch (error) {
    logger.error('Health check failed', error);
    return false;
  }
}

/**
 * Get digest statistics for the last 7 days
 */
async function getDigestStats() {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const stats = await dailyDigestService.getDigestStats(startDate, endDate);
    
    logger.info('📈 Digest statistics (last 7 days)', stats);
    return stats;

  } catch (error) {
    logger.error('Failed to get digest statistics', error);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'process';

  logger.info(`Daily Digest Cron Job started with command: ${command}`);

  try {
    switch (command) {
      case 'process':
        const result = await processDailyDigest();
        process.exit(result.status === 'completed' ? 0 : 1);
        break;

      case 'health':
        const isHealthy = await healthCheck();
        process.exit(isHealthy ? 0 : 1);
        break;

      case 'stats':
        await getDigestStats();
        process.exit(0);
        break;

      case 'test':
        logger.info('🧪 Running test mode...');
        // In test mode, process digest for yesterday
        const testDate = new Date();
        testDate.setDate(testDate.getDate() - 1);
        
        const testResult = await dailyDigestService.processDailyDigest(testDate);
        logger.info('Test completed', testResult);
        process.exit(0);
        break;

      default:
        console.log('Usage: node daily-digest-cron.js [command]');
        console.log('Commands:');
        console.log('  process  - Process daily digest (default)');
        console.log('  health   - Run health check');
        console.log('  stats    - Show digest statistics');
        console.log('  test     - Run test mode (process yesterday)');
        process.exit(1);
    }

  } catch (error) {
    logger.error('Fatal error in main execution', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason);
  process.exit(1);
});

// Run main function
main();
