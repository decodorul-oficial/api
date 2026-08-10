/**
 * Unit tests for Stripe price resolution and cancel-at-period-end behavior.
 */
import { jest } from '@jest/globals';

process.env.STRIPE_SANDBOX_SECRET_KEY = process.env.STRIPE_SANDBOX_SECRET_KEY || 'sk_test_jest_placeholder';
process.env.STRIPE_SUCCESS_URL = 'http://localhost:3010/profile?checkout=success';
process.env.STRIPE_CANCEL_URL = 'http://localhost:3010/profile?checkout=cancel';

const { default: StripePaymentService } = await import('../StripePaymentService.js');

describe('StripePaymentService price + cancel URL helpers', () => {
  let service;

  beforeEach(() => {
    service = new StripePaymentService();
  });

  test('_looksLikeStripeNativePriceId accepts real Stripe price ids', () => {
    expect(service._looksLikeStripeNativePriceId('price_1TIp6EJpJnlnn9IUNHkopUaH')).toBe(true);
  });

  test('_looksLikeStripeNativePriceId rejects lookup keys like price_pro_monthly', () => {
    expect(service._looksLikeStripeNativePriceId('price_pro_monthly')).toBe(false);
    expect(service._looksLikeStripeNativePriceId('pro_monthly')).toBe(false);
  });

  test('_resolvePriceId returns native id as-is', async () => {
    const id = await service._resolvePriceId({
      priceId: 'price_1TIp6EJpJnlnn9IUNHkopUaH',
    });
    expect(id).toBe('price_1TIp6EJpJnlnn9IUNHkopUaH');
  });

  test('_resolvePriceId resolves lookup_key via Stripe prices.list', async () => {
    service.stripe.prices.list = jest.fn().mockResolvedValue({
      data: [{ id: 'price_1ResolvedLookupKeyABCDEF' }],
    });

    const id = await service._resolvePriceId({ priceId: 'price_pro_monthly' });
    expect(id).toBe('price_1ResolvedLookupKeyABCDEF');
    expect(service.stripe.prices.list).toHaveBeenCalled();
  });

  test('_toCheckoutCancelUrl swaps checkout=success to cancel', () => {
    expect(service._toCheckoutCancelUrl('http://localhost:3010/profile?checkout=success')).toBe(
      'http://localhost:3010/profile?checkout=cancel',
    );
  });

  test('cancelStripeSubscription sets cancel_at_period_end when not immediate', async () => {
    service.stripe.subscriptions.update = jest.fn().mockResolvedValue({
      id: 'sub_123',
      cancel_at_period_end: true,
    });
    service.stripe.subscriptions.cancel = jest.fn();

    await service.cancelStripeSubscription({
      stripeSubscriptionId: 'sub_123',
      immediate: false,
    });

    expect(service.stripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: true,
    });
    expect(service.stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test('cancelStripeSubscription cancels immediately when requested', async () => {
    service.stripe.subscriptions.cancel = jest.fn().mockResolvedValue({ id: 'sub_123' });
    service.stripe.subscriptions.update = jest.fn();

    await service.cancelStripeSubscription({
      stripeSubscriptionId: 'sub_123',
      immediate: true,
    });

    expect(service.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
    expect(service.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
});
