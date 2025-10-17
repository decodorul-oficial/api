import { trialProcessingHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Calculate next run time for trial_processing (every hour)
function calculateNextRun() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  return nextHour.toISOString();
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
      p_job_name: 'trial_processing',
      p_next_run: nextRun,
      p_status: 'IDLE',
      p_is_enabled: true
    });
    console.log(`🔄 Synced trial_processing job - next run: ${nextRun}`);
  } catch (error) {
    console.error('❌ Error syncing trial_processing job:', error);
  }

  await trialProcessingHandler(req, res);
}
