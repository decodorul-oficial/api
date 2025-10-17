import { recurringBillingHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Calculate next run time for recurring_billing (every 6 hours)
function calculateNextRun() {
  const now = new Date();
  const next6Hour = new Date(now);
  next6Hour.setHours(Math.ceil(now.getHours() / 6) * 6, 0, 0, 0);
  return next6Hour.toISOString();
}

export default async function handler(req, res) {
  // Allow both GET (Vercel Cron) and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify request is from Vercel Cron
  const cronKey = req.headers['x-vercel-cron'] || req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.VERCEL_CRON_KEY && cronKey !== process.env.VERCEL_CRON_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Sync job status with database
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
