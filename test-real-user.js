#!/usr/bin/env node

/**
 * Script pentru testarea cu un utilizator real din Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY nu este setat');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testWithRealUser() {
  try {
    console.log('🔍 Caut utilizatori în baza de date...\n');

    // 1. Verifică dacă există utilizatori în profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, subscription_tier, trial_end')
      .limit(5);

    if (profilesError) {
      console.error('❌ Eroare la obținerea profilurilor:', profilesError.message);
      return;
    }

    console.log('👥 Utilizatori găsiți:', profiles?.length || 0);
    if (profiles && profiles.length > 0) {
      console.log('Primul utilizator:', profiles[0]);
    }

    // 2. Verifică dacă există utilizatori în auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Eroare la obținerea utilizatorilor auth:', authError.message);
      return;
    }

    console.log('🔐 Utilizatori autentificați:', authUsers?.users?.length || 0);
    if (authUsers?.users && authUsers.users.length > 0) {
      console.log('Primul utilizator auth:', {
        id: authUsers.users[0].id,
        email: authUsers.users[0].email,
        created_at: authUsers.users[0].created_at
      });
    }

    // 3. Testează crearea unui comentariu cu primul utilizator
    if (profiles && profiles.length > 0) {
      const userId = profiles[0].id;
      console.log(`\n🧪 Testez crearea unui comentariu cu utilizatorul ${userId}...`);

      const { data: comment, error: commentError } = await supabase
        .from('comments')
        .insert({
          user_id: userId,
          content: 'Test comentariu din script',
          parent_type: 'stire',
          parent_id: '881'
        })
        .select('*')
        .single();

      if (commentError) {
        console.error('❌ Eroare la crearea comentariului:', commentError.message);
      } else {
        console.log('✅ Comentariu creat cu succes:', comment);
      }
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testWithRealUser();
