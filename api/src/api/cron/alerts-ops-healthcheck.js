import { createClient } from '@supabase/supabase-js';
import { AdminAlertService } from '../../core/services/AdminAlertService.js';
import { ResendEmailService } from '../../core/services/ResendEmailService.js';

export const config = {
  maxDuration: 60,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RO_TZ = 'Europe/Bucharest';

function verifyCronAuth(req) {
  const cronKey =
    req.headers['x-vercel-cron']
    || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  const expected = process.env.ALERTS_CRON_SECRET || process.env.VERCEL_CRON_KEY;
  if (expected && cronKey !== expected) {
    return false;
  }
  return true;
}

function isWeekdayInBucharest() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: RO_TZ,
    weekday: 'short',
  }).format(new Date());
  return !['Sat', 'Sun'].includes(weekday);
}

function hourInBucharest() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: RO_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(new Date()));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isWeekdayInBucharest()) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'weekend' });
  }

  if (hourInBucharest() < 10) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'before_10_ro' });
  }

  try {
    const adminAlertService = new AdminAlertService(supabase, new ResendEmailService());
    const issues = [];

    const { data: todayOps } = await supabase
      .from('v_email_ops_today')
      .select('*')
      .limit(1);

    const today = todayOps?.[0];
    if (!today || (today.slots_ok ?? 0) === 0) {
      issues.push('Niciun slot digest OK astăzi (L–V după 10:00 RO).');
    }

    const { data: missed } = await supabase
      .from('v_email_missed_slots')
      .select('run_day, slot');

    if (missed?.length) {
      issues.push(`Sloturi ratate: ${missed.map((m) => `${m.run_day} ${m.slot}`).join(', ')}`);
    }

    if (today?.quota_hit) {
      issues.push('Quota Resend atinsă astăzi.');
    }

    if (issues.length) {
      await adminAlertService.sendAlert({
        alertKey: `digest_healthcheck_${today?.run_day || 'unknown'}`,
        subject: 'Healthcheck alerte email — acțiune necesară',
        body: issues.join('\n\n'),
      });
    }

    return res.status(200).json({
      ok: true,
      issues,
      today: today || null,
      missedCount: missed?.length || 0,
    });
  } catch (error) {
    console.error('alerts-ops-healthcheck error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
