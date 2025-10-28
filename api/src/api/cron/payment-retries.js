import { paymentRetriesHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Calculate next run time for payment_retries (every 2 hours)
function calculateNextRun() {
  const now = new Date();
  const next2Hour = new Date(now);
  next2Hour.setHours(Math.ceil(now.getHours() / 2) * 2, 0, 0, 0);
  return next2Hour.toISOString();
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
      p_job_name: 'payment_retries',
      p_next_run: nextRun,
      p_status: 'IDLE',
      p_is_enabled: true
    });
    console.log(`🔄 Synced payment_retries job - next run: ${nextRun}`);
  } catch (error) {
    console.error('❌ Error syncing payment_retries job:', error);
  }

  await paymentRetriesHandler(req, res);
}
