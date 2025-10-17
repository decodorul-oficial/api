#!/usr/bin/env node

/**
 * Script pentru debug-ul utilizatorului din comentariu
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugCommentUser() {
  try {
    console.log('🔍 Debug pentru utilizatorul din comentariu...\n');

    // ID-ul comentariului cu probleme
    const commentId = '86e14555-d50a-4490-9796-fedfffb8bd98';
    
    // 1. Verifică comentariul în baza de date
    console.log('1. Verific comentariul în baza de date:');
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .single();
    
    if (commentError) {
      console.error('❌ Eroare la obținerea comentariului:', commentError.message);
      return;
    }
    
    console.log('✅ Comentariu găsit:');
    console.log('   - ID:', comment.id);
    console.log('   - User ID:', comment.user_id);
    console.log('   - Content:', comment.content);
    console.log('   - Created At:', comment.created_at);
    
    // 2. Verifică utilizatorul în auth.users
    console.log('\n2. Verific utilizatorul în auth.users:');
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(comment.user_id);
    
    if (userError) {
      console.error('❌ Eroare la obținerea utilizatorului:', userError.message);
    } else {
      console.log('✅ Utilizator găsit în auth.users:');
      console.log('   - ID:', userData.user.id);
      console.log('   - Email:', userData.user.email);
      console.log('   - Display Name (user_metadata):', userData.user.user_metadata?.display_name);
      console.log('   - Created At:', userData.user.created_at);
    }
    
    // 3. Verifică profilul în profiles
    console.log('\n3. Verific profilul în profiles:');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', comment.user_id)
      .single();
    
    if (profileError) {
      console.error('❌ Eroare la obținerea profilului:', profileError.message);
      console.log('   - Error code:', profileError.code);
      console.log('   - Error details:', profileError.details);
    } else {
      console.log('✅ Profil găsit în profiles:');
      console.log('   - ID:', profileData.id);
      console.log('   - Display Name:', profileData.display_name);
      console.log('   - Avatar URL:', profileData.avatar_url);
      console.log('   - Subscription Tier:', profileData.subscription_tier);
      console.log('   - Created At:', profileData.created_at);
    }
    
    // 4. Verifică dacă există trigger-ul pentru crearea profilului
    console.log('\n4. Verific trigger-ul pentru crearea profilului:');
    const { data: triggers, error: triggerError } = await supabase
      .rpc('get_triggers_for_table', { table_name: 'auth.users' });
    
    if (triggerError) {
      console.log('ℹ️ Nu pot verifica trigger-urile:', triggerError.message);
    } else {
      console.log('✅ Trigger-uri găsite:', triggers);
    }
    
    // 5. Verifică dacă există profilul pentru utilizatorul autentificat
    console.log('\n5. Verific profilul pentru utilizatorul autentificat:');
    const authenticatedUserId = '4c8eaa1c-f718-45f2-ab4f-fba99a5c73d2';
    const { data: authProfileData, error: authProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authenticatedUserId)
      .single();
    
    if (authProfileError) {
      console.error('❌ Eroare la obținerea profilului autentificat:', authProfileError.message);
    } else {
      console.log('✅ Profil autentificat găsit:');
      console.log('   - ID:', authProfileData.id);
      console.log('   - Display Name:', authProfileData.display_name);
      console.log('   - Avatar URL:', authProfileData.avatar_url);
      console.log('   - Subscription Tier:', authProfileData.subscription_tier);
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

debugCommentUser();
