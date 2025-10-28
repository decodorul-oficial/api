/**
 * Test script pentru verificarea funcționalității email notifications pentru utilizatorii în trial
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testTrialEmailNotifications() {
  console.log('🧪 Testing Email Notifications for Trial Users...\n');

  try {
    // Test 1: Verifică tier-urile din subscription_tiers
    console.log('1. Checking subscription tiers...');
    const { data: tiers, error: tiersError } = await supabase
      .from('payments.subscription_tiers')
      .select('name, max_email_notifications')
      .order('name');

    if (tiersError) {
      console.error('❌ Error fetching subscription tiers:', tiersError.message);
    } else {
      console.log('✅ Subscription tiers:');
      tiers.forEach(tier => {
        console.log(`   - ${tier.name}: ${tier.max_email_notifications} notifications`);
      });
    }

    // Test 2: Creează un utilizator de test în trial
    console.log('\n2. Creating test trial user...');
    const testUserId = '00000000-0000-0000-0000-000000000001';
    
    // Șterge utilizatorul de test dacă există
    await supabase.from('profiles').delete().eq('id', testUserId);
    
    // Creează profilul de test cu trial
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14); // 14 days trial
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: testUserId,
        subscription_tier: 'pro', // Set to 'pro' like in trial
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
        trial_tier_id: tiers.find(t => t.name === 'pro-monthly')?.id,
        display_name: 'Test Trial User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating test profile:', profileError.message);
    } else {
      console.log('✅ Test trial user created:');
      console.log(`   - ID: ${profile.id}`);
      console.log(`   - Subscription Tier: ${profile.subscription_tier}`);
      console.log(`   - Trial End: ${profile.trial_end}`);
      console.log(`   - Is in Trial: ${new Date() < new Date(profile.trial_end)}`);
    }

    // Test 3: Testează funcția get_user_email_notification_limit
    console.log('\n3. Testing get_user_email_notification_limit function...');
    const { data: limit, error: limitError } = await supabase.rpc('get_user_email_notification_limit', {
      p_user_id: testUserId
    });
    
    if (limitError) {
      console.error('❌ Error testing get_user_email_notification_limit function:', limitError.message);
    } else {
      console.log('✅ get_user_email_notification_limit function result:');
      console.log(`   - Limit for trial user: ${limit}`);
      console.log(`   - Expected: 5 (pro-monthly limit)`);
      console.log(`   - Test ${limit === 5 ? 'PASSED' : 'FAILED'}`);
    }

    // Test 4: Testează funcția check_email_notification_limit
    console.log('\n4. Testing check_email_notification_limit function...');
    const { data: canEnable, error: canEnableError } = await supabase.rpc('check_email_notification_limit', {
      p_user_id: testUserId
    });
    
    if (canEnableError) {
      console.error('❌ Error testing check_email_notification_limit function:', canEnableError.message);
    } else {
      console.log('✅ check_email_notification_limit function result:');
      console.log(`   - Can enable more notifications: ${canEnable}`);
      console.log(`   - Expected: true (under limit)`);
      console.log(`   - Test ${canEnable === true ? 'PASSED' : 'FAILED'}`);
    }

    // Test 5: Testează cu utilizator free (nu în trial)
    console.log('\n5. Testing with free user (not in trial)...');
    const freeUserId = '00000000-0000-0000-0000-000000000002';
    
    // Șterge utilizatorul free dacă există
    await supabase.from('profiles').delete().eq('id', freeUserId);
    
    // Creează profilul free
    const { data: freeProfile, error: freeProfileError } = await supabase
      .from('profiles')
      .insert({
        id: freeUserId,
        subscription_tier: 'free',
        display_name: 'Test Free User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (freeProfileError) {
      console.error('❌ Error creating free profile:', freeProfileError.message);
    } else {
      console.log('✅ Free user created');
    }

    // Testează limita pentru utilizatorul free
    const { data: freeLimit, error: freeLimitError } = await supabase.rpc('get_user_email_notification_limit', {
      p_user_id: freeUserId
    });
    
    if (freeLimitError) {
      console.error('❌ Error testing limit for free user:', freeLimitError.message);
    } else {
      console.log('✅ Free user limit test:');
      console.log(`   - Limit for free user: ${freeLimit}`);
      console.log(`   - Expected: 0 (free limit)`);
      console.log(`   - Test ${freeLimit === 0 ? 'PASSED' : 'FAILED'}`);
    }

    // Test 6: Cleanup
    console.log('\n6. Cleaning up test data...');
    await supabase.from('profiles').delete().eq('id', testUserId);
    await supabase.from('profiles').delete().eq('id', freeUserId);
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 Trial email notifications test completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testTrialEmailNotifications();
