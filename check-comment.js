#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkComment() {
  try {
    console.log('🔍 Verific comentariul cu ID: a05e4441-f34d-453c-9277-46275f2e30e4\n');

    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('id', 'a05e4441-f34d-453c-9277-46275f2e30e4');

    if (error) {
      console.error('❌ Eroare:', error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.log('❌ Comentariul nu există');
      return;
    }

    const comment = data[0];
    console.log('✅ Comentariu găsit:', {
      id: comment.id,
      content: comment.content,
      user_id: comment.user_id,
      parent_type: comment.parent_type,
      parent_id: comment.parent_id,
      is_edited: comment.is_edited,
      created_at: comment.created_at
    });

    // Verifică dacă există comentarii pentru același utilizator
    console.log('\n🔍 Caut alte comentarii pentru același utilizator...');
    const { data: userComments, error: userError } = await supabase
      .from('comments')
      .select('*')
      .eq('user_id', comment.user_id)
      .limit(5);

    if (userError) {
      console.error('❌ Eroare la obținerea comentariilor utilizatorului:', userError.message);
    } else {
      console.log(`✅ Găsite ${userComments.length} comentarii pentru utilizatorul ${comment.user_id}`);
      userComments.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.id} - "${c.content.substring(0, 50)}..."`);
      });
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

checkComment();
