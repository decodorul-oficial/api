-- =====================================================
-- DAILY DIGEST EMAIL SYSTEM
-- Migration 060: Implement daily digest email notifications for saved searches
-- =====================================================

-- =====================================================
-- 1. ADD EMAIL NOTIFICATION COLUMNS
-- =====================================================

-- Add max_email_notifications column to subscription_tiers table
ALTER TABLE payments.subscription_tiers 
ADD COLUMN IF NOT EXISTS max_email_notifications INTEGER DEFAULT 0;

-- Update existing tiers with their notification limits
UPDATE payments.subscription_tiers 
SET max_email_notifications = CASE 
    WHEN name LIKE '%pro%' THEN 5
    WHEN name LIKE '%enterprise%' THEN 20
    ELSE 0
END
WHERE max_email_notifications = 0;

-- Add comment
COMMENT ON COLUMN payments.subscription_tiers.max_email_notifications IS 'Maximum number of saved searches that can have email notifications enabled for this subscription tier';

-- Add email_notifications_enabled column to saved_searches table
ALTER TABLE saved_searches 
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN saved_searches.email_notifications_enabled IS 'Whether email notifications are enabled for this saved search';

-- =====================================================
-- 2. CREATE EMAIL TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_template_name ON payments.email_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON payments.email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON payments.email_templates(created_at DESC);

-- Add RLS
ALTER TABLE payments.email_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage email templates
CREATE POLICY "Service role can manage email templates" ON payments.email_templates
    FOR ALL TO service_role USING (true);

-- Policy: Authenticated users can read active email templates
CREATE POLICY "Authenticated users can read active email templates" ON payments.email_templates
    FOR SELECT TO authenticated USING (is_active = true);

-- Grant permissions
GRANT SELECT ON payments.email_templates TO authenticated;
GRANT ALL ON payments.email_templates TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON payments.email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. CREATE EMAIL DIGEST LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.email_digest_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    articles_sent_count INTEGER DEFAULT 0,
    saved_searches_triggered JSONB DEFAULT '[]'::jsonb,
    template_id UUID NOT NULL REFERENCES payments.email_templates(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Ensure only one digest per user per day
    UNIQUE(user_id, digest_date)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_email_digest_logs_user_id ON payments.email_digest_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_digest_logs_digest_date ON payments.email_digest_logs(digest_date);
CREATE INDEX IF NOT EXISTS idx_email_digest_logs_status ON payments.email_digest_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_digest_logs_sent_at ON payments.email_digest_logs(sent_at);

-- Add RLS
ALTER TABLE payments.email_digest_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own digest logs
CREATE POLICY "Users can view own digest logs" ON payments.email_digest_logs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Policy: Service role can manage all digest logs
CREATE POLICY "Service role can manage digest logs" ON payments.email_digest_logs
    FOR ALL TO service_role USING (true);

-- Grant permissions
GRANT SELECT ON payments.email_digest_logs TO authenticated;
GRANT ALL ON payments.email_digest_logs TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER update_email_digest_logs_updated_at
    BEFORE UPDATE ON payments.email_digest_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to check email notification limit
CREATE OR REPLACE FUNCTION public.check_email_notification_limit(
    p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tier_name TEXT;
    v_max_notifications INTEGER;
    v_current_notifications INTEGER;
    v_is_in_trial BOOLEAN;
BEGIN
    -- Get user's subscription tier and trial status
    SELECT 
        p.subscription_tier,
        (p.trial_end IS NOT NULL AND NOW() < p.trial_end) as is_in_trial
    INTO v_user_tier_name, v_is_in_trial
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no tier found, default to free (0 notifications)
    IF v_user_tier_name IS NULL THEN
        v_user_tier_name := 'free';
    END IF;
    
    -- Handle trial users: if user is in trial and has 'pro' tier, treat as pro-monthly
    IF v_is_in_trial AND v_user_tier_name = 'pro' THEN
        v_user_tier_name := 'pro-monthly';
    END IF;
    
    -- Get max notifications for this tier
    SELECT st.max_email_notifications INTO v_max_notifications
    FROM payments.subscription_tiers st
    WHERE st.name = v_user_tier_name;
    
    -- If no tier found, default to 0
    IF v_max_notifications IS NULL THEN
        v_max_notifications := 0;
    END IF;
    
    -- Count current active notifications
    SELECT COUNT(*) INTO v_current_notifications
    FROM saved_searches ss
    WHERE ss.user_id = p_user_id 
    AND ss.email_notifications_enabled = TRUE;
    
    -- Return true if under limit
    RETURN v_current_notifications < v_max_notifications;
END;
$$;

-- Function to get user email notification limit
CREATE OR REPLACE FUNCTION public.get_user_email_notification_limit(
    p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tier_name TEXT;
    v_max_notifications INTEGER;
    v_is_in_trial BOOLEAN;
BEGIN
    -- Get user's subscription tier and trial status
    SELECT 
        p.subscription_tier,
        (p.trial_end IS NOT NULL AND NOW() < p.trial_end) as is_in_trial
    INTO v_user_tier_name, v_is_in_trial
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no tier found, default to free (0 notifications)
    IF v_user_tier_name IS NULL THEN
        v_user_tier_name := 'free';
    END IF;
    
    -- Handle trial users: if user is in trial and has 'pro' tier, treat as pro-monthly
    IF v_is_in_trial AND v_user_tier_name = 'pro' THEN
        v_user_tier_name := 'pro-monthly';
    END IF;
    
    -- Get max notifications for this tier
    SELECT st.max_email_notifications INTO v_max_notifications
    FROM payments.subscription_tiers st
    WHERE st.name = v_user_tier_name;
    
    -- If no tier found, default to 0
    IF v_max_notifications IS NULL THEN
        v_max_notifications := 0;
    END IF;
    
    RETURN v_max_notifications;
END;
$$;

-- Function to get user current email notifications count
CREATE OR REPLACE FUNCTION public.get_user_current_email_notifications_count(
    p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_count INTEGER;
BEGIN
    -- Count current active notifications
    SELECT COUNT(*) INTO v_current_count
    FROM saved_searches ss
    WHERE ss.user_id = p_user_id 
    AND ss.email_notifications_enabled = TRUE;
    
    RETURN COALESCE(v_current_count, 0);
END;
$$;

-- Function to get users with active email notifications
CREATE OR REPLACE FUNCTION public.get_users_with_active_email_notifications()
RETURNS TABLE(
    user_id UUID,
    user_email TEXT,
    user_name TEXT,
    saved_searches JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as user_id,
        au.email as user_email,
        COALESCE(p.display_name, au.email) as user_name,
        jsonb_agg(
            jsonb_build_object(
                'id', ss.id,
                'name', ss.name,
                'search_params', ss.search_params
            )
        ) as saved_searches
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    JOIN saved_searches ss ON ss.user_id = p.id
    WHERE ss.email_notifications_enabled = TRUE
    AND au.email_confirmed_at IS NOT NULL
    GROUP BY p.id, au.email, p.display_name
    HAVING COUNT(ss.id) > 0;
END;
$$;

-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_email_notification_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_email_notification_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_current_email_notifications_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_users_with_active_email_notifications() TO service_role;

-- =====================================================
-- 6. ADD COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.check_email_notification_limit(UUID) IS 'Check if user can enable more email notifications based on subscription tier';
COMMENT ON FUNCTION public.get_user_email_notification_limit(UUID) IS 'Get maximum email notifications allowed for user based on subscription tier';
COMMENT ON FUNCTION public.get_user_current_email_notifications_count(UUID) IS 'Get current number of active email notifications for user';
COMMENT ON FUNCTION public.get_users_with_active_email_notifications() IS 'Get all users with active email notifications and their saved searches';

-- =====================================================
-- 7. INSERT DEFAULT EMAIL TEMPLATE
-- =====================================================

INSERT INTO payments.email_templates (
    template_name,
    subject,
    body_html,
    body_text,
    variables,
    is_active
) VALUES (
    'daily_article_digest',
    'Monitorul Oficial - Digest zilnic: {totalArticleCount} articole noi',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitorul Oficial - Digest zilnic</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }
        .article { background-color: white; margin: 15px 0; padding: 15px; border-radius: 5px; border-left: 4px solid #3498db; }
        .article-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .article-title a { color: #2c3e50; text-decoration: none; }
        .article-title a:hover { text-decoration: underline; }
        .article-excerpt { color: #666; margin-bottom: 10px; }
        .article-meta { font-size: 12px; color: #999; }
        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #666; font-size: 12px; }
        .search-name { background-color: #e8f4f8; padding: 5px 10px; border-radius: 3px; font-size: 12px; color: #2c3e50; display: inline-block; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Monitorul Oficial</h1>
        <p>Digest zilnic - {currentDate}</p>
    </div>
    
    <div class="content">
        <h2>Salut {userName}!</h2>
        <p>Iată {totalArticleCount} articole noi care se potrivesc cu căutările tale salvate:</p>
        
        {articleList}
        
        <p>Pentru a gestiona notificările tale, accesează <a href="https://monitoruloficial.ro/saved-searches">căutările salvate</a>.</p>
    </div>
    
    <div class="footer">
        <p>Acest email a fost trimis automat de Monitorul Oficial.</p>
        <p>Pentru a dezactiva notificările, accesează setările contului tău.</p>
    </div>
</body>
</html>',
    'Monitorul Oficial - Digest zilnic - {currentDate}

Salut {userName}!

Iată {totalArticleCount} articole noi care se potrivesc cu căutările tale salvate:

{articleList}

Pentru a gestiona notificările tale, accesează: https://monitoruloficial.ro/saved-searches

---
Acest email a fost trimis automat de Monitorul Oficial.
Pentru a dezactiva notificările, accesează setările contului tău.',
    '["userName", "currentDate", "totalArticleCount", "articleList"]'::jsonb,
    true
) ON CONFLICT (template_name) DO NOTHING;

-- =====================================================
-- 8. VERIFICATION
-- =====================================================

-- Verify tables and columns were created
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_column_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    -- Check if email_templates table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'payments' 
        AND table_name = 'email_templates'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'email_templates table was not created';
    END IF;
    
    -- Check if email_digest_logs table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'payments' 
        AND table_name = 'email_digest_logs'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'email_digest_logs table was not created';
    END IF;
    
    -- Check if max_email_notifications column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'payments' 
        AND table_name = 'subscription_tiers' 
        AND column_name = 'max_email_notifications'
    ) INTO v_column_exists;
    
    IF NOT v_column_exists THEN
        RAISE EXCEPTION 'max_email_notifications column was not added to subscription_tiers table';
    END IF;
    
    -- Check if email_notifications_enabled column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'email_notifications_enabled'
    ) INTO v_column_exists;
    
    IF NOT v_column_exists THEN
        RAISE EXCEPTION 'email_notifications_enabled column was not added to saved_searches table';
    END IF;
    
    -- Check if functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_email_notification_limit' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.check_email_notification_limit not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_email_notification_limit' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.get_user_email_notification_limit not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_current_email_notifications_count' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.get_user_current_email_notifications_count not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_users_with_active_email_notifications' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.get_users_with_active_email_notifications not found';
    END IF;
    
    RAISE NOTICE 'Daily digest email system setup completed successfully';
END $$;
