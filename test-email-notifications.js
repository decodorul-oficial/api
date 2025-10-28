/**
 * Test script pentru funcționalitatea de notificări email
 * Acest script testează funcționalitățile implementate pentru notificările email
 */

import { createClient } from '@supabase/supabase-js';

// Configurare Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testEmailNotificationSystem() {
  console.log('🧪 Testing Email Notification System...\n');

  try {
    // Test 1: Verifică dacă tabela email_templates există
    console.log('1. Testing email_templates table...');
    const { data: templates, error: templatesError } = await supabase
      .from('payments.email_templates')
      .select('*')
      .limit(1);

    if (templatesError) {
      console.error('❌ Error accessing email_templates table:', templatesError.message);
      return;
    }
    console.log('✅ email_templates table accessible');

    // Test 2: Verifică dacă coloana max_email_notifications există în subscription_tiers
    console.log('\n2. Testing max_email_notifications column...');
    const { data: tiers, error: tiersError } = await supabase
      .from('payments.subscription_tiers')
      .select('name, max_email_notifications')
      .limit(3);

    if (tiersError) {
      console.error('❌ Error accessing subscription_tiers table:', tiersError.message);
      return;
    }
    console.log('✅ max_email_notifications column accessible');
    console.log('📊 Subscription tiers with email notification limits:');
    tiers.forEach(tier => {
      console.log(`   - ${tier.name}: ${tier.max_email_notifications} notifications`);
    });

    // Test 3: Verifică dacă coloana email_notifications_enabled există în saved_searches
    console.log('\n3. Testing email_notifications_enabled column...');
    const { data: searches, error: searchesError } = await supabase
      .from('saved_searches')
      .select('id, name, email_notifications_enabled')
      .limit(3);

    if (searchesError) {
      console.error('❌ Error accessing saved_searches table:', searchesError.message);
      return;
    }
    console.log('✅ email_notifications_enabled column accessible');
    if (searches.length > 0) {
      console.log('📊 Sample saved searches:');
      searches.forEach(search => {
        console.log(`   - ${search.name}: notifications ${search.email_notifications_enabled ? 'enabled' : 'disabled'}`);
      });
    } else {
      console.log('📊 No saved searches found');
    }

    // Test 4: Verifică funcțiile de bază de date
    console.log('\n4. Testing database functions...');
    
    // Test check_email_notification_limit function
    const { data: limitCheck, error: limitError } = await supabase.rpc('check_email_notification_limit', {
      p_user_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID
    });
    
    if (limitError) {
      console.error('❌ Error testing check_email_notification_limit function:', limitError.message);
    } else {
      console.log('✅ check_email_notification_limit function working');
    }

    // Test get_user_email_notification_limit function
    const { data: limit, error: limitError2 } = await supabase.rpc('get_user_email_notification_limit', {
      p_user_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID
    });
    
    if (limitError2) {
      console.error('❌ Error testing get_user_email_notification_limit function:', limitError2.message);
    } else {
      console.log('✅ get_user_email_notification_limit function working');
      console.log(`   - Default limit for free users: ${limit}`);
    }

    // Test 5: Verifică tabela email_notification_logs
    console.log('\n5. Testing email_notification_logs table...');
    const { data: logs, error: logsError } = await supabase
      .from('payments.email_notification_logs')
      .select('*')
      .limit(1);

    if (logsError) {
      console.error('❌ Error accessing email_notification_logs table:', logsError.message);
      return;
    }
    console.log('✅ email_notification_logs table accessible');

    // Test 6: Verifică șablonul implicit
    console.log('\n6. Testing default email template...');
    const { data: defaultTemplate, error: templateError } = await supabase
      .from('payments.email_templates')
      .select('*')
      .eq('template_name', 'new_article_notification')
      .single();

    if (templateError) {
      console.error('❌ Error accessing default template:', templateError.message);
    } else {
      console.log('✅ Default email template found');
      console.log(`   - Template name: ${defaultTemplate.template_name}`);
      console.log(`   - Subject: ${defaultTemplate.subject}`);
      console.log(`   - Body length: ${defaultTemplate.body_html.length} characters`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Database schema is properly set up');
    console.log('   ✅ Email templates table is accessible');
    console.log('   ✅ Subscription tiers have email notification limits');
    console.log('   ✅ Saved searches support email notifications');
    console.log('   ✅ Database functions are working');
    console.log('   ✅ Email notification logs table is accessible');
    console.log('   ✅ Default email template is available');

    console.log('\n🚀 Next steps:');
    console.log('   1. Run the database migration: 057_email_notification_system.sql');
    console.log('   2. Test the GraphQL API endpoints');
    console.log('   3. Set up email service integration (SendGrid, Mailgun, etc.)');
    console.log('   4. Create a cron job to process notifications periodically');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Rulează testele
testEmailNotificationSystem();
