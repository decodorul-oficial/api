#!/usr/bin/env node

/**
 * Script pentru rularea migrației prin Supabase API
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY nu este setat');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔄 Rulez migrația pentru corectarea politicii RLS...\n');

    // 1. Șterge politica care blochează toate operațiunile
    console.log('1. Șterg politica care blochează toate operațiunile...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Block all modifications on comment_edits" ON comment_edits;'
    });
    
    if (dropError) {
      console.warn('⚠️ Avertisment la ștergerea politicii:', dropError.message);
    } else {
      console.log('✅ Politica ștearsă cu succes');
    }

    // 2. Creează politica pentru inserare
    console.log('2. Creez politica pentru inserare...');
    const { error: insertError } = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "Users can insert comment edits for own comments" ON comment_edits
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM comments c
                    WHERE c.id = comment_id AND c.user_id = auth.uid()
                )
            );`
    });
    
    if (insertError) {
      console.error('❌ Eroare la crearea politicii de inserare:', insertError.message);
    } else {
      console.log('✅ Politica de inserare creată cu succes');
    }

    // 3. Creează politica pentru actualizare (blocată)
    console.log('3. Creez politica pentru actualizare (blocată)...');
    const { error: updateError } = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "Block updates on comment_edits" ON comment_edits
            FOR UPDATE
            TO authenticated
            USING (false)
            WITH CHECK (false);`
    });
    
    if (updateError) {
      console.error('❌ Eroare la crearea politicii de actualizare:', updateError.message);
    } else {
      console.log('✅ Politica de actualizare creată cu succes');
    }

    // 4. Creează politica pentru ștergere (blocată)
    console.log('4. Creez politica pentru ștergere (blocată)...');
    const { error: deleteError } = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "Block deletes on comment_edits" ON comment_edits
            FOR DELETE
            TO authenticated
            USING (false);`
    });
    
    if (deleteError) {
      console.error('❌ Eroare la crearea politicii de ștergere:', insertError.message);
    } else {
      console.log('✅ Politica de ștergere creată cu succes');
    }

    console.log('\n🎉 Migrația rulată cu succes!');
    console.log('Acum utilizatorii pot insera în comment_edits pentru propriile comentarii.');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

runMigration();
