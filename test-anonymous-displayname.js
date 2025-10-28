#!/usr/bin/env node

/**
 * Script pentru testarea formatării displayName pentru utilizatorii neautentificați
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAnonymousDisplayName() {
  try {
    console.log('🔒 Testez formatarea displayName pentru utilizatorii neautentificați...\n');

    // 1. Creează un utilizator de test cu displayName
    const timestamp = Date.now();
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: `test-anonymous-${timestamp}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'Radu Alexandru Nie'
      }
    });

    if (userError) {
      console.error('❌ Eroare la crearea utilizatorului:', userError.message);
      return;
    }

    // Actualizează profilul cu trial activ și displayName
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        display_name: 'Radu Alexandru Nie',
        avatar_url: 'https://example.com/avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user.user.id);

    console.log('✅ Utilizator creat:', user.user.id);

    // 2. Generează token JWT
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: `test-anonymous-${timestamp}@example.com`,
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
              content
              user {
                profile {
                  displayName
                }
              }
              createdAt
            }
          }
        `,
        variables: {
          input: {
            content: 'Comentariu pentru test displayName anonim',
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

    // 4. Testează getComments fără autentificare (utilizator neautentificat)
    console.log('\n🔍 Testez fără autentificare (utilizator neautentificat):');
    const getCommentsAnonymousResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Fără Authorization header
      },
      body: JSON.stringify({
        query: `
          query GetComments($parentType: CommentParentType!, $parentId: ID!) {
            getComments(parentType: $parentType, parentId: $parentId) {
              comments {
                id
                content
                user {
                  profile {
                    displayName
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

    const getCommentsAnonymousResult = await getCommentsAnonymousResponse.json();
    
    if (getCommentsAnonymousResult.errors) {
      console.error('❌ Eroare la obținerea comentariilor (anonim):', JSON.stringify(getCommentsAnonymousResult.errors, null, 2));
    } else {
      console.log('✅ Comentarii pentru utilizator neautentificat:');
      console.log(JSON.stringify(getCommentsAnonymousResult.data, null, 2));
    }

    // 5. Testează getComments cu autentificare (utilizator autentificat)
    console.log('\n🔍 Testez cu autentificare (utilizator autentificat):');
    const getCommentsAuthResponse = await fetch('http://localhost:4000/graphql', {
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
                content
                user {
                  profile {
                    displayName
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

    const getCommentsAuthResult = await getCommentsAuthResponse.json();
    
    if (getCommentsAuthResult.errors) {
      console.error('❌ Eroare la obținerea comentariilor (autentificat):', JSON.stringify(getCommentsAuthResult.errors, null, 2));
    } else {
      console.log('✅ Comentarii pentru utilizator autentificat:');
      console.log(JSON.stringify(getCommentsAuthResult.data, null, 2));
    }

    // 6. Curăță utilizatorul de test
    await supabase.auth.admin.deleteUser(user.user.id);
    console.log('\n🧹 Utilizator de test șters');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testAnonymousDisplayName();
