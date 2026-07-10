/**
 * Valute fără subdiviziune (unități minore = unitate principală).
 * @see https://docs.stripe.com/currencies#zero-decimal
 * @see docs/STRIPE_PAYMENTS.md
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
  'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

/**
 * Convertește suma din comandă (unități majore, ex. lei) în unități minore pentru Stripe API.
 * @param {number|string} amount
 * @param {string} currency ISO code
 * @returns {number|null}
 */
export function orderAmountToStripeMinorUnits(amount, currency) {
  const c = String(currency || '').toLowerCase();
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return Math.round(n);
  return Math.round(n * 100);
}
