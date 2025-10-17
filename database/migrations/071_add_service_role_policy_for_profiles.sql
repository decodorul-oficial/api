-- =====================================================
-- ADD SERVICE ROLE POLICY FOR PROFILES TABLE
-- Migration 071: Fix RLS policy to allow service_role to manage profiles
-- =====================================================

-- Add policy for service_role to manage all profiles
-- This is needed for UserService to update profiles during trial setup
-- Using IF NOT EXISTS to avoid errors if policy already exists
DO $$
BEGIN
    -- Check if policy already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Service role can manage all profiles'
        AND roles = '{service_role}'
    ) THEN
        -- Create the policy only if it doesn't exist
        CREATE POLICY "Service role can manage all profiles" ON public.profiles
            FOR ALL TO service_role
            USING (true)
            WITH CHECK (true);
        
        -- Add comment explaining the policy
        COMMENT ON POLICY "Service role can manage all profiles" ON public.profiles IS 
        'Allows service_role to read, insert, update, and delete all profiles. Required for UserService operations like trial setup.';
        
        RAISE NOTICE '✅ Service role policy for profiles table created successfully';
    ELSE
        RAISE NOTICE 'ℹ️ Service role policy for profiles table already exists, skipping creation';
    END IF;
END $$;
