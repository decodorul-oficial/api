-- =====================================================
-- CRON JOB MANAGEMENT SCHEMA
-- Migration 062: Add cron job management tables
-- =====================================================

-- Create cron_jobs schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS cron_jobs;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron_jobs TO authenticated;
GRANT USAGE ON SCHEMA cron_jobs TO service_role;
GRANT ALL ON SCHEMA cron_jobs TO service_role;

-- =====================================================
-- 1. CRON JOB STATUS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_jobs.job_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name TEXT NOT NULL UNIQUE,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'RUNNING', 'FAILED', 'DISABLED')),
    last_run_duration INTEGER,
    last_run_error TEXT,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    average_runtime FLOAT DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 2. CRON JOB LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_jobs.job_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('IDLE', 'RUNNING', 'FAILED', 'DISABLED')),
    duration INTEGER,
    error TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 3. INDEXES FOR PERFORMANCE
-- =====================================================

-- Job status indexes
CREATE INDEX IF NOT EXISTS idx_job_status_job_name ON cron_jobs.job_status(job_name);
CREATE INDEX IF NOT EXISTS idx_job_status_status ON cron_jobs.job_status(status);
CREATE INDEX IF NOT EXISTS idx_job_status_next_run ON cron_jobs.job_status(next_run);

-- Job logs indexes
CREATE INDEX IF NOT EXISTS idx_job_logs_job_name ON cron_jobs.job_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON cron_jobs.job_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_start_time ON cron_jobs.job_logs(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_job_logs_end_time ON cron_jobs.job_logs(end_time DESC);

-- =====================================================
-- 4. FUNCTIONS FOR JOB MANAGEMENT
-- =====================================================

-- Function to start a job
CREATE OR REPLACE FUNCTION cron_jobs.start_job(p_job_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Insert or update job status
    INSERT INTO cron_jobs.job_status (job_name, status, last_run)
    VALUES (p_job_name, 'RUNNING', NOW())
    ON CONFLICT (job_name) 
    DO UPDATE SET 
        status = 'RUNNING',
        last_run = NOW(),
        last_run_error = NULL,
        updated_at = NOW()
    RETURNING id INTO v_job_id;

    -- Create log entry
    INSERT INTO cron_jobs.job_logs (job_name, start_time, status)
    VALUES (p_job_name, NOW(), 'RUNNING');

    RETURN v_job_id;
END;
$$;

-- Function to complete a job
CREATE OR REPLACE FUNCTION cron_jobs.complete_job(
    p_job_name TEXT,
    p_status TEXT,
    p_error TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_duration INTEGER;
BEGIN
    -- Get job start time
    SELECT start_time INTO v_start_time
    FROM cron_jobs.job_logs
    WHERE job_name = p_job_name
    AND status = 'RUNNING'
    ORDER BY start_time DESC
    LIMIT 1;

    -- Calculate duration in milliseconds
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_start_time)) * 1000;

    -- Update job status
    UPDATE cron_jobs.job_status
    SET 
        status = p_status,
        last_run_duration = v_duration,
        last_run_error = p_error,
        total_runs = total_runs + 1,
        successful_runs = CASE WHEN p_status = 'IDLE' THEN successful_runs + 1 ELSE successful_runs END,
        failed_runs = CASE WHEN p_status = 'FAILED' THEN failed_runs + 1 ELSE failed_runs END,
        average_runtime = (average_runtime * total_runs + v_duration) / (total_runs + 1),
        metadata = p_metadata,
        updated_at = NOW()
    WHERE job_name = p_job_name;

    -- Update log entry
    UPDATE cron_jobs.job_logs
    SET 
        status = p_status,
        end_time = NOW(),
        duration = v_duration,
        error = p_error,
        metadata = p_metadata
    WHERE job_name = p_job_name
    AND status = 'RUNNING'
    AND start_time = v_start_time;

    RETURN TRUE;
END;
$$;

-- Function to enable/disable job
CREATE OR REPLACE FUNCTION cron_jobs.toggle_job(
    p_job_name TEXT,
    p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cron_jobs.job_status
    SET 
        is_enabled = p_enabled,
        status = CASE WHEN p_enabled THEN 'IDLE' ELSE 'DISABLED' END,
        updated_at = NOW()
    WHERE job_name = p_job_name;

    -- Log the action
    INSERT INTO cron_jobs.job_logs (
        job_name, 
        start_time,
        end_time,
        status,
        metadata
    )
    VALUES (
        p_job_name,
        NOW(),
        NOW(),
        CASE WHEN p_enabled THEN 'IDLE' ELSE 'DISABLED' END,
        jsonb_build_object('action', CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END)
    );

    RETURN TRUE;
END;
$$;

-- Function to clean old logs
CREATE OR REPLACE FUNCTION cron_jobs.clean_logs(
    p_job_name TEXT DEFAULT NULL,
    p_older_than TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_status TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM cron_jobs.job_logs
        WHERE (p_job_name IS NULL OR job_name = p_job_name)
        AND (p_status IS NULL OR status = p_status)
        AND start_time < p_older_than
        RETURNING *
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN v_deleted;
END;
$$;

-- =====================================================
-- 5. INITIAL DATA
-- =====================================================

-- Insert default jobs
INSERT INTO cron_jobs.job_status (job_name, next_run) VALUES
('recurring_billing', NOW() + INTERVAL '6 hours'),
('trial_processing', NOW() + INTERVAL '1 hour'),
('payment_retries', NOW() + INTERVAL '2 hours'),
('full_cleanup', NOW() + INTERVAL '1 day'),
('monitoring', NOW() + INTERVAL '15 minutes')
ON CONFLICT (job_name) DO NOTHING;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE cron_jobs.job_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_jobs.job_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admin users can view job status" ON cron_jobs.job_status
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'isAdmin' = 'true'
        )
    );

CREATE POLICY "Admin users can manage job status" ON cron_jobs.job_status
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'isAdmin' = 'true'
        )
    );

CREATE POLICY "Admin users can view job logs" ON cron_jobs.job_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'isAdmin' = 'true'
        )
    );

CREATE POLICY "Service role can manage everything" ON cron_jobs.job_status
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service role can manage logs" ON cron_jobs.job_logs
    FOR ALL TO service_role USING (true);

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to authenticated users (read-only for admins)
GRANT SELECT ON cron_jobs.job_status TO authenticated;
GRANT SELECT ON cron_jobs.job_logs TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON cron_jobs.job_status TO service_role;
GRANT ALL ON cron_jobs.job_logs TO service_role;

-- Grant USAGE on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cron_jobs TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cron_jobs TO service_role;

-- =====================================================
-- 8. COMMENTS
-- =====================================================

COMMENT ON TABLE cron_jobs.job_status IS 'Stores the current status and metrics for cron jobs';
COMMENT ON TABLE cron_jobs.job_logs IS 'Logs all cron job executions with details';

COMMENT ON FUNCTION cron_jobs.start_job(TEXT) IS 'Starts a cron job and creates log entry';
COMMENT ON FUNCTION cron_jobs.complete_job(TEXT, TEXT, TEXT, JSONB) IS 'Completes a cron job and updates metrics';
COMMENT ON FUNCTION cron_jobs.toggle_job(TEXT, BOOLEAN) IS 'Enables or disables a cron job';
COMMENT ON FUNCTION cron_jobs.clean_logs(TEXT, TIMESTAMPTZ, TEXT) IS 'Cleans old job logs based on criteria';
