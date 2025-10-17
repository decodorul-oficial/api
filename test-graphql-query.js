#!/usr/bin/env node

/**
 * Script pentru testarea query-ului GraphQL real
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testGraphQLQuery() {
  try {
    console.log('🔍 Testez query-ul GraphQL real...\n');

    // Generează token JWT pentru utilizatorul autentificat (Radu)
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: 'nie.radu@gmail.com',
      password: 'test123456'
    });

    if (sessionError) {
      console.error('❌ Eroare la autentificare:', sessionError.message);
      return;
    }

    const token = session.session.access_token;
    console.log('✅ Token JWT generat pentru Radu');

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

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testGraphQLQuery();
