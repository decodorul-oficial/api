-- =====================================================
-- MIGRAȚIE 055: CORECTAREA POLITICII RLS PENTRU COMMENT_EDITS
-- =====================================================

-- Șterge politica care blochează toate operațiunile
DROP POLICY IF EXISTS "Block all modifications on comment_edits" ON comment_edits;

-- Creează o politică care permite inserarea pentru utilizatorii care au creat comentariul
CREATE POLICY "Users can insert comment edits for own comments" ON comment_edits
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM comments c
            WHERE c.id = comment_id AND c.user_id = auth.uid()
        )
    );

-- Creează o politică care blochează actualizarea și ștergerea
CREATE POLICY "Block updates and deletes on comment_edits" ON comment_edits
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Block deletes on comment_edits" ON comment_edits
    FOR DELETE
    TO authenticated
    USING (false);
