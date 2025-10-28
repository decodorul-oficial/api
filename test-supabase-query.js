#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2ZrY3hsZ3hpa216ZHB4dWxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA4Mjk0MiwiZXhwIjoyMDcwNjU4OTQyfQ.eACB3B9K_-UwNoPQ6iyrH5vbiqPxZk21s0dQTjBHT0c';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSupabaseQuery() {
  try {
    console.log('🧪 Testez query-ul Supabase pentru comentarii...\n');

    // Test 1: Query simplu pentru comentarii
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .eq('parent_type', 'stire')
      .eq('parent_id', '881')
      .limit(5);

    if (commentsError) {
      console.error('❌ Eroare la query-ul simplu:', commentsError.message);
    } else {
      console.log('✅ Query simplu funcționează:', comments.length, 'comentarii');
    }

    // Test 2: Query cu editHistory
    const { data: commentsWithHistory, error: historyError } = await supabase
      .from('comments')
      .select(`
        *,
        editHistory:comment_edits (
          id,
          previous_content,
          edited_at
        )
      `)
      .eq('parent_type', 'stire')
      .eq('parent_id', '881')
      .limit(5);

    if (historyError) {
      console.error('❌ Eroare la query-ul cu istoric:', historyError.message);
    } else {
      console.log('✅ Query cu istoric funcționează:', commentsWithHistory.length, 'comentarii');
    }

    // Test 3: Query cu profiles (problema)
    const { data: commentsWithProfiles, error: profilesError } = await supabase
      .from('comments')
      .select(`
        *,
        profile:profiles!user_id (
          id,
          display_name,
          avatar_url,
          subscription_tier
        )
      `)
      .eq('parent_type', 'stire')
      .eq('parent_id', '881')
      .limit(5);

    if (profilesError) {
      console.error('❌ Eroare la query-ul cu profile:', profilesError.message);
    } else {
      console.log('✅ Query cu profile funcționează:', commentsWithProfiles.length, 'comentarii');
    }

  } catch (error) {
    console.error('❌ Eroare generală:', error.message);
  }
}

testSupabaseQuery();
