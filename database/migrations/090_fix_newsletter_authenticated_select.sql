-- Prevent authenticated JWT on the shared service client from emptying newsletter reads.
-- Direct browser access still goes through GraphQL; SELECT for authenticated is safe and
-- matches public getNewsletterSubscription(email). Writes remain anon/service only.

DROP POLICY IF EXISTS "Block authenticated users from newsletter table" ON public.newsletter_subscribers;

DROP POLICY IF EXISTS "Allow authenticated to read newsletter subscription" ON public.newsletter_subscribers;
CREATE POLICY "Allow authenticated to read newsletter subscription"
  ON public.newsletter_subscribers
  FOR SELECT
  TO authenticated
  USING (true);
