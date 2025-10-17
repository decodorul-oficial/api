#!/usr/bin/env node

/**
 * Script pentru testarea securității comentariilor
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSecurityComments() {
  try {
    console.log('🔒 Testez securitatea comentariilor...\n');

    // 1. Creează primul utilizator (va avea comentarii proprii)
    const timestamp1 = Date.now();
    const { data: user1, error: user1Error } = await supabase.auth.admin.createUser({
      email: `user1-${timestamp1}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'User 1 Display Name'
      }
    });

    if (user1Error) {
      console.error('❌ Eroare la crearea utilizatorului 1:', user1Error.message);
      return;
    }

    // Actualizează profilul pentru user1 cu trial activ
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        display_name: 'User 1 Profile Name',
        avatar_url: 'https://example.com/user1-avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user1.user.id);

    console.log('✅ Utilizator 1 creat:', user1.user.id);

    // 2. Creează al doilea utilizator (va vedea comentariile altor utilizatori)
    const timestamp2 = Date.now();
    const { data: user2, error: user2Error } = await supabase.auth.admin.createUser({
      email: `user2-${timestamp2}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'User 2 Display Name'
      }
    });

    if (user2Error) {
      console.error('❌ Eroare la crearea utilizatorului 2:', user2Error.message);
      return;
    }

    // Actualizează profilul pentru user2 cu trial activ
    await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        display_name: 'User 2 Profile Name',
        avatar_url: 'https://example.com/user2-avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user2.user.id);

    console.log('✅ Utilizator 2 creat:', user2.user.id);

    // 3. User1 creează un comentariu
    const { data: session1, error: session1Error } = await supabase.auth.signInWithPassword({
      email: `user1-${timestamp1}@example.com`,
      password: 'test123456'
    });

    if (session1Error) {
      console.error('❌ Eroare la autentificarea user1:', session1Error.message);
      return;
    }

    const token1 = session1.session.access_token;
    console.log('✅ Token user1 generat');

    // Creează comentariu cu user1
    const createResponse1 = await fetch('http://localhost:4000/graphql', {
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
            content: 'Comentariu de la User 1',
            parentType: 'STIRE',
            parentId: '881'
          }
        }
      })
    });

    const createResult1 = await createResponse1.json();
    
    if (createResult1.errors) {
      console.error('❌ Eroare la crearea comentariului user1:', JSON.stringify(createResult1.errors, null, 2));
      return;
    }

    console.log('✅ Comentariu user1 creat:', createResult1.data.createComment.id);

    // 4. User2 se autentifică și vede comentariile
    const { data: session2, error: session2Error } = await supabase.auth.signInWithPassword({
      email: `user2-${timestamp2}@example.com`,
      password: 'test123456'
    });

    if (session2Error) {
      console.error('❌ Eroare la autentificarea user2:', session2Error.message);
      return;
    }

    const token2 = session2.session.access_token;
    console.log('✅ Token user2 generat');

    // User2 vede comentariile (ar trebui să vadă doar datele publice)
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
      console.log('✅ Comentarii obținute de user2:');
      console.log(JSON.stringify(getCommentsResult.data, null, 2));
    }

    // 5. User1 vede propriile comentarii (ar trebui să vadă datele complete)
    const getOwnCommentsResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
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

    const getOwnCommentsResult = await getOwnCommentsResponse.json();
    
    if (getOwnCommentsResult.errors) {
      console.error('❌ Eroare la obținerea comentariilor proprii:', JSON.stringify(getOwnCommentsResult.errors, null, 2));
    } else {
      console.log('✅ Comentarii proprii văzute de user1:');
      console.log(JSON.stringify(getOwnCommentsResult.data, null, 2));
    }

    // 6. Curăță utilizatorii de test
    await supabase.auth.admin.deleteUser(user1.user.id);
    await supabase.auth.admin.deleteUser(user2.user.id);
    console.log('🧹 Utilizatori de test șterși');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testSecurityComments();
