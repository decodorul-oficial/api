/**
 * Test script pentru verificarea sistemului de digest zilnic
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

// Get current file directory for imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import services
import { EmailTemplateRepository } from './api/src/database/repositories/EmailTemplateRepository.js';
import { EmailTemplateService } from './api/src/core/services/EmailTemplateService.js';
import { NewsletterRepository } from './api/src/database/repositories/NewsletterRepository.js';
import { DailyDigestService } from './api/src/core/services/DailyDigestService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize services
const emailTemplateRepository = new EmailTemplateRepository(supabase);
const emailTemplateService = new EmailTemplateService(emailTemplateRepository);
const newsletterRepository = new NewsletterRepository(supabase);
const dailyDigestService = new DailyDigestService(supabase, emailTemplateService, newsletterRepository);

async function testDailyDigestSystem() {
  console.log('🧪 Testing Daily Digest System...\n');

  try {
    // Test 1: Verifică tabela email_templates
    console.log('1. Testing email_templates table...');
    const { data: templates, error: templatesError } = await supabase
      .from('payments.email_templates')
      .select('*')
      .eq('template_name', 'daily_article_digest');

    if (templatesError) {
      console.error('❌ Error fetching email templates:', templatesError.message);
    } else if (templates.length === 0) {
      console.error('❌ Daily digest template not found');
    } else {
      console.log('✅ Daily digest template found');
      console.log(`   - Template ID: ${templates[0].id}`);
      console.log(`   - Subject: ${templates[0].subject}`);
    }

    // Test 2: Verifică tabela email_digest_logs
    console.log('\n2. Testing email_digest_logs table...');
    const { data: logs, error: logsError } = await supabase
      .from('payments.email_digest_logs')
      .select('*')
      .limit(5);

    if (logsError) {
      console.error('❌ Error fetching digest logs:', logsError.message);
    } else {
      console.log('✅ Email digest logs table accessible');
      console.log(`   - Found ${logs.length} existing logs`);
    }

    // Test 3: Verifică coloanele din subscription_tiers
    console.log('\n3. Testing subscription_tiers max_email_notifications column...');
    const { data: tiers, error: tiersError } = await supabase
      .from('payments.subscription_tiers')
      .select('name, max_email_notifications');

    if (tiersError) {
      console.error('❌ Error fetching subscription tiers:', tiersError.message);
    } else {
      console.log('✅ Subscription tiers with email notification limits:');
      tiers.forEach(tier => {
        console.log(`   - ${tier.name}: ${tier.max_email_notifications} notifications`);
      });
    }

    // Test 4: Verifică coloana din saved_searches
    console.log('\n4. Testing saved_searches email_notifications_enabled column...');
    const { data: searches, error: searchesError } = await supabase
      .from('saved_searches')
      .select('id, name, email_notifications_enabled')
      .limit(5);

    if (searchesError) {
      console.error('❌ Error fetching saved searches:', searchesError.message);
    } else {
      console.log('✅ Saved searches with email notification settings:');
      searches.forEach(search => {
        console.log(`   - ${search.name}: ${search.email_notifications_enabled ? 'enabled' : 'disabled'}`);
      });
    }

    // Test 5: Verifică funcțiile de bază de date
    console.log('\n5. Testing database functions...');
    
    // Test get_users_with_active_email_notifications
    const { data: users, error: usersError } = await supabase.rpc('get_users_with_active_email_notifications');
    
    if (usersError) {
      console.error('❌ Error testing get_users_with_active_email_notifications function:', usersError.message);
    } else {
      console.log('✅ get_users_with_active_email_notifications function working');
      console.log(`   - Found ${users.length} users with active notifications`);
    }

    // Test get_user_email_notification_limit
    const testUserId = '00000000-0000-0000-0000-000000000000';
    const { data: limit, error: limitError } = await supabase.rpc('get_user_email_notification_limit', {
      p_user_id: testUserId
    });
    
    if (limitError) {
      console.error('❌ Error testing get_user_email_notification_limit function:', limitError.message);
    } else {
      console.log('✅ get_user_email_notification_limit function working');
      console.log(`   - Default limit for test user: ${limit}`);
    }

    // Test 6: Verifică EmailTemplateService
    console.log('\n6. Testing EmailTemplateService...');
    try {
      const template = await emailTemplateService.getTemplateByName('daily_article_digest');
      if (template) {
        console.log('✅ EmailTemplateService working');
        console.log(`   - Template found: ${template.templateName}`);
        
        // Test template processing with sample data
        const testVariables = {
          userName: 'Test User',
          currentDate: new Date().toLocaleDateString('ro-RO'),
          totalArticleCount: 3,
          articleList: [
            {
              title: 'Test Article 1',
              link: 'https://example.com/article1',
              excerpt: 'This is a test article excerpt...',
              publishedAt: new Date().toLocaleDateString('ro-RO'),
              source: 'Test Source',
              searchName: 'Test Search'
            }
          ]
        };
        
        const processedTemplate = await emailTemplateService.processTemplate('daily_article_digest', testVariables);
        console.log('✅ Template processing working');
        console.log(`   - Processed subject: ${processedTemplate.subject}`);
      } else {
        console.error('❌ Daily digest template not found');
      }
    } catch (error) {
      console.error('❌ Error testing EmailTemplateService:', error.message);
    }

    // Test 7: Verifică DailyDigestService (fără să trimită email-uri reale)
    console.log('\n7. Testing DailyDigestService...');
    try {
      // Test getDigestStats
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      const stats = await dailyDigestService.getDigestStats(startDate, endDate);
      console.log('✅ DailyDigestService.getDigestStats working');
      console.log(`   - Stats for last 7 days:`, stats);
      
    } catch (error) {
      console.error('❌ Error testing DailyDigestService:', error.message);
    }

    // Test 8: Verifică NewsletterRepository
    console.log('\n8. Testing NewsletterRepository...');
    try {
      // Test sendEmail (simulation)
      const testEmailData = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>This is a test email</p>'
      };
      
      const result = await newsletterRepository.sendEmail(testEmailData);
      console.log('✅ NewsletterRepository.sendEmail working');
      console.log(`   - Email simulation result: ${result.success ? 'success' : 'failed'}`);
      
    } catch (error) {
      console.error('❌ Error testing NewsletterRepository:', error.message);
    }

    console.log('\n🎉 Daily Digest System test completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testDailyDigestSystem();
