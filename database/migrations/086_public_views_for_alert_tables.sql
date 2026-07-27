-- Public pass-through views so service_role PostgREST can access payments alert tables
-- without requiring payments in Exposed schemas.

GRANT USAGE ON SCHEMA payments TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA payments TO service_role;

CREATE OR REPLACE VIEW public.email_slot_runs AS SELECT * FROM payments.email_slot_runs;
CREATE OR REPLACE VIEW public.email_article_deliveries AS SELECT * FROM payments.email_article_deliveries;
CREATE OR REPLACE VIEW public.admin_alert_logs AS SELECT * FROM payments.admin_alert_logs;
CREATE OR REPLACE VIEW public.alert_preference_audit AS SELECT * FROM payments.alert_preference_audit;
CREATE OR REPLACE VIEW public.email_provider_status AS SELECT * FROM payments.email_provider_status;
CREATE OR REPLACE VIEW public.instant_alert_logs AS SELECT * FROM payments.instant_alert_logs;
CREATE OR REPLACE VIEW public.email_templates AS SELECT * FROM payments.email_templates;
CREATE OR REPLACE VIEW public.email_digest_logs AS SELECT * FROM payments.email_digest_logs;
CREATE OR REPLACE VIEW public.v_email_ops_today AS SELECT * FROM payments.v_email_ops_today;
CREATE OR REPLACE VIEW public.v_email_ops_7d AS SELECT * FROM payments.v_email_ops_7d;
CREATE OR REPLACE VIEW public.v_email_missed_slots AS SELECT * FROM payments.v_email_missed_slots;
CREATE OR REPLACE VIEW public.v_email_top_users_7d AS SELECT * FROM payments.v_email_top_users_7d;

GRANT ALL ON public.email_slot_runs TO service_role;
GRANT ALL ON public.email_article_deliveries TO service_role;
GRANT ALL ON public.admin_alert_logs TO service_role;
GRANT ALL ON public.alert_preference_audit TO service_role;
GRANT ALL ON public.email_provider_status TO service_role;
GRANT ALL ON public.instant_alert_logs TO service_role;
GRANT ALL ON public.email_templates TO service_role;
GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_digest_logs TO service_role;
GRANT SELECT ON public.v_email_ops_today TO service_role;
GRANT SELECT ON public.v_email_ops_7d TO service_role;
GRANT SELECT ON public.v_email_missed_slots TO service_role;
GRANT SELECT ON public.v_email_top_users_7d TO service_role;
