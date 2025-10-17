-- =====================================================
-- EMAIL NOTIFICATION SYSTEM FOR SAVED SEARCHES
-- Migration 057: Add email notification functionality
-- =====================================================

-- =====================================================
-- 1. ADD MAX_EMAIL_NOTIFICATIONS COLUMN TO SUBSCRIPTION_TIERS
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
COMMENT ON COLUMN payments.subscription_tiers.max_email_notifications IS 'Maximum number of active email notifications allowed for this subscription tier';

-- =====================================================
-- 2. CREATE EMAIL_TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_template_name ON payments.email_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON payments.email_templates(created_at DESC);

-- Add RLS
ALTER TABLE payments.email_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage email templates
CREATE POLICY "Service role can manage email templates" ON payments.email_templates
    FOR ALL TO service_role USING (true);

-- Policy: Authenticated users can read email templates
CREATE POLICY "Authenticated users can read email templates" ON payments.email_templates
    FOR SELECT TO authenticated USING (true);

-- Grant permissions
GRANT SELECT ON payments.email_templates TO authenticated;
GRANT ALL ON payments.email_templates TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON payments.email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE payments.email_templates IS 'Email templates for notification system';
COMMENT ON COLUMN payments.email_templates.template_name IS 'Unique identifier for the template (e.g., new_article_notification)';
COMMENT ON COLUMN payments.email_templates.subject IS 'Email subject with variable support (e.g., {userName}, {articleTitle})';
COMMENT ON COLUMN payments.email_templates.body_html IS 'HTML email body with variable support';

-- =====================================================
-- 3. ADD EMAIL_NOTIFICATIONS_ENABLED TO SAVED_SEARCHES
-- =====================================================

-- Add email_notifications_enabled column to saved_searches table
ALTER TABLE saved_searches 
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_saved_searches_email_notifications ON saved_searches(email_notifications_enabled) 
WHERE email_notifications_enabled = TRUE;

-- Add comment
COMMENT ON COLUMN saved_searches.email_notifications_enabled IS 'Whether email notifications are enabled for this saved search';

-- =====================================================
-- 4. CREATE EMAIL_NOTIFICATION_LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.email_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    saved_search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    article_id UUID NOT NULL,
    template_id UUID NOT NULL REFERENCES payments.email_templates(id),
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_email_notification_logs_user_id ON payments.email_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_logs_saved_search_id ON payments.email_notification_logs(saved_search_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_logs_article_id ON payments.email_notification_logs(article_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_logs_email_sent ON payments.email_notification_logs(email_sent);
CREATE INDEX IF NOT EXISTS idx_email_notification_logs_created_at ON payments.email_notification_logs(created_at DESC);

-- Add RLS
ALTER TABLE payments.email_notification_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notification logs
CREATE POLICY "Users can view own notification logs" ON payments.email_notification_logs
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Policy: Service role can manage all notification logs
CREATE POLICY "Service role can manage notification logs" ON payments.email_notification_logs
    FOR ALL TO service_role USING (true);

-- Grant permissions
GRANT SELECT ON payments.email_notification_logs TO authenticated;
GRANT ALL ON payments.email_notification_logs TO service_role;

-- Add comments
COMMENT ON TABLE payments.email_notification_logs IS 'Log of email notifications sent for saved searches';
COMMENT ON COLUMN payments.email_notification_logs.article_id IS 'ID of the article that triggered the notification';
COMMENT ON COLUMN payments.email_notification_logs.email_sent IS 'Whether the email was successfully sent';
COMMENT ON COLUMN payments.email_notification_logs.error_message IS 'Error message if email sending failed';

-- =====================================================
-- 5. INSERT DEFAULT EMAIL TEMPLATE
-- =====================================================

INSERT INTO payments.email_templates (template_name, subject, body_html) VALUES (
    'new_article_notification',
    'Nouă știre: {articleTitle}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nouă știre</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { padding: 20px; }
        .article-title { font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #2c3e50; }
        .article-meta { color: #666; font-size: 14px; margin-bottom: 20px; }
        .article-excerpt { font-size: 16px; line-height: 1.8; margin-bottom: 25px; }
        .cta-button { 
            display: inline-block; 
            background-color: #007bff; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: bold;
        }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        .search-info { background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Monitorul Oficial</h1>
            <p>Salut {userName}!</p>
        </div>
        
        <div class="content">
            <div class="search-info">
                <strong>Căutare salvată:</strong> {searchName}<br>
                <strong>Descriere:</strong> {searchDescription}
            </div>
            
            <div class="article-title">{articleTitle}</div>
            
            <div class="article-meta">
                <strong>Data publicării:</strong> {articlePublicationDate}<br>
                <strong>Autor:</strong> {articleAuthor}
            </div>
            
            <div class="article-excerpt">
                {articleExcerpt}
            </div>
            
            <a href="{articleLink}" class="cta-button">Citește articolul complet</a>
        </div>
        
        <div class="footer">
            <p>Acest email a fost trimis automat pe baza căutării tale salvate "{searchName}".</p>
            <p>Pentru a dezactiva notificările pentru această căutare, accesează setările din contul tău.</p>
            <p>© 2024 Monitorul Oficial. Toate drepturile rezervate.</p>
        </div>
    </div>
</body>
</html>'
) ON CONFLICT (template_name) DO NOTHING;

-- =====================================================
-- 6. CREATE FUNCTION TO CHECK EMAIL NOTIFICATION LIMITS
-- =====================================================

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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_email_notification_limit(UUID) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.check_email_notification_limit(UUID) IS 'Check if user can enable more email notifications based on subscription tier';

-- =====================================================
-- 7. CREATE FUNCTION TO GET USER EMAIL NOTIFICATION LIMIT
-- =====================================================

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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_email_notification_limit(UUID) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.get_user_email_notification_limit(UUID) IS 'Get maximum email notifications allowed for user based on subscription tier';

-- =====================================================
-- 8. CREATE FUNCTION TO GET USER CURRENT EMAIL NOTIFICATIONS COUNT
-- =====================================================

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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_current_email_notifications_count(UUID) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.get_user_current_email_notifications_count(UUID) IS 'Get current number of active email notifications for user';

-- =====================================================
-- 9. VERIFICATION QUERIES
-- =====================================================

-- Verify the migration
DO $$
DECLARE
    v_tier_count INTEGER;
    v_template_count INTEGER;
    v_column_exists BOOLEAN;
BEGIN
    -- Check if max_email_notifications column was added
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'payments' 
        AND table_name = 'subscription_tiers' 
        AND column_name = 'max_email_notifications'
    ) INTO v_column_exists;
    
    IF NOT v_column_exists THEN
        RAISE EXCEPTION 'max_email_notifications column was not added to subscription_tiers table';
    END IF;
    
    -- Check subscription tiers
    SELECT COUNT(*) INTO v_tier_count FROM payments.subscription_tiers;
    RAISE NOTICE 'Subscription tiers with email notification limits: %', v_tier_count;
    
    -- Check email templates
    SELECT COUNT(*) INTO v_template_count FROM payments.email_templates;
    RAISE NOTICE 'Email templates created: %', v_template_count;
    
    -- Check saved_searches column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'email_notifications_enabled'
    ) INTO v_column_exists;
    
    IF NOT v_column_exists THEN
        RAISE EXCEPTION 'email_notifications_enabled column was not added to saved_searches table';
    END IF;
    
    RAISE NOTICE 'Email notification system migration completed successfully!';
END $$;
