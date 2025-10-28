#!/usr/bin/env node

/**
 * Simulează exact ce se întâmplă în aplicația web
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000/graphql';

async function simulateWebUpdate() {
  try {
    console.log('🌐 Simulez actualizarea din aplicația web...\n');

    // Payload-ul exact din aplicația web
    const payload = {
      query: `
        fragment CommentData on Comment {
          id
          userId
          user {
            id
            profile {
              displayName
            }
          }
          content
          parentType
          parentId
          isEdited
          editedAt
          createdAt
          updatedAt
          editHistory {
            id
            previousContent
            editedAt
          }
        }

        mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
          updateComment(id: $id, input: $input) {
            ...CommentData
          }
        }
      `,
      variables: {
        id: "a05e4441-f34d-453c-9277-46275f2e30e4",
        input: {
          content: "test test"
        }
      },
      operationName: "UpdateComment"
    };

    console.log('📤 Trimit request-ul...');
    console.log('ID comentariu:', payload.variables.id);
    console.log('Conținut nou:', payload.variables.input.content);

    // Simulez request-ul fără autentificare (pentru a vedea eroarea)
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Nu includ Authorization header pentru a simula problema
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    console.log('\n📥 Răspunsul API:');
    console.log(JSON.stringify(result, null, 2));

    if (result.errors) {
      console.log('\n🔍 Analiza erorilor:');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
        if (error.extensions?.code) {
          console.log(`   Cod: ${error.extensions.code}`);
        }
        if (error.path) {
          console.log(`   Path: ${error.path.join('.')}`);
        }
      });
    }

    console.log('\n💡 Concluzie:');
    console.log('- Dacă primești "Utilizator neautentificat", problema este că aplicația web nu trimite token-ul');
    console.log('- Dacă primești eroarea RLS, problema este cu politica de securitate');
    console.log('- Dacă funcționează, problema este în altă parte');

  } catch (error) {
    console.error('❌ Eroare la simulare:', error.message);
  }
}

simulateWebUpdate();
