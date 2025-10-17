#!/usr/bin/env node

/**
 * Script pentru testarea query-ului de profil
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testProfileQuery() {
  try {
    console.log('🔍 Testez query-ul de profil...\n');

    const userId = '88558742-5ae2-441c-8f3f-49fa0c5f23a3';
    
    // Testez exact query-ul din resolver
    console.log('1. Testez query-ul exact din resolver:');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, subscription_tier')
      .eq('id', userId)
      .single();
    
    if (profileError) {
      console.error('❌ Eroare la query-ul de profil:', profileError.message);
      console.log('   - Error code:', profileError.code);
      console.log('   - Error details:', profileError.details);
    } else {
      console.log('✅ Profil găsit:');
      console.log('   - Display Name:', profileData.display_name);
      console.log('   - Avatar URL:', profileData.avatar_url);
      console.log('   - Subscription Tier:', profileData.subscription_tier);
    }
    
    // Testez cu select * pentru a vedea toate datele
    console.log('\n2. Testez cu select *:');
    const { data: allProfileData, error: allProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (allProfileError) {
      console.error('❌ Eroare la query-ul cu select *:', allProfileError.message);
    } else {
      console.log('✅ Profil complet găsit:');
      console.log(JSON.stringify(allProfileData, null, 2));
    }
    
    // Testez cu service client
    console.log('\n3. Testez cu service client:');
    const { data: serviceProfileData, error: serviceProfileError } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, subscription_tier')
      .eq('id', userId)
      .single();
    
    if (serviceProfileError) {
      console.error('❌ Eroare la query-ul cu service client:', serviceProfileError.message);
    } else {
      console.log('✅ Profil cu service client găsit:');
      console.log('   - Display Name:', serviceProfileData.display_name);
      console.log('   - Avatar URL:', serviceProfileData.avatar_url);
      console.log('   - Subscription Tier:', serviceProfileData.subscription_tier);
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testProfileQuery();
