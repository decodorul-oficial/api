#!/usr/bin/env node

/**
 * Script pentru procesarea notificărilor email (legacy instant path).
 *
 * @deprecated — Faza 3 uses watches + pg_net → instant-watch-alerts.
 * Do not schedule this in production.
 */

import { createClient } from '@supabase/supabase-js';
import { EmailNotificationService } from '../api/src/core/services/EmailNotificationService.js';
import { SavedSearchRepository } from '../api/src/database/repositories/SavedSearchRepository.js';
import { EmailTemplateService } from '../api/src/core/services/EmailTemplateService.js';
import { EmailTemplateRepository } from '../api/src/database/repositories/EmailTemplateRepository.js';
import { StiriRepository } from '../api/src/database/repositories/StiriRepository.js';
import { NewsletterRepository } from '../api/src/database/repositories/NewsletterRepository.js';

// Configurare
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurare pentru procesare
const config = {
  hoursBack: parseInt(process.env.NOTIFICATION_HOURS_BACK) || 24, // Verifică articolele din ultimele 24 de ore
  batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE) || 50, // Procesează maximum 50 de căutări per batch
  dryRun: process.env.NOTIFICATION_DRY_RUN === 'true', // Dacă este true, nu trimite emailuri reale
  logLevel: process.env.LOG_LEVEL || 'info'
};

function log(level, message, ...args) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = levels[config.logLevel] || 2;
  
  if (levels[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
  }
}

async function processEmailNotifications() {
  log('info', '🚀 Starting email notification processing...');
  log('info', `📋 Configuration:`, {
    hoursBack: config.hoursBack,
    batchSize: config.batchSize,
    dryRun: config.dryRun,
    logLevel: config.logLevel
  });

  try {
    // Inițializează serviciile
    const savedSearchRepository = new SavedSearchRepository(supabase);
    const emailTemplateRepository = new EmailTemplateRepository(supabase);
    const emailTemplateService = new EmailTemplateService(emailTemplateRepository);
    const stiriRepository = new StiriRepository(supabase);
    const newsletterRepository = new NewsletterRepository(supabase);
    
    const emailNotificationService = new EmailNotificationService(
      savedSearchRepository,
      emailTemplateService,
      stiriRepository,
      newsletterRepository
    );

    // Procesează notificările
    const result = await emailNotificationService.processNewArticleNotifications({
      hoursBack: config.hoursBack,
      batchSize: config.batchSize,
      dryRun: config.dryRun
    });

    log('info', '✅ Email notification processing completed');
    log('info', '📊 Results:', result);

    // Verifică dacă au fost erori
    if (result.errors > 0) {
      log('warn', `⚠️  ${result.errors} errors occurred during processing`);
    }

    // Loghează statistici
    if (result.processed > 0) {
      const successRate = ((result.notificationsSent / result.processed) * 100).toFixed(2);
      log('info', `📈 Success rate: ${successRate}% (${result.notificationsSent}/${result.processed})`);
    }

    return result;

  } catch (error) {
    log('error', '❌ Error processing email notifications:', error);
    throw error;
  }
}

async function main() {
  const startTime = Date.now();
  
  try {
    await processEmailNotifications();
    
    const duration = Date.now() - startTime;
    log('info', `⏱️  Processing completed in ${duration}ms`);
    
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    log('error', `💥 Processing failed after ${duration}ms:`, error.message);
    process.exit(1);
  }
}

// Gestionarea semnalelor pentru shutdown graceful
process.on('SIGINT', () => {
  log('info', '🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', '🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Rulează scriptul
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { processEmailNotifications };
