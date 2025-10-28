#!/usr/bin/env node

/**
 * Script pentru testarea query-ului GraphQL cu utilizator de test
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testGraphQLWithTestUser() {
  try {
    console.log('🔍 Testez query-ul GraphQL cu utilizator de test...\n');

    // Creează un utilizator de test
    const timestamp = Date.now();
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: `test-graphql-${timestamp}@example.com`,
      password: 'test123456',
      email_confirm: true,
      user_metadata: {
        display_name: 'Test User'
      }
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
        display_name: 'Test User',
        avatar_url: 'https://example.com/test-avatar.jpg',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user.user.id);

    console.log('✅ Utilizator de test creat:', user.user.id);

    // Generează token JWT
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: `test-graphql-${timestamp}@example.com`,
      password: 'test123456'
    });

    if (sessionError) {
      console.error('❌ Eroare la autentificare:', sessionError.message);
      return;
    }

    const token = session.session.access_token;
    console.log('✅ Token JWT generat');

    // Testează query-ul GraphQL
    const response = await fetch('http://localhost:4000/graphql', {
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
                content
                createdAt
              }
              pagination {
                totalCount
              }
            }
          }
        `,
        variables: {
          parentType: 'SYNTHESIS',
          parentId: '6f779a27-0810-432f-b681-099ec770982d'
        }
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Eroare la query-ul GraphQL:', JSON.stringify(result.errors, null, 2));
    } else {
      console.log('✅ Rezultatul query-ului GraphQL:');
      console.log(JSON.stringify(result.data, null, 2));
      
      // Analizează rezultatul
      const comments = result.data.getComments.comments;
      console.log('\n📊 Analiza comentariilor:');
      
      comments.forEach((comment, index) => {
        console.log(`\n--- Comentariul ${index + 1} ---`);
        console.log(`ID: ${comment.id}`);
        console.log(`User ID: ${comment.userId}`);
        console.log(`User ID din user: ${comment.user.id}`);
        console.log(`User Email: ${comment.user.email}`);
        console.log(`Profile ID: ${comment.user.profile.id}`);
        console.log(`Display Name: ${comment.user.profile.displayName}`);
        console.log(`Avatar URL: ${comment.user.profile.avatarUrl}`);
        console.log(`Subscription Tier: ${comment.user.profile.subscriptionTier}`);
        console.log(`Content: ${comment.content}`);
      });
    }

    // Curăță utilizatorul de test
    await supabase.auth.admin.deleteUser(user.user.id);
    console.log('\n🧹 Utilizator de test șters');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testGraphQLWithTestUser();
