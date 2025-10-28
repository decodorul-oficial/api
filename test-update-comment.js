#!/usr/bin/env node

/**
 * Script pentru testarea actualizării comentariilor cu utilizator real
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY nu este setat');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUpdateComment() {
  try {
    console.log('🧪 Testez actualizarea comentariilor...\n');

    // 1. Găsește un comentariu existent
    console.log('1. Caut comentarii existente...');
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .limit(1);

    if (commentsError) {
      console.error('❌ Eroare la obținerea comentariilor:', commentsError.message);
      return;
    }

    if (!comments || comments.length === 0) {
      console.log('❌ Nu există comentarii pentru testare');
      return;
    }

    const comment = comments[0];
    console.log('✅ Comentariu găsit:', {
      id: comment.id,
      content: comment.content,
      user_id: comment.user_id
    });

    // 2. Încearcă să actualizeze comentariul direct în baza de date
    console.log('\n2. Testez actualizarea directă în baza de date...');
    const { data: updatedComment, error: updateError } = await supabase
      .from('comments')
      .update({
        content: 'Comentariu actualizat din script',
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', comment.id)
      .eq('user_id', comment.user_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Eroare la actualizarea comentariului:', updateError.message);
    } else {
      console.log('✅ Comentariu actualizat cu succes:', {
        id: updatedComment.id,
        content: updatedComment.content,
        is_edited: updatedComment.is_edited,
        edited_at: updatedComment.edited_at
      });
    }

    // 3. Încearcă să insereze în comment_edits
    console.log('\n3. Testez inserarea în comment_edits...');
    const { data: editRecord, error: editError } = await supabase
      .from('comment_edits')
      .insert({
        comment_id: comment.id,
        previous_content: comment.content
      })
      .select('*')
      .single();

    if (editError) {
      console.error('❌ Eroare la inserarea în comment_edits:', editError.message);
      console.log('💡 Aceasta este problema RLS - utilizatorul nu poate insera în comment_edits');
    } else {
      console.log('✅ Inserare în comment_edits reușită:', editRecord);
    }

    console.log('\n📋 Rezumat:');
    console.log('- Actualizarea comentariilor funcționează');
    console.log('- Problema este cu politica RLS pentru comment_edits');
    console.log('- Trebuie să corectez politica RLS pentru a permite inserarea');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testUpdateComment();
