#!/usr/bin/env node

/**
 * Script pentru testarea securității userId în comentarii
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUserIdSecurity() {
  try {
    console.log('🔒 Testez securitatea userId în comentarii...\n');

    // 1. Creează un utilizator de test
    const timestamp = Date.now();
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: `test-userid-${timestamp}@example.com`,
      password: 'test123456',
      email_confirm: true
    });

    if (userError) {
      console.error('❌ Eroare la crearea utilizatorului:', userError.message);
      return;
    }

    // Actualizează profilul cu trial activ
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user.user.id);

    console.log('✅ Utilizator creat:', user.user.id);

    // 2. Generează token JWT
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: `test-userid-${timestamp}@example.com`,
      password: 'test123456'
    });

    if (sessionError) {
      console.error('❌ Eroare la autentificare:', sessionError.message);
      return;
    }

    const token = session.session.access_token;
    console.log('✅ Token JWT generat');

    // 3. Creează un comentariu
    const createResponse = await fetch('http://localhost:4000/graphql', {
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
              userId
              content
              user {
                id
                email
                profile {
                  id
                  subscriptionTier
                  displayName
                  avatarUrl
                }
              }
              createdAt
            }
          }
        `,
        variables: {
          input: {
            content: 'Comentariu pentru test userId',
            parentType: 'STIRE',
            parentId: '881'
          }
        }
      })
    });

    const createResult = await createResponse.json();
    
    if (createResult.errors) {
      console.error('❌ Eroare la crearea comentariului:', JSON.stringify(createResult.errors, null, 2));
      return;
    }

    console.log('✅ Comentariu creat:', createResult.data.createComment.id);

    // 4. Testează getComments pentru a vedea userId-ul propriu
    const getCommentsResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: `
          query GetComments($parentType: CommentParentType!, $parentId: ID!) {
            getComments(parentType: $parentType, parentId: $parentId) {
              comments {
                id
                userId
                content
                user {
                  id
                  email
                  profile {
                    id
                    subscriptionTier
                    displayName
                    avatarUrl
                  }
                }
                createdAt
              }
              pagination {
                totalCount
              }
            }
          }
        `,
        variables: {
          parentType: 'STIRE',
          parentId: '881'
        }
      })
    });

    const getCommentsResult = await getCommentsResponse.json();
    
    if (getCommentsResult.errors) {
      console.error('❌ Eroare la obținerea comentariilor:', JSON.stringify(getCommentsResult.errors, null, 2));
    } else {
      console.log('✅ Comentarii cu userId:');
      console.log(JSON.stringify(getCommentsResult.data, null, 2));
    }

    // 5. Curăță utilizatorul de test
    await supabase.auth.admin.deleteUser(user.user.id);
    console.log('🧹 Utilizator de test șters');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testUserIdSecurity();
