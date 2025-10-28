#!/usr/bin/env node

/**
 * Script pentru testarea funcționalității de comentarii
 * Acest script demonstrează cum să folosești API-ul de comentarii cu autentificare
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000/graphql';

// Query pentru a obține un token de autentificare (dacă ai un utilizator de test)
const LOGIN_QUERY = `
  mutation SignIn($input: SignInInput!) {
    signIn(input: $input) {
      user {
        id
        email
      }
      token
    }
  }
`;

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
      }
      pagination {
        totalCount
      }
    }
  }
`;

async function testComments() {
  try {
    console.log('🧪 Testarea sistemului de comentarii...\n');

    // 1. Testează query-ul pentru comentarii (nu necesită autentificare)
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

    // 2. Testează crearea unui comentariu (necesită autentificare)
    console.log('\n2. Testez crearea unui comentariu...');
    const createCommentResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Nu avem token de autentificare, deci va eșua
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
    console.log('❌ createComment fără autentificare (așteptat):', JSON.stringify(createCommentData, null, 2));

    console.log('\n📝 Pentru a testa crearea comentariilor, ai nevoie de:');
    console.log('1. Un utilizator autentificat în aplicația web');
    console.log('2. Un token JWT valid în header-ul Authorization');
    console.log('3. Utilizatorul trebuie să aibă un abonament activ sau trial');

  } catch (error) {
    console.error('❌ Eroare la testare:', error.message);
  }
}

// Rulează testul
testComments();
