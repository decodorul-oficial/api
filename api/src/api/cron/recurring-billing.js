import { recurringBillingHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function calculateNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(3, 0, 0, 0);
  return next.toISOString();
}

function verifyCronAuth(req) {
  const cronKey =
    req.headers['x-vercel-cron']
    || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  const expected = process.env.ALERTS_CRON_SECRET || process.env.VERCEL_CRON_KEY;
  // If no secret configured, allow (local).
  // Vercel Cron sets x-vercel-cron; pg_net sends Bearer ALERTS_CRON_SECRET.
  if (!expected) return true;
  if (req.headers['x-vercel-cron']) return true;
  return Boolean(cronKey && cronKey === expected);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const nextRun = calculateNextRun();
    await supabase.rpc('sync_cron_job_status', {
      p_job_name: 'recurring_billing',
      p_next_run: nextRun,
      p_status: 'IDLE',
      p_is_enabled: true
    });
    console.log(`🔄 Synced recurring_billing job - next run: ${nextRun}`);
  } catch (error) {
    console.error('❌ Error syncing recurring_billing job:', error);
  }

  await recurringBillingHandler(req, res);
}
