import { createClient } from '@supabase/supabase-js';
import { DailyDigestService } from '../../core/services/DailyDigestService.js';
import { EmailTemplateService } from '../../core/services/EmailTemplateService.js';
import { EmailTemplateRepository } from '../../database/repositories/EmailTemplateRepository.js';
import NewsletterRepository from '../../database/repositories/NewsletterRepository.js';
import { ResendEmailService } from '../../core/services/ResendEmailService.js';
import { AdminAlertService } from '../../core/services/AdminAlertService.js';
import StiriService from '../../core/services/StiriService.js';
import StiriRepository from '../../database/repositories/StiriRepository.js';

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

  const expected = process.env.ALERTS_CRON_SECRET || process.env.VERCEL_CRON_KEY;
  if (expected && cronKey !== expected) {
    return false;
  }
  return true;
}

function buildServices() {
  const resendService = new ResendEmailService();
  const adminAlertService = new AdminAlertService(supabase, resendService);
  const emailTemplateRepository = new EmailTemplateRepository(supabase);
  const emailTemplateService = new EmailTemplateService(emailTemplateRepository);
  const newsletterRepository = new NewsletterRepository(supabase);
  const stiriRepository = new StiriRepository(supabase);
  const stiriService = new StiriService(stiriRepository);

  return new DailyDigestService(supabase, emailTemplateService, newsletterRepository, {
    resendService,
    adminAlertService,
    stiriService,
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
    const slot = body.slot || req.query?.slot;
    const day = body.day || req.query?.day;

    const dailyDigestService = buildServices();
    const result = await dailyDigestService.processSlot({ slot, day });

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('alerts-digest-slot error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
