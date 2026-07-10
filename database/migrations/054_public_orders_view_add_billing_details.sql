-- View-ul public.orders trebuie să reflecte toate coloanele folosite de API (INSERT/SELECT).
-- Fără billing_details, PostgREST respinge inserturile care trimit billing_details.
-- Validat pe proiectul Supabase (payments.orders are coloana billing_details).

CREATE OR REPLACE VIEW public.orders AS
SELECT
  id,
  user_id,
  subscription_id,
  netopia_order_id,
  amount,
  currency,
  status,
  checkout_url,
  payment_method_id,
  metadata,
  created_at,
  updated_at,
  billing_details
FROM payments.orders;
