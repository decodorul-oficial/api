/**
 * Extrage ID-ul comenzii din metadata PaymentIntent (`orderId` sau `order_id`).
 * @see docs/STRIPE_PAYMENTS.md
 *
 * @param {import('stripe').Stripe.PaymentIntent | Record<string, unknown>} paymentIntent
 * @returns {string|null}
 */
export function resolveOrderIdFromPaymentIntent(paymentIntent) {
  const meta = paymentIntent?.metadata || {};
  const id = meta.orderId ?? meta.order_id;
  if (id == null || id === '') return null;
  return String(id);
}
