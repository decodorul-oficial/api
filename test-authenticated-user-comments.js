#!/usr/bin/env node

/**
 * Script pentru testarea vizualizării comentariilor pentru utilizatorii autentificați
 * Testează că utilizatorii autentificați văd displayName, avatarUrl și subscriptionTier
 * pentru comentariile altor utilizatori (fără formatare)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAuthenticatedUserComments() {
  try {
    console.log('🔒 Testez vizualizarea comentariilor pentru utilizatorii autentificați...\n');

    // 1. Creează primul utilizator (comentariul va fi al acestuia)
    const timestamp1 = Date.now();
    const { data: user1, error: user1Error } = await supabase.auth.admin.createUser({
      email: `test-user1-${timestamp1}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'Radu Alexandru Nie'
      }
    });

    if (user1Error) {
      console.error('❌ Eroare la crearea utilizatorului 1:', user1Error.message);
      return;
    }

    // Actualizează profilul primului utilizator cu trial activ
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        display_name: 'Radu Alexandru Nie',
        avatar_url: 'https://example.com/radu-avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user1.user.id);

    console.log('✅ Utilizator 1 creat:', user1.user.id);

    // 2. Creează al doilea utilizator (va vizualiza comentariile)
    const timestamp2 = Date.now();
    const { data: user2, error: user2Error } = await supabase.auth.admin.createUser({
      email: `test-user2-${timestamp2}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'Maria Popescu'
      }
    });

    if (user2Error) {
      console.error('❌ Eroare la crearea utilizatorului 2:', user2Error.message);
      return;
    }

    // Actualizează profilul celui de-al doilea utilizator
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        display_name: 'Maria Popescu',
        avatar_url: 'https://example.com/maria-avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user2.user.id);

    console.log('✅ Utilizator 2 creat:', user2.user.id);

    // 3. Generează token JWT pentru primul utilizator
    const { data: session1, error: session1Error } = await supabase.auth.signInWithPassword({
      email: `test-user1-${timestamp1}@example.com`,
      password: 'test123456'
    });

    if (session1Error) {
      console.error('❌ Eroare la autentificarea utilizatorului 1:', session1Error.message);
      return;
    }

    const token1 = session1.session.access_token;
    console.log('✅ Token JWT pentru utilizatorul 1 generat');

    // 4. Creează un comentariu cu primul utilizator
    const createResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
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
                  avatarUrl
                  subscriptionTier
                }
              }
              createdAt
            }
          }
        `,
        variables: {
          input: {
            content: 'Comentariu de la Radu pentru test',
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

    // 5. Generează token JWT pentru al doilea utilizator
    const { data: session2, error: session2Error } = await supabase.auth.signInWithPassword({
      email: `test-user2-${timestamp2}@example.com`,
      password: 'test123456'
    });

    if (session2Error) {
      console.error('❌ Eroare la autentificarea utilizatorului 2:', session2Error.message);
      return;
    }

    const token2 = session2.session.access_token;
    console.log('✅ Token JWT pentru utilizatorul 2 generat');

    // 6. Testează getComments cu al doilea utilizator (va vedea comentariile primului)
    console.log('\n🔍 Testez cu utilizatorul 2 autentificat (va vedea comentariile utilizatorului 1):');
    const getCommentsResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`
      },
      body: JSON.stringify({
        query: `
          query GetComments($parentType: CommentParentType!, $parentId: ID!) {
            getComments(parentType: $parentType, parentId: $parentId) {
              comments {
                id
                content
                user {
                  id
                  email
                  profile {
                    id
                    displayName
                    avatarUrl
                    subscriptionTier
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
      console.log('✅ Comentarii pentru utilizatorul 2 autentificat:');
      console.log(JSON.stringify(getCommentsResult.data, null, 2));
    }

    // 7. Testează fără autentificare (utilizator neautentificat)
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
                  id
                  email
                  profile {
                    id
                    displayName
                    avatarUrl
                    subscriptionTier
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

    // 8. Curăță utilizatorii de test
    await supabase.auth.admin.deleteUser(user1.user.id);
    await supabase.auth.admin.deleteUser(user2.user.id);
    console.log('\n🧹 Utilizatori de test șterși');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testAuthenticatedUserComments();
