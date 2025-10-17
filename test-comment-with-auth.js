#!/usr/bin/env node

/**
 * Script pentru testarea funcționalității de comentarii cu autentificare mock
 * Acest script demonstrează cum funcționează API-ul cu un utilizator autentificat
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000/graphql';

// Query pentru a crea un comentariu
const CREATE_COMMENT_QUERY = `
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      parentType
      parentId
      userId
      createdAt
      isEdited
    }
  }
`;

// Query pentru a obține comentariile
const GET_COMMENTS_QUERY = `
  query GetComments($parentType: CommentParentType!, $parentId: ID!) {
    getComments(parentType: $parentType, parentId: $parentId) {
      comments {
        id
        content
        userId
        createdAt
        isEdited
      }
      pagination {
        totalCount
      }
    }
  }
`;

async function testCommentsWithAuth() {
  try {
    console.log('🧪 Testarea sistemului de comentarii cu autentificare...\n');

    // 1. Testează query-ul pentru comentarii
    console.log('1. Testez query-ul getComments...');
    const getCommentsResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: GET_COMMENTS_QUERY,
        variables: {
          parentType: 'STIRE',
          parentId: '881'
        }
      })
    });

    const getCommentsData = await getCommentsResponse.json();
    console.log('✅ getComments funcționează:', JSON.stringify(getCommentsData, null, 2));

    // 2. Testează cu un token mock (va eșua, dar demonstrează structura)
    console.log('\n2. Testez crearea unui comentariu cu token mock...');
    const createCommentResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-123' // Token mock
      },
      body: JSON.stringify({
        query: CREATE_COMMENT_QUERY,
        variables: {
          input: {
            content: 'Acesta este un comentariu de test',
            parentType: 'STIRE',
            parentId: '881'
          }
        }
      })
    });

    const createCommentData = await createCommentResponse.json();
    console.log('❌ createComment cu token mock (așteptat):', JSON.stringify(createCommentData, null, 2));

    console.log('\n📋 Instrucțiuni pentru aplicația web:');
    console.log('1. Asigură-te că utilizatorul este autentificat');
    console.log('2. Obține token-ul JWT din Supabase Auth');
    console.log('3. Include token-ul în header-ul Authorization:');
    console.log('   headers: { "Authorization": `Bearer ${token}` }');
    console.log('4. Verifică că utilizatorul are abonament activ sau trial');

    console.log('\n🔧 Pentru a testa cu un utilizator real:');
    console.log('1. Creează un utilizator în Supabase Auth');
    console.log('2. Obține token-ul JWT');
    console.log('3. Folosește token-ul în request-uri');

  } catch (error) {
    console.error('❌ Eroare la testare:', error.message);
  }
}

// Rulează testul
testCommentsWithAuth();
