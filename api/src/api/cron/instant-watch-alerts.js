import { createClient } from '@supabase/supabase-js';
import { ResendEmailService } from '../../core/services/ResendEmailService.js';
import { NotificationService } from '../../core/services/NotificationService.js';
import { InstantWatchAlertService } from '../../core/services/InstantWatchAlertService.js';

export const config = {
  maxDuration: 60,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyWebhookAuth(req) {
  const authKey =
    req.headers['authorization']?.replace(/^Bearer\s+/i, '')
    || req.headers['x-instant-alert-secret'];

  const expected = process.env.INSTANT_ALERT_WEBHOOK_SECRET || process.env.ALERTS_CRON_SECRET;
  if (expected && authKey !== expected) {
    return false;
  }
  return true;
}

function buildService() {
  const resendService = new ResendEmailService();
  const notificationService = new NotificationService(supabase);
  return new InstantWatchAlertService(supabase, resendService, notificationService);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyWebhookAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const connectionId = body.connection_id ?? body.connectionId ?? req.query?.connection_id;

    if (!connectionId) {
      return res.status(400).json({ ok: false, error: 'connection_id required' });
    }

    const service = buildService();
    const result = await service.processConnection(connectionId);

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('instant-watch-alerts error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
