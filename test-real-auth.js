#!/usr/bin/env node

/**
 * Script pentru testarea cu autentificare reală
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODI5NDIsImV4cCI6MjA3MDY1ODk0Mn0.8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8QJ8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRealAuth() {
  try {
    console.log('🧪 Testez cu autentificare reală...\n');

    // 1. Încearcă să se autentifice cu un utilizator existent
    console.log('1. Încerc să mă autentific...');
    
    // Folosesc un utilizator existent din baza de date
    const testEmail = 'test-plain@example.com';
    const testPassword = 'test123456';
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (authError) {
      console.error('❌ Eroare la autentificare:', authError.message);
      console.log('💡 Încerc să creez un utilizator nou...');
      
      // Încearcă să creeze un utilizator nou
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: 'test-comments@example.com',
        password: 'test123456'
      });

      if (signUpError) {
        console.error('❌ Eroare la crearea utilizatorului:', signUpError.message);
        return;
      }

      console.log('✅ Utilizator creat:', signUpData.user?.id);
      return;
    }

    console.log('✅ Autentificat cu succes:', authData.user.id);

    // 2. Testează crearea unui comentariu
    console.log('\n2. Testez crearea unui comentariu...');
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .insert({
        user_id: authData.user.id,
        content: 'Test comentariu cu autentificare reală',
        parent_type: 'stire',
        parent_id: '881'
      })
      .select('*')
      .single();

    if (commentError) {
      console.error('❌ Eroare la crearea comentariului:', commentError.message);
      return;
    }

    console.log('✅ Comentariu creat:', comment.id);

    // 3. Testează actualizarea comentariului
    console.log('\n3. Testez actualizarea comentariului...');
    const { data: updatedComment, error: updateError } = await supabase
      .from('comments')
      .update({
        content: 'Comentariu actualizat cu autentificare reală',
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', comment.id)
      .eq('user_id', authData.user.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Eroare la actualizarea comentariului:', updateError.message);
    } else {
      console.log('✅ Comentariu actualizat:', updatedComment.id);
    }

    // 4. Testează inserarea în comment_edits
    console.log('\n4. Testez inserarea în comment_edits...');
    const { data: editRecord, error: editError } = await supabase
      .from('comment_edits')
      .insert({
        comment_id: comment.id,
        previous_content: comment.content
      })
      .select('*')
      .single();

    if (editError) {
      console.error('❌ Eroare la inserarea în comment_edits:', editError.message);
      console.log('💡 Aceasta este problema RLS - utilizatorul autentificat nu poate insera');
    } else {
      console.log('✅ Inserare în comment_edits reușită:', editRecord.id);
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testRealAuth();
