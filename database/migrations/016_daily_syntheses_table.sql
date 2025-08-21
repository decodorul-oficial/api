-- =====================================================
-- MIGRAȚIE 016: Tabel pentru Sinteze Zilnice
-- =====================================================

-- ============================================================================
-- Daily Syntheses Table Setup
-- ============================================================================
-- This script creates the daily_syntheses table for storing AI-generated
-- news syntheses. Run this in your Supabase SQL editor.
--
-- Table Purpose:
-- - Store daily syntheses of news articles
-- - Support both detailed and LinkedIn-optimized content
-- - Track posting status and metadata
-- - Enable historical analysis and reporting
-- ============================================================================

-- ============================================================================
-- CREATE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_syntheses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Temporal fields
    synthesis_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Synthesis metadata
    synthesis_type TEXT NOT NULL CHECK (synthesis_type IN ('detailed', 'linkedin')),
    
    -- Content fields
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    
    -- Structured metadata (JSON)
    metadata JSONB DEFAULT '{}',
    
    -- Social media posting tracking
    posted_to_linkedin BOOLEAN DEFAULT FALSE,
    posted_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional tracking
    source_articles_count INTEGER DEFAULT 0,
    ai_model_version TEXT DEFAULT 'gemini-2.5-flash',
    
    -- Unique constraint to prevent duplicate syntheses for same date/type
    CONSTRAINT unique_synthesis_per_date_type UNIQUE (synthesis_date, synthesis_type)
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Index for date-based queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_date 
ON public.daily_syntheses(synthesis_date DESC);

-- Index for type-based filtering
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_type 
ON public.daily_syntheses(synthesis_type);

-- Composite index for date and type queries
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_date_type 
ON public.daily_syntheses(synthesis_date DESC, synthesis_type);

-- Index for LinkedIn posting status
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_linkedin_status 
ON public.daily_syntheses(posted_to_linkedin, posted_at) 
WHERE synthesis_type = 'linkedin';

-- Index for metadata queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_metadata 
ON public.daily_syntheses USING GIN(metadata);

-- Index for full-text search on content
CREATE INDEX IF NOT EXISTS idx_daily_syntheses_content_search 
ON public.daily_syntheses USING GIN(to_tsvector('romanian', title || ' ' || content));

-- ============================================================================
-- CREATE UPDATED_AT TRIGGER
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_daily_syntheses_updated_at ON public.daily_syntheses;
CREATE TRIGGER update_daily_syntheses_updated_at
    BEFORE UPDATE ON public.daily_syntheses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE public.daily_syntheses ENABLE ROW LEVEL SECURITY;

-- Policy for service role (full access)
CREATE POLICY "Service role can manage all syntheses" ON public.daily_syntheses
    FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users (read access only)
CREATE POLICY "Authenticated users can read syntheses" ON public.daily_syntheses
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for anonymous users (read access to published syntheses only)
CREATE POLICY "Anonymous users can read published syntheses" ON public.daily_syntheses
    FOR SELECT USING (
        auth.role() = 'anon' AND 
        synthesis_date >= CURRENT_DATE - INTERVAL '30 days'
    );

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View for latest syntheses
CREATE OR REPLACE VIEW public.latest_syntheses AS
SELECT 
    synthesis_date,
    synthesis_type,
    title,
    summary,
    posted_to_linkedin,
    posted_at,
    created_at,
    metadata
FROM public.daily_syntheses
WHERE synthesis_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY synthesis_date DESC, synthesis_type;

-- View for LinkedIn posting statistics
CREATE OR REPLACE VIEW public.linkedin_posting_stats AS
SELECT 
    synthesis_date,
    title,
    posted_to_linkedin,
    posted_at,
    (metadata->>'character_count')::INTEGER as character_count,
    jsonb_array_length(metadata->'hashtags') as hashtag_count
FROM public.daily_syntheses
WHERE synthesis_type = 'linkedin'
ORDER BY synthesis_date DESC;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to get synthesis by date and type
CREATE OR REPLACE FUNCTION get_synthesis(
    target_date DATE DEFAULT CURRENT_DATE,
    target_type TEXT DEFAULT 'detailed'
)
RETURNS TABLE (
    id UUID,
    synthesis_date DATE,
    synthesis_type TEXT,
    title TEXT,
    content TEXT,
    summary TEXT,
    metadata JSONB,
    posted_to_linkedin BOOLEAN,
    posted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.id,
        ds.synthesis_date,
        ds.synthesis_type,
        ds.title,
        ds.content,
        ds.summary,
        ds.metadata,
        ds.posted_to_linkedin,
        ds.posted_at,
        ds.created_at
    FROM public.daily_syntheses ds
    WHERE ds.synthesis_date = target_date 
    AND ds.synthesis_type = target_type;
END;
$$;

-- Function to get synthesis statistics
CREATE OR REPLACE FUNCTION get_synthesis_stats(
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_syntheses BIGINT,
    detailed_syntheses BIGINT,
    linkedin_syntheses BIGINT,
    posted_to_linkedin BIGINT,
    avg_content_length NUMERIC,
    latest_synthesis_date DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_syntheses,
        COUNT(*) FILTER (WHERE synthesis_type = 'detailed') as detailed_syntheses,
        COUNT(*) FILTER (WHERE synthesis_type = 'linkedin') as linkedin_syntheses,
        COUNT(*) FILTER (WHERE posted_to_linkedin = true) as posted_to_linkedin,
        AVG(LENGTH(content))::NUMERIC(10,2) as avg_content_length,
        MAX(synthesis_date) as latest_synthesis_date
    FROM public.daily_syntheses
    WHERE synthesis_date >= CURRENT_DATE - INTERVAL '1 day' * days_back;
END;
$$;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Example queries you can run after creating the table:

-- 1. Get today's syntheses
-- SELECT * FROM public.daily_syntheses WHERE synthesis_date = CURRENT_DATE;

-- 2. Get latest LinkedIn posts
-- SELECT * FROM public.linkedin_posting_stats LIMIT 10;

-- 3. Get synthesis statistics for last 30 days
-- SELECT * FROM get_synthesis_stats(30);

-- 4. Get detailed synthesis for a specific date
-- SELECT * FROM get_synthesis('2024-01-15', 'detailed');

-- 5. Search syntheses by content
-- SELECT synthesis_date, title, synthesis_type 
-- FROM public.daily_syntheses 
-- WHERE to_tsvector('romanian', title || ' ' || content) @@ plainto_tsquery('romanian', 'fiscal');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.daily_syntheses IS 'Stores AI-generated daily syntheses of news articles from Monitorul Oficial';
COMMENT ON COLUMN public.daily_syntheses.synthesis_date IS 'Date for which the synthesis was created';
COMMENT ON COLUMN public.daily_syntheses.synthesis_type IS 'Type of synthesis: detailed (article) or linkedin (social post)';
COMMENT ON COLUMN public.daily_syntheses.title IS 'Title of the synthesis';
COMMENT ON COLUMN public.daily_syntheses.content IS 'Main content of the synthesis (HTML for detailed, plain text for LinkedIn)';
COMMENT ON COLUMN public.daily_syntheses.summary IS 'Brief summary or call-to-action';
COMMENT ON COLUMN public.daily_syntheses.metadata IS 'Structured metadata (themes, hashtags, statistics, etc.)';
COMMENT ON COLUMN public.daily_syntheses.posted_to_linkedin IS 'Whether the LinkedIn synthesis was posted';
COMMENT ON COLUMN public.daily_syntheses.posted_at IS 'Timestamp when posted to LinkedIn';
COMMENT ON COLUMN public.daily_syntheses.source_articles_count IS 'Number of source articles used for the synthesis';

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Daily Syntheses table setup completed successfully!';
    RAISE NOTICE 'Table: public.daily_syntheses created with indexes and policies';
    RAISE NOTICE 'Views: latest_syntheses, linkedin_posting_stats created';
    RAISE NOTICE 'Functions: get_synthesis(), get_synthesis_stats() created';
    RAISE NOTICE 'You can now run your daily synthesis script!';
END $$;
