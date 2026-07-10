/**
 * Kill-switch pentru plăți (Stripe). Implicit: dezactivat în producție dacă env lipsește.
 */
export function isPaymentsEnabled() {
  const raw = process.env.PAYMENTS_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return process.env.NODE_ENV !== 'production';
  }
  return String(raw).toLowerCase() === 'true';
}

export function assertPaymentsEnabled() {
  if (!isPaymentsEnabled()) {
    const err = new Error('Plățile sunt temporar dezactivate.');
    err.code = 'PAYMENTS_DISABLED';
    throw err;
  }
}
