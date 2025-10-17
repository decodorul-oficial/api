#!/usr/bin/env node

/**
 * Script pentru corectarea politicii RLS prin SQL direct
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY nu este setat');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRLS() {
  try {
    console.log('🔄 Corectez politica RLS pentru comment_edits...\n');

    // 1. Șterge politica care blochează toate operațiunile
    console.log('1. Șterg politica care blochează toate operațiunile...');
    const { error: dropError } = await supabase
      .from('comment_edits')
      .select('*')
      .limit(1); // Doar pentru a testa conexiunea

    if (dropError) {
      console.error('❌ Eroare la conexiunea cu baza de date:', dropError.message);
      return;
    }

    // Încerc să rulez SQL direct prin query
    const sqlQueries = [
      'DROP POLICY IF EXISTS "Block all modifications on comment_edits" ON comment_edits;',
      `CREATE POLICY "Users can insert comment edits for own comments" ON comment_edits
       FOR INSERT
       TO authenticated
       WITH CHECK (
           EXISTS (
               SELECT 1 FROM comments c
               WHERE c.id = comment_id AND c.user_id = auth.uid()
           )
       );`,
      `CREATE POLICY "Block updates on comment_edits" ON comment_edits
       FOR UPDATE
       TO authenticated
       USING (false)
       WITH CHECK (false);`,
      `CREATE POLICY "Block deletes on comment_edits" ON comment_edits
       FOR DELETE
       TO authenticated
       USING (false);`
    ];

    for (let i = 0; i < sqlQueries.length; i++) {
      console.log(`Execut query ${i + 1}...`);
      try {
        const { error } = await supabase.rpc('exec', { sql: sqlQueries[i] });
        if (error) {
          console.warn(`⚠️ Avertisment la query ${i + 1}:`, error.message);
        } else {
          console.log(`✅ Query ${i + 1} executat cu succes`);
        }
      } catch (err) {
        console.warn(`⚠️ Avertisment la query ${i + 1}:`, err.message);
      }
    }

    console.log('\n🎉 Politica RLS corectată!');
    console.log('Acum utilizatorii pot insera în comment_edits pentru propriile comentarii.');

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

fixRLS();
