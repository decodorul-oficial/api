#!/usr/bin/env node

/**
 * Script pentru testarea securității istoricului modificărilor comentariilor
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testEditHistorySecurity() {
  try {
    console.log('🔒 Testez securitatea istoricului modificărilor comentariilor...\n');

    // 1. Creează primul utilizator (va crea comentariul)
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

    // Actualizează profilul primului utilizator
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
              editHistory {
                id
                previousContent
                editedAt
              }
            }
          }
        `,
        variables: {
          input: {
            content: 'Comentariu original pentru test edit history',
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

    const commentId = createResult.data.createComment.id;
    console.log('✅ Comentariu creat:', commentId);

    // 5. Actualizează comentariul pentru a crea istoric
    const updateResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        query: `
          mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
            updateComment(id: $id, input: $input) {
              id
              content
              editHistory {
                id
                previousContent
                editedAt
              }
            }
          }
        `,
        variables: {
          id: commentId,
          input: {
            content: 'Comentariu actualizat pentru test edit history'
          }
        }
      })
    });

    const updateResult = await updateResponse.json();
    
    if (updateResult.errors) {
      console.error('❌ Eroare la actualizarea comentariului:', JSON.stringify(updateResult.errors, null, 2));
      return;
    }

    console.log('✅ Comentariu actualizat cu istoric:', updateResult.data.updateComment.editHistory.length, 'modificări');

    // 6. Generează token JWT pentru al doilea utilizator
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

    // 7. Testează getComments cu al doilea utilizator (va vedea comentariile primului)
    console.log('\n🔍 Testez cu utilizatorul 2 autentificat (va vedea comentariile utilizatorului 1):');
    const getCommentsAuthResponse = await fetch('http://localhost:4000/graphql', {
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
                  profile {
                    displayName
                  }
                }
                editHistory {
                  id
                  previousContent
                  editedAt
                }
                createdAt
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
      console.log('✅ Comentarii pentru utilizatorul 2 autentificat:');
      console.log(JSON.stringify(getCommentsAuthResult.data, null, 2));
    }

    // 8. Testează fără autentificare (utilizator neautentificat)
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
                editHistory {
                  id
                  previousContent
                  editedAt
                }
                createdAt
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

    // 9. Testează cu primul utilizator (proprietarul comentariului)
    console.log('\n🔍 Testez cu utilizatorul 1 (proprietarul comentariului):');
    const getCommentsOwnerResponse = await fetch('http://localhost:4000/graphql', {
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
                  profile {
                    displayName
                  }
                }
                editHistory {
                  id
                  previousContent
                  editedAt
                }
                createdAt
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

    const getCommentsOwnerResult = await getCommentsOwnerResponse.json();
    
    if (getCommentsOwnerResult.errors) {
      console.error('❌ Eroare la obținerea comentariilor (proprietar):', JSON.stringify(getCommentsOwnerResult.errors, null, 2));
    } else {
      console.log('✅ Comentarii pentru proprietarul comentariului:');
      console.log(JSON.stringify(getCommentsOwnerResult.data, null, 2));
    }

    // 10. Curăță utilizatorii de test
    await supabase.auth.admin.deleteUser(user1.user.id);
    await supabase.auth.admin.deleteUser(user2.user.id);
    console.log('\n🧹 Utilizatori de test șterși');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testEditHistorySecurity();
