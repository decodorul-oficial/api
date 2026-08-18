/**
 * Event-driven instant alerts for critical legislative watch hits.
 */

import {
  buildInstantAlertHtml,
  buildInstantAlertText,
} from './AlertDigestEmailBuilder.js';

const COOLDOWN_MS = 30 * 60 * 1000;

export class InstantWatchAlertService {
  constructor(supabaseClient, resendService, notificationService, options = {}) {
    this.supabase = supabaseClient;
    this.resendService = resendService;
    this.notificationService = notificationService;
    this.baseUrl = options.baseUrl || process.env.WEB_BASE_URL || 'https://www.decodoruloficial.ro';
    this.cooldownMs = options.cooldownMs || COOLDOWN_MS;
  }

  async _isOnCooldown(userId) {
    const since = new Date(Date.now() - this.cooldownMs).toISOString();
    const { data } = await this.supabase
      .from('instant_alert_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('sent_at', since)
      .limit(1);

    return (data?.length || 0) > 0;
  }

  async _logInstantAlert(row) {
    const { error } = await this.supabase
      .from('instant_alert_logs')
      .insert(row);

    if (error && error.code !== '23505') {
      console.error('instant_alert_logs insert failed:', error.message);
      return false;
    }

    return !error;
  }

  async processConnection(connectionId) {
    const connId = Number(connectionId);
    if (!connId) {
      return { processed: 0, sent: 0, skipped: 0, errors: ['invalid_connection_id'] };
    }

    const { data: targets, error } = await this.supabase.rpc('get_instant_alert_targets', {
      p_connection_id: connId,
    });

    if (error) {
      throw new Error(`get_instant_alert_targets: ${error.message}`);
    }

    const results = { processed: 0, sent: 0, skipped: 0, errors: [] };
    const byUser = new Map();

    for (const row of targets || []) {
      if (!byUser.has(row.user_id)) {
        byUser.set(row.user_id, []);
      }
      byUser.get(row.user_id).push(row);
    }

    for (const [userId, hits] of byUser.entries()) {
      results.processed += 1;

      if (await this._isOnCooldown(userId)) {
        results.skipped += hits.length;
        continue;
      }

      const hit = hits[0];
      const articleUrl = `${this.baseUrl.replace(/\/$/, '')}/stiri/${hit.stiri_slug}`;
      const subject = `Alertă: ${hit.watch_label} — ${hit.relationship_type}`;

      const html = buildInstantAlertHtml({
        userName: hit.user_name,
        watchLabel: hit.watch_label,
        relationshipType: hit.relationship_type,
        articleTitle: hit.stiri_title,
        articleUrl,
        manageAlertsUrl: `${this.baseUrl.replace(/\/$/, '')}/alerte`,
        baseUrl: this.baseUrl,
      });

      const text = buildInstantAlertText({
        watchLabel: hit.watch_label,
        relationshipType: hit.relationship_type,
        articleTitle: hit.stiri_title,
        articleUrl,
        manageAlertsUrl: `${this.baseUrl.replace(/\/$/, '')}/alerte`,
      });

      try {
        const emailResult = await this.resendService.sendEmail({
          to: hit.user_email,
          subject,
          html,
          text,
        });

        const logged = await this._logInstantAlert({
          user_id: userId,
          watch_id: hit.watch_id,
          stiri_id: hit.stiri_id,
          relationship_type: hit.relationship_type,
          connection_id: connId,
          resend_id: emailResult?.id || null,
        });

        if (!logged) {
          results.skipped += 1;
          continue;
        }

        await this.notificationService.insertNotification({
          userId,
          type: 'instant_watch_alert',
          title: subject,
          body: hit.stiri_title,
          href: articleUrl,
          payload: {
            watchId: hit.watch_id,
            watchLabel: hit.watch_label,
            stiriId: hit.stiri_id,
            relationshipType: hit.relationship_type,
            connectionId: connId,
          },
        });

        results.sent += 1;
      } catch (sendError) {
        results.errors.push(`${userId}: ${sendError.message}`);
      }
    }

    return results;
  }
}

export default InstantWatchAlertService;
