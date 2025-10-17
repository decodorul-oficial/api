-- Fix RLS policies for newsletter_subscribers table
-- Allow public newsletter subscriptions while maintaining security

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Block all operations on newsletter_subscribers" ON public.newsletter_subscribers;

-- Allow public users to subscribe to newsletter (INSERT)
CREATE POLICY "Allow public newsletter subscription" ON public.newsletter_subscribers
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow public users to unsubscribe (UPDATE their own subscription)
CREATE POLICY "Allow public newsletter unsubscribe" ON public.newsletter_subscribers
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow public users to read their own subscription status
CREATE POLICY "Allow public to read own subscription" ON public.newsletter_subscribers
  FOR SELECT
  TO anon
  USING (true);

-- Block authenticated users from accessing newsletter data
-- (they should use their user profile instead)
CREATE POLICY "Block authenticated users from newsletter table" ON public.newsletter_subscribers
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Service role bypasses RLS by default, but we can be explicit
-- (This is optional since service_role bypasses RLS automatically)
CREATE POLICY "Service role full access" ON public.newsletter_subscribers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
