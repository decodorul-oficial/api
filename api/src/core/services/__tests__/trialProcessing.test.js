/**
 * Unit tests for trial expiry reminder email + cron processing phases.
 */
import { jest } from '@jest/globals';

process.env.FRONTEND_URL = 'https://decodoruloficial.ro';
process.env.RESEND_API_KEY = 're_test_key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-test-key';

const { default: BillingNotificationService } = await import('../BillingNotificationService.js');

function createChainableQuery(result) {
  const promise = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gt: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    is: jest.fn(() => chain),
    update: jest.fn(() => chain),
    insert: jest.fn(() => promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return chain;
}

describe('BillingNotificationService.notifyTrialExpiringSoon', () => {
  test('sends Romanian reminder with /preturi CTA', async () => {
    const sendEmail = jest.fn().mockResolvedValue({ id: 'email_1' });
    const supabase = {
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: 'trial@example.com' } },
          }),
        },
      },
    };

    const service = new BillingNotificationService(supabase, { sendEmail });
    const result = await service.notifyTrialExpiringSoon({
      userId: 'user-1',
      trialEnd: '2026-08-11T04:00:00.000Z',
    });

    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toBe('trial@example.com');
    expect(payload.subject).toMatch(/Trial-ul Pro expiră mâine/);
    expect(payload.html).toContain('https://decodoruloficial.ro/preturi');
    expect(payload.text).toContain('https://decodoruloficial.ro/preturi');
  });

  test('returns no_email when user has no address', async () => {
    const sendEmail = jest.fn();
    const supabase = {
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({ data: { user: null } }),
        },
      },
    };
    const service = new BillingNotificationService(supabase, { sendEmail });
    const result = await service.notifyTrialExpiringSoon({ userId: 'user-2' });
    expect(result).toEqual({ sent: false, reason: 'no_email' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('processTrialSubscriptions', () => {
  test('sends reminder then downgrades expired trials', async () => {
    const now = new Date('2026-08-10T04:00:00.000Z');
    const soonEnd = '2026-08-10T20:00:00.000Z';
    const expiredEnd = '2026-08-09T04:00:00.000Z';

    const reminderSelect = createChainableQuery({
      data: [
        {
          id: 'sub-soon',
          user_id: 'user-soon',
          tier_id: 'tier-pro',
          trial_start: '2026-07-27T20:00:00.000Z',
          trial_end: soonEnd,
          trial_reminder_sent_at: null,
        },
      ],
      error: null,
    });
    const expiredSelect = createChainableQuery({
      data: [
        {
          id: 'sub-expired',
          user_id: 'user-expired',
          tier_id: 'tier-pro',
          trial_start: '2026-07-26T04:00:00.000Z',
          trial_end: expiredEnd,
        },
      ],
      error: null,
    });
    const reminderUpdate = createChainableQuery({ data: null, error: null });
    const paymentLogsInsert = jest.fn().mockResolvedValue({ data: null, error: null });

    let subscriptionsCall = 0;
    const supabaseClient = {
      from: jest.fn((table) => {
        if (table === 'payment_logs') {
          return { insert: paymentLogsInsert };
        }
        if (table === 'subscriptions') {
          subscriptionsCall += 1;
          // 1: reminder select, 2: reminder update, 3: expired select
          if (subscriptionsCall === 1) return reminderSelect;
          if (subscriptionsCall === 2) return reminderUpdate;
          return expiredSelect;
        }
        return createChainableQuery({ data: null, error: null });
      }),
    };

    const userService = {
      downgradeFromTrial: jest.fn().mockResolvedValue(undefined),
    };
    const billingNotificationService = {
      notifyTrialExpiringSoon: jest.fn().mockResolvedValue({ sent: true }),
    };

    const { processTrialSubscriptions } = await import('../../../api/cron/index.js');
    const result = await processTrialSubscriptions({
      supabaseClient,
      userService,
      billingNotificationService,
      now,
    });

    expect(billingNotificationService.notifyTrialExpiringSoon).toHaveBeenCalledWith({
      userId: 'user-soon',
      trialEnd: soonEnd,
    });
    expect(reminderUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ trial_reminder_sent_at: now.toISOString() })
    );
    expect(userService.downgradeFromTrial).toHaveBeenCalledWith('user-expired');
    expect(paymentLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_id: 'sub-expired',
        event_type: 'SUBSCRIPTION_CANCELED',
        status: 'SUCCEEDED',
      })
    );
    expect(result).toEqual({ remindersSent: 1, expiredProcessed: 1 });
  });

  test('does not mark reminder when send fails transiently', async () => {
    const now = new Date('2026-08-10T04:00:00.000Z');
    const reminderSelect = createChainableQuery({
      data: [
        {
          id: 'sub-soon',
          user_id: 'user-soon',
          tier_id: 'tier-pro',
          trial_end: '2026-08-10T20:00:00.000Z',
          trial_reminder_sent_at: null,
        },
      ],
      error: null,
    });
    const expiredSelect = createChainableQuery({ data: [], error: null });
    const reminderUpdate = createChainableQuery({ data: null, error: null });

    let selectCalls = 0;
    const supabaseClient = {
      from: jest.fn((table) => {
        if (table === 'subscriptions') {
          // Only two selects when reminder is not marked (no update)
          selectCalls += 1;
          if (selectCalls === 1) return reminderSelect;
          return expiredSelect;
        }
        return { insert: jest.fn() };
      }),
    };

    const { processTrialSubscriptions } = await import('../../../api/cron/index.js');
    const result = await processTrialSubscriptions({
      supabaseClient,
      userService: { downgradeFromTrial: jest.fn() },
      billingNotificationService: {
        notifyTrialExpiringSoon: jest.fn().mockResolvedValue({
          sent: false,
          reason: 'resend_timeout',
        }),
      },
      now,
    });

    expect(reminderUpdate.update).not.toHaveBeenCalled();
    expect(result.remindersSent).toBe(0);
  });
});

describe('UserService.downgradeFromTrial', () => {
  test('sets profile free and cancels TRIALING subscription', async () => {
    const profilesUpdate = createChainableQuery({ data: null, error: null });
    const subscriptionsUpdate = createChainableQuery({ data: null, error: null });
    const supabase = {
      from: jest.fn((table) => {
        if (table === 'profiles') return profilesUpdate;
        if (table === 'subscriptions') return subscriptionsUpdate;
        return createChainableQuery({ data: null, error: null });
      }),
    };

    const { default: UserService } = await import('../UserService.js');
    const service = new UserService(supabase);
    await service.downgradeFromTrial('user-xyz');

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(profilesUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_tier: 'free' })
    );
    expect(subscriptionsUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELED' })
    );
    expect(subscriptionsUpdate.eq).toHaveBeenCalledWith('user_id', 'user-xyz');
    expect(subscriptionsUpdate.eq).toHaveBeenCalledWith('status', 'TRIALING');
  });
});
