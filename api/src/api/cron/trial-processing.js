import { trialProcessingHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hobby daily cron: next_run is +1 day (not +1 hour)
function calculateNextRun() {
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setUTCDate(now.getUTCDate() + 1);
  nextDay.setUTCHours(4, 0, 0, 0);
  // If we already passed today's 04:00 UTC sync window and somehow run late,
  // still land on tomorrow 04:00 UTC relative to "now + 1 day" floor above.
  if (nextDay <= now) {
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  }
  return nextDay.toISOString();
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
