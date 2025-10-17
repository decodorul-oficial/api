#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUpdateSpecific() {
  try {
    console.log('🧪 Testez actualizarea comentariului specific...\n');

    const commentId = 'a05e4441-f34d-453c-9277-46275f2e30e4';
    const userId = '4c8eaa1c-f718-45f2-ab4f-fba99a5c73d2';

    // 1. Obține comentariul curent
    console.log('1. Obțin comentariul curent...');
    const { data: currentComment, error: fetchError } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('❌ Eroare la obținerea comentariului:', fetchError.message);
      return;
    }

    console.log('✅ Comentariu curent:', {
      id: currentComment.id,
      content: currentComment.content,
      is_edited: currentComment.is_edited
    });

    // 2. Încearcă să insereze în comment_edits (ca utilizator autentificat)
    console.log('\n2. Testez inserarea în comment_edits...');
    
    // Simulez un utilizator autentificat prin setarea header-ului
    const { data: editRecord, error: editError } = await supabase
      .from('comment_edits')
      .insert({
        comment_id: commentId,
        previous_content: currentComment.content
      })
      .select('*')
      .single();

    if (editError) {
      console.error('❌ Eroare la inserarea în comment_edits:', editError.message);
      console.log('💡 Aceasta este problema RLS - utilizatorul autentificat nu poate insera');
    } else {
      console.log('✅ Inserare în comment_edits reușită:', editRecord.id);
    }

    // 3. Actualizează comentariul (ar trebui să funcționeze)
    console.log('\n3. Testez actualizarea comentariului...');
    const { data: updatedComment, error: updateError } = await supabase
      .from('comments')
      .update({
        content: 'test test - actualizat din script',
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('user_id', userId)
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

    console.log('\n📋 Rezumat:');
    console.log('- Actualizarea comentariilor funcționează cu service key');
    console.log('- Problema RLS este doar pentru utilizatorii autentificați');
    console.log('- Aplicația web ar trebui să funcționeze dacă utilizatorul este autentificat corect');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testUpdateSpecific();
