import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRole);

// Helper function to check if a cron job is enabled
const isJobEnabled = async (jobName) => {
  try {
    const { data, error } = await supabase.rpc('get_cron_job_status', {
      p_job_name: jobName
    });
    
    if (error || !data || data.length === 0) {
      console.log(`Job ${jobName} not found or error:`, error);
      return false;
    }
    
    return data[0].is_enabled;
  } catch (error) {
    console.error(`Error checking if job ${jobName} is enabled:`, error);
    return false;
  }
};

// Helper function to verify authorization
const verifyAuth = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid authorization token');
  }

  return user;
};

// Helper function to verify if user is admin
const verifyAdmin = async (user) => {
  const { data, error } = await supabase
    .from('auth.users')
    .select('raw_user_meta_data')
    .eq('id', user.id)
    .single();

  if (error || !data?.raw_user_meta_data?.isAdmin) {
    throw new Error('Unauthorized - Admin access required');
  }
};

// Helper function to run a job and log its execution
const runJob = async (jobName, jobFunction) => {
  // Check if job is enabled first
  const enabled = await isJobEnabled(jobName);
  if (!enabled) {
    console.log(`Job ${jobName} is disabled, skipping execution`);
    return { success: true, skipped: true };
  }

  // Start job and create log entry (use public wrapper)
  await supabase.rpc('cron_start_job', { p_job_name: jobName });

  try {
    // Run the job
    const startTime = Date.now();
    await jobFunction();
    const duration = Date.now() - startTime;

    // Complete job successfully
    await supabase.rpc('cron_complete_job', {
      p_job_name: jobName,
      p_status: 'IDLE',
      p_metadata: { duration }
    });

    return { success: true };
  } catch (error) {
    // Log error and mark job as failed
    await supabase.rpc('cron_complete_job', {
      p_job_name: jobName,
      p_status: 'FAILED',
      p_error: error.message
    });

    throw error;
  }
};

// Cron job handler for recurring billing — payments maintenance sweeper (Oblio retry + light Stripe drift)
export async function recurringBillingHandler(req, res) {
  try {
    await runJob('recurring_billing', async () => {
      console.log('🔄 Payments maintenance sweeper (Oblio queue + Stripe drift)...');
      const { default: SubscriptionService } = await import('../../core/services/SubscriptionService.js');
      const service = new SubscriptionService(supabase);
      const result = await service.runPaymentsMaintenanceSweeper({ oblioLimit: 20, driftLimit: 10 });
      console.log('✅ Payments maintenance done:', JSON.stringify(result));
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Daily Hobby cron: (1) remind trials ending in next 24h, (2) downgrade expired trials.
 * Exported for unit tests.
 */
export async function processTrialSubscriptions({
  supabaseClient = supabase,
  userService,
  billingNotificationService,
  now = new Date(),
} = {}) {
  let users = userService;
  if (!users) {
    const { default: UserService } = await import('../../core/services/UserService.js');
    users = new UserService(supabaseClient);
  }

  let billing = billingNotificationService;
  if (!billing) {
    const { default: BillingNotificationService } = await import(
      '../../core/services/BillingNotificationService.js'
    );
    billing = new BillingNotificationService(supabaseClient);
  }

  const nowIso = now.toISOString();
  const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let remindersSent = 0;
  let expiredProcessed = 0;

  // Phase 1: trials ending within the next 24 hours (not yet reminded)
  const { data: remindingSoon, error: reminderError } = await supabaseClient
    .from('subscriptions')
    .select('id, user_id, tier_id, trial_start, trial_end, trial_reminder_sent_at')
    .eq('status', 'TRIALING')
    .gt('trial_end', nowIso)
    .lte('trial_end', in24hIso)
    .is('trial_reminder_sent_at', null);

  if (reminderError) {
    console.error('Error fetching trials needing reminder:', reminderError);
  } else {
    console.log(`Found ${remindingSoon?.length || 0} trials needing expiry reminder`);
    for (const subscription of remindingSoon || []) {
      try {
        const sendResult = await billing.notifyTrialExpiringSoon({
          userId: subscription.user_id,
          trialEnd: subscription.trial_end,
        });

        // Mark sent when delivered or intentionally skipped (no email / Resend not configured)
        // so Hobby daily cron does not retry forever. Leave unmarked on transient send failures.
        if (sendResult?.sent || sendResult?.reason === 'no_email' || sendResult?.reason === 'not_configured') {
          const { error: markError } = await supabaseClient
            .from('subscriptions')
            .update({
              trial_reminder_sent_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', subscription.id)
            .eq('status', 'TRIALING');

          if (markError) {
            console.error(`Failed to mark reminder sent for ${subscription.id}:`, markError);
          } else {
            remindersSent += 1;
          }
        } else {
          console.warn(
            `Trial reminder not marked for ${subscription.id}:`,
            sendResult?.reason || 'unknown'
          );
        }
      } catch (err) {
        console.error(`Error sending trial reminder for ${subscription.id}:`, err);
      }
    }
  }

  // Phase 2: expired trials → downgrade via UserService
  const { data: expiredTrials, error: expiredError } = await supabaseClient
    .from('subscriptions')
    .select('id, user_id, tier_id, trial_start, trial_end')
    .eq('status', 'TRIALING')
    .lte('trial_end', nowIso);

  if (expiredError) {
    console.error('Error fetching expired trial subscriptions:', expiredError);
    throw expiredError;
  }

  console.log(`Found ${expiredTrials?.length || 0} expired trial subscriptions to process`);

  for (const subscription of expiredTrials || []) {
    try {
      console.log(
        `Processing trial expiration for subscription ${subscription.id} (user: ${subscription.user_id})`
      );

      await users.downgradeFromTrial(subscription.user_id);

      await supabaseClient.from('payment_logs').insert({
        subscription_id: subscription.id,
        event_type: 'SUBSCRIPTION_CANCELED',
        status: 'SUCCEEDED',
        raw_payload: {
          subscription_id: subscription.id,
          user_id: subscription.user_id,
          tier_id: subscription.tier_id,
          trial_start: subscription.trial_start,
          trial_end: subscription.trial_end,
          expired_at: nowIso,
          action: 'trial_expired_downgrade',
          reason: 'trial_period_expired',
        },
      });

      expiredProcessed += 1;
      console.log(`✅ Successfully processed trial expiration for subscription ${subscription.id}`);
    } catch (subscriptionError) {
      console.error(`Error processing trial subscription ${subscription.id}:`, subscriptionError);
      try {
        await supabaseClient.from('payment_logs').insert({
          subscription_id: subscription.id,
          event_type: 'WEBHOOK_FAILED',
          status: 'FAILED',
          error_message: subscriptionError.message,
          raw_payload: {
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            error: subscriptionError.message,
            processed_at: nowIso,
            action: 'trial_expiration_processing_failed',
          },
        });
      } catch (logError) {
        console.error(`Failed to log error for subscription ${subscription.id}:`, logError);
      }
    }
  }

  console.log(
    `✅ Trial processing done — reminders=${remindersSent}, expired=${expiredProcessed}`
  );
  return { remindersSent, expiredProcessed };
}

// Cron job handler for trial processing
export async function trialProcessingHandler(req, res) {
  try {
    await runJob('trial_processing', async () => {
      console.log('⏰ Processing trial reminders + expirations...');
      await processTrialSubscriptions();
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Cron job handler for payment retries
export async function paymentRetriesHandler(req, res) {
  try {
    await runJob('payment_retries', async () => {
      console.log('🔄 Processing payment retries...');
      
      // Get failed payments that need retry from payments schema
      const { data: failedPayments, error } = await supabase
        .from('payments.payment_logs')
        .select('*')
        .eq('status', 'FAILED')
        .lt('retry_count', 3) // Max 3 retries
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching failed payments:', error);
        return;
      }

      console.log(`Found ${failedPayments?.length || 0} failed payments to retry`);

      // Process each failed payment (simplified - just log for now)
      for (const payment of failedPayments || []) {
        console.log(`Retrying payment ${payment.order_id} (attempt ${(payment.retry_count || 0) + 1})`);
        // TODO: Implement actual payment retry logic
      }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Cron job handler for full cleanup
export async function fullCleanupHandler(req, res) {
  try {
    await runJob('full_cleanup', async () => {
      // Implement cleanup logic here
      await supabase.rpc('cron_clean_logs', {
        p_older_than: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Cron job handler for monitoring
export async function monitoringHandler(req, res) {
  try {
    await runJob('monitoring', async () => {
      console.log('📊 Running system monitoring...');
      
      // Check system health metrics
      const { data: jobStatuses, error } = await supabase.rpc('get_all_cron_job_statuses');
      
      if (error) {
        console.error('Error fetching job statuses:', error);
        return;
      }

      console.log(`Monitoring ${jobStatuses?.length || 0} cron jobs`);
      
      // Check for failed jobs
      const failedJobs = jobStatuses?.filter(job => job.status === 'FAILED') || [];
      if (failedJobs.length > 0) {
        console.warn(`Found ${failedJobs.length} failed jobs:`, failedJobs.map(j => j.job_name));
      }

      // Check for disabled jobs
      const disabledJobs = jobStatuses?.filter(job => !job.is_enabled) || [];
      console.log(`Found ${disabledJobs.length} disabled jobs:`, disabledJobs.map(j => j.job_name));
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoints for manual control
export async function adminRunJobHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { jobName } = req.body;
    if (!jobName) {
      throw new Error('Job name is required');
    }

    const handlers = {
      'recurring_billing': recurringBillingHandler,
      'trial_processing': trialProcessingHandler,
      'payment_retries': paymentRetriesHandler,
      'full_cleanup': fullCleanupHandler,
      'monitoring': monitoringHandler
    };

    if (!handlers[jobName]) {
      throw new Error('Invalid job name');
    }

    await handlers[jobName](req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoint to get job status
export async function adminGetJobStatusHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { jobName } = req.query;
    const { data, error } = await supabase.rpc('get_cron_job_status', {
      p_job_name: jobName
    });

    if (error) throw error;
    res.status(200).json(data[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoint to get all jobs status
export async function adminGetAllJobsStatusHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { data, error } = await supabase.rpc('get_all_cron_job_statuses');

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoint to get job logs
export async function adminGetJobLogsHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { jobName, startDate, endDate, status, limit = 100, offset = 0 } = req.query;
    
    const { data, error } = await supabase.rpc('get_cron_job_logs', {
      p_job_name: jobName || null,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_status: status || null,
      p_limit: parseInt(limit),
      p_offset: parseInt(offset)
    });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoint to enable/disable job
export async function adminToggleJobHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { jobName, enabled } = req.body;
    if (!jobName) throw new Error('Job name is required');

    const { data, error } = await supabase.rpc('cron_toggle_job', {
      p_job_name: jobName,
      p_enabled: enabled
    });

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Admin endpoint to clear job logs
export async function adminClearJobLogsHandler(req, res) {
  try {
    const user = await verifyAuth(req);
    await verifyAdmin(user);

    const { jobName, olderThan, status } = req.body;
    
    const { data, error } = await supabase.rpc('cron_clean_logs', {
      p_job_name: jobName || null,
      p_older_than: olderThan || null,
      p_status: status || null
    });

    if (error) throw error;
    res.status(200).json({ deletedCount: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
