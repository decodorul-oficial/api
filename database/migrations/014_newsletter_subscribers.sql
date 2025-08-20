-- Newsletter subscribers table and policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "citext";

-- Table: public.newsletter_subscribers
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced','complained')),
  locale TEXT NOT NULL DEFAULT 'ro-RO',
  tags JSONB NOT NULL DEFAULT '[]',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_reason TEXT,
  last_ip INET,
  last_user_agent TEXT,
  consent_version TEXT,
  consent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_created_at ON public.newsletter_subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_tags_gin ON public.newsletter_subscribers USING GIN (tags);

-- RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Block all operations for authenticated role (service_role bypasses RLS)
DROP POLICY IF EXISTS "Block all operations on newsletter_subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Block all operations on newsletter_subscribers" ON public.newsletter_subscribers
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_newsletter_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER update_newsletter_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.newsletter_subscribers IS 'Newsletter subscribers with subscription status, metadata and consent info';
COMMENT ON COLUMN public.newsletter_subscribers.email IS 'Subscriber email (case-insensitive)';
COMMENT ON COLUMN public.newsletter_subscribers.status IS 'Subscription status: subscribed, unsubscribed, bounced, complained';
COMMENT ON COLUMN public.newsletter_subscribers.tags IS 'Arbitrary tags for segmentation';
COMMENT ON COLUMN public.newsletter_subscribers.source IS 'Source of subscription (web, import, api, etc.)';
COMMENT ON COLUMN public.newsletter_subscribers.last_ip IS 'Last IP that modified subscription';
COMMENT ON COLUMN public.newsletter_subscribers.last_user_agent IS 'Last User-Agent that modified subscription';

