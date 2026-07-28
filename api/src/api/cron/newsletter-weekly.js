/**
 * Weekly public newsletter cron.
 * Schedule (Vercel Hobby): Mondays 05:00 UTC ≈ 08:00 Europe/Bucharest (EEST summer).
 * Winter (EET UTC+2): consider "0 6 * * 1".
 */

import { createClient } from '@supabase/supabase-js';
import NewsletterRepository from '../../database/repositories/NewsletterRepository.js';
import { ResendEmailService } from '../../core/services/ResendEmailService.js';
import { AdminAlertService } from '../../core/services/AdminAlertService.js';
import { WeeklyNewsletterService } from '../../core/services/WeeklyNewsletterService.js';

export const config = {
  maxDuration: 60,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyCronAuth(req) {
  const cronKey =
    req.headers['x-vercel-cron']
    || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  const expected =
    process.env.NEWSLETTER_CRON_SECRET
    || process.env.ALERTS_CRON_SECRET
    || process.env.VERCEL_CRON_KEY;

  // Vercel Cron injects x-vercel-cron; when secret is unset, allow that header only.
  if (!expected) {
    return Boolean(req.headers['x-vercel-cron']);
  }
  return cronKey === expected || Boolean(req.headers['x-vercel-cron']);
}

function buildService() {
  const resendService = new ResendEmailService();
  const adminAlertService = new AdminAlertService(supabase, resendService);
  const newsletterRepository = new NewsletterRepository(supabase);
  return new WeeklyNewsletterService(supabase, newsletterRepository, {
    resendService,
    adminAlertService,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const dryRun = body.dryRun === true || req.query?.dryRun === '1';
    const canaryEmail = body.canaryEmail || req.query?.canaryEmail || undefined;

    const service = buildService();
    const result = await service.processWeeklyNewsletter({ dryRun, canaryEmail });

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('newsletter-weekly error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
