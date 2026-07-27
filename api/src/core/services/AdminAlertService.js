/**
 * Admin ops alerts via Resend — deduped by alert_key (6h window).
 */

import { ResendEmailService } from './ResendEmailService.js';

const SUBJECT_PREFIX = '[Decodorul Ofic. ALERTĂ]';
const DEDUPE_HOURS = 6;

export class AdminAlertService {
  constructor(supabase, resendService) {
    this.supabase = supabase;
    this.resendService = resendService || new ResendEmailService();
  }

  _adminRecipients() {
    const raw = process.env.ADMIN_ALERT_EMAIL || '';
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async _wasRecentlyDelivered(alertKey) {
    const since = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('admin_alert_logs')
      .select('id')
      .eq('alert_key', alertKey)
      .eq('delivered', true)
      .gte('created_at', since)
      .limit(1);

    if (error) {
      console.error('AdminAlertService dedupe check failed:', error.message);
      return false;
    }
    return (data?.length || 0) > 0;
  }

  async _insertLog({ alertKey, subject, body, delivered }) {
    try {
      await this.supabase.from('admin_alert_logs').insert({
        alert_key: alertKey,
        subject,
        body,
        delivered,
      });
    } catch (error) {
      console.error('AdminAlertService log insert failed:', error);
    }
  }

  /**
   * @param {{ alertKey: string, subject: string, body?: string }} params
   * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string }>}
   */
  async sendAlert({ alertKey, subject, body }) {
    const recipients = this._adminRecipients();
    const fullSubject = subject.startsWith(SUBJECT_PREFIX)
      ? subject
      : `${SUBJECT_PREFIX} ${subject}`;

    if (!recipients.length) {
      await this._insertLog({
        alertKey,
        subject: fullSubject,
        body: body || '',
        delivered: false,
      });
      console.warn('ADMIN_ALERT_EMAIL not configured — alert logged only:', alertKey);
      return { sent: false, reason: 'no_admin_email_configured' };
    }

    const recentlyDelivered = await this._wasRecentlyDelivered(alertKey);
    if (recentlyDelivered) {
      await this._insertLog({
        alertKey,
        subject: fullSubject,
        body: body || '',
        delivered: false,
      });
      return { sent: false, skipped: true, reason: 'dedupe_6h' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 16px;">
        <h2 style="color: #0a7a70; margin: 0 0 12px;">${fullSubject}</h2>
        <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${(body || '').replace(/</g, '&lt;')}</pre>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">Generat automat — Decodorul Oficial ops</p>
      </div>
    `.trim();

    try {
      await this.resendService.sendEmail({
        to: recipients,
        subject: fullSubject,
        html,
        text: body || fullSubject,
      });

      await this._insertLog({
        alertKey,
        subject: fullSubject,
        body: body || '',
        delivered: true,
      });

      return { sent: true };
    } catch (error) {
      await this._insertLog({
        alertKey,
        subject: fullSubject,
        body: `${body || ''}\n\nSend error: ${error.message}`,
        delivered: false,
      });
      console.error('AdminAlertService send failed:', error);
      return { sent: false, reason: error.message };
    }
  }
}

export default AdminAlertService;
