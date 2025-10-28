#!/usr/bin/env node

/**
 * Script pentru testarea comentariilor la sinteze
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSynthesisComment() {
  try {
    console.log('🧪 Testez comentariile la sinteze...\n');

    // 1. Obține ID-ul sintezei
    const { data: synthesis, error: synthesisError } = await supabase
      .from('daily_syntheses')
      .select('id, synthesis_date, title')
      .eq('synthesis_date', '2025-09-15')
      .eq('synthesis_type', 'detailed')
      .single();

    if (synthesisError) {
      console.error('❌ Eroare la obținerea sintezei:', synthesisError.message);
      return;
    }

    console.log('✅ Sinteză găsită:', {
      id: synthesis.id,
      date: synthesis.synthesis_date,
      title: synthesis.title
    });

    // 2. Creează un utilizator de test
    const timestamp = Date.now();
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: `test-synthesis-${timestamp}@example.com`,
      password: 'test123456',
      email_confirm: true
    });

    if (userError) {
      console.error('❌ Eroare la crearea utilizatorului:', userError.message);
      return;
    }

    console.log('✅ Utilizator creat:', user.user.id);

    // 3. Actualizează profilul pentru utilizator (se creează automat prin trigger)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user.user.id);

    if (profileError) {
      console.error('❌ Eroare la actualizarea profilului:', profileError.message);
      return;
    }

    console.log('✅ Profil creat cu trial activ');

    // 4. Generează token JWT pentru utilizator
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: `test-synthesis-${timestamp}@example.com`,
      password: 'test123456'
    });

    if (sessionError) {
      console.error('❌ Eroare la autentificare:', sessionError.message);
      return;
    }

    const token = session.session.access_token;
    console.log('✅ Token JWT generat');

    // 5. Testează crearea comentariului prin GraphQL
    const response = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: `
          mutation CreateComment($input: CreateCommentInput!) {
            createComment(input: $input) {
              id
              content
              parentType
              parentId
              user {
                id
                email
              }
              createdAt
            }
          }
        `,
        variables: {
          input: {
            content: 'Comentariu de test pentru sinteză din 15 septembrie 2025',
            parentType: 'SYNTHESIS',
            parentId: synthesis.id
          }
        }
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Eroare GraphQL:', JSON.stringify(result.errors, null, 2));
    } else {
      console.log('✅ Comentariu creat cu succes:', JSON.stringify(result.data, null, 2));
    }

    // 6. Curăță utilizatorul de test
    await supabase.auth.admin.deleteUser(user.user.id);
    console.log('🧹 Utilizator de test șters');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testSynthesisComment();
