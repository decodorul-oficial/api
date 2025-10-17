import { monitoringHandler } from './index';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Calculate next run time for monitoring (every 15 minutes)
function calculateNextRun() {
  const now = new Date();
  const next15Min = new Date(now);
  next15Min.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  return next15Min.toISOString();
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
      p_job_name: 'monitoring',
      p_next_run: nextRun,
      p_status: 'IDLE',
      p_is_enabled: true
    });
    console.log(`🔄 Synced monitoring job - next run: ${nextRun}`);
  } catch (error) {
    console.error('❌ Error syncing monitoring job:', error);
  }

  await monitoringHandler(req, res);
}
