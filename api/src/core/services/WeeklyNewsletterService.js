/**
 * Weekly public newsletter: top stories from previous calendar week → Resend.
 */

import {
  buildWeeklyNewsletterHtml,
  buildWeeklyNewsletterSubject,
  buildWeeklyNewsletterText,
  validateWeeklyNewsletterHtml,
} from './WeeklyNewsletterEmailBuilder.js';
import { ResendEmailError } from './ResendEmailService.js';

const DEFAULT_BASE_URL = 'https://www.decodoruloficial.ro';
const ARTICLE_LIMIT = 15;

export class WeeklyNewsletterService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {import('../database/repositories/NewsletterRepository.js').default} newsletterRepository
   * @param {{ resendService?: import('./ResendEmailService.js').ResendEmailService, adminAlertService?: import('./AdminAlertService.js').AdminAlertService, baseUrl?: string }} [deps]
   */
  constructor(supabase, newsletterRepository, deps = {}) {
    this.supabase = supabase;
    this.newsletterRepository = newsletterRepository;
    this.resendService = deps.resendService;
    this.adminAlertService = deps.adminAlertService;
    this.baseUrl = deps.baseUrl || process.env.FRONTEND_URL || DEFAULT_BASE_URL;
  }

  async fetchWeeklyArticles(limit = ARTICLE_LIMIT) {
    const { data, error } = await this.supabase.rpc('get_weekly_newsletter_stiri', {
      p_limit: limit,
    });
    if (error) {
      throw new Error(`get_weekly_newsletter_stiri failed: ${error.message}`);
    }
    return data || [];
  }

  async findOkRun(editionWeek) {
    const { data, error } = await this.supabase
      .from('newsletter_weekly_runs')
      .select('id, status, emails_sent')
      .eq('edition_week', editionWeek)
      .eq('status', 'OK')
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to check existing weekly run: ${error.message}`);
    }
    return data || null;
  }

  async insertRun(payload) {
    const { data, error } = await this.supabase
      .from('newsletter_weekly_runs')
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      throw new Error(`Failed to insert weekly run: ${error.message}`);
    }
    return data;
  }

  async finishRun(runId, patch) {
    const { error } = await this.supabase
      .from('newsletter_weekly_runs')
      .update({
        ...patch,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (error) {
      console.error('Failed to finish weekly run:', error.message);
    }
  }

  /**
   * @param {{ dryRun?: boolean, canaryEmail?: string }} [options]
   */
  async processWeeklyNewsletter(options = {}) {
    const started = Date.now();
    const dryRun = !!options.dryRun;
    const canaryEmail = options.canaryEmail || process.env.NEWSLETTER_CANARY_EMAIL || null;

    const articles = await this.fetchWeeklyArticles(ARTICLE_LIMIT);
    if (!articles.length) {
      const weekMeta = this._emptyWeekMeta();
      const run = await this.insertRun({
        edition_week: weekMeta.edition_week,
        week_start: weekMeta.week_start,
        week_end: weekMeta.week_end,
        status: 'SKIPPED_NO_ARTICLES',
        selection_mode: null,
        article_ids: [],
        subscribers_considered: 0,
        emails_sent: 0,
        emails_failed: 0,
        duration_ms: Date.now() - started,
      });
      return {
        status: 'SKIPPED_NO_ARTICLES',
        runId: run.id,
        sent: 0,
        failed: 0,
        articles: 0,
      };
    }

    const editionWeek = articles[0].edition_week;
    const weekStart = articles[0].week_start;
    const weekEnd = articles[0].week_end;
    const selectionMode = articles[0].selection_mode;
    const articleIds = articles.map((a) => a.id);

    const existing = await this.findOkRun(editionWeek);
    if (existing) {
      const run = await this.insertRun({
        edition_week: editionWeek,
        week_start: weekStart,
        week_end: weekEnd,
        status: 'SKIPPED_DUPLICATE',
        selection_mode: selectionMode,
        article_ids: articleIds,
        subscribers_considered: 0,
        emails_sent: 0,
        emails_failed: 0,
        error_summary: `Already sent OK run ${existing.id}`,
        duration_ms: Date.now() - started,
      });
      return {
        status: 'SKIPPED_DUPLICATE',
        runId: run.id,
        sent: 0,
        failed: 0,
        articles: articles.length,
        selectionMode,
      };
    }

    let subscribers = await this.newsletterRepository.listSubscribed();
    if (canaryEmail) {
      subscribers = subscribers.filter(
        (s) => String(s.email).toLowerCase() === String(canaryEmail).toLowerCase()
      );
    }

    const run = await this.insertRun({
      edition_week: editionWeek,
      week_start: weekStart,
      week_end: weekEnd,
      status: 'RUNNING',
      selection_mode: selectionMode,
      article_ids: articleIds,
      subscribers_considered: subscribers.length,
    });

    if (!subscribers.length) {
      await this.finishRun(run.id, {
        status: 'SKIPPED_NO_SUBSCRIBERS',
        duration_ms: Date.now() - started,
      });
      return {
        status: 'SKIPPED_NO_SUBSCRIBERS',
        runId: run.id,
        sent: 0,
        failed: 0,
        articles: articles.length,
        selectionMode,
      };
    }

    // Validate template once (sample email) before any send
    const sampleHtml = buildWeeklyNewsletterHtml({
      articles,
      weekStart,
      weekEnd,
      locale: 'ro-RO',
      unsubscribeEmail: 'preview@example.com',
      baseUrl: this.baseUrl,
    });
    const validation = validateWeeklyNewsletterHtml(sampleHtml, articles);
    if (!validation.ok) {
      await this.finishRun(run.id, {
        status: 'FAILED',
        error_summary: `invalid_email_payload:${validation.reason}`,
        duration_ms: Date.now() - started,
      });
      if (this.adminAlertService) {
        await this.adminAlertService.sendAlert({
          alertKey: 'newsletter_weekly_invalid_template',
          subject: 'Template newsletter săptămânal invalid',
          body: `Validare eșuată: ${validation.reason}`,
        });
      }
      return {
        status: 'FAILED',
        runId: run.id,
        sent: 0,
        failed: 0,
        reason: validation.reason,
      };
    }

    const subjectRo = buildWeeklyNewsletterSubject({
      weekStart,
      weekEnd,
      locale: 'ro-RO',
      count: articles.length,
    });
    const subjectEn = buildWeeklyNewsletterSubject({
      weekStart,
      weekEnd,
      locale: 'en-US',
      count: articles.length,
    });

    if (dryRun) {
      await this.finishRun(run.id, {
        status: 'SKIPPED_DRY_RUN',
        emails_sent: 0,
        emails_failed: 0,
        error_summary: 'dry_run',
        duration_ms: Date.now() - started,
      });
      return {
        status: 'SKIPPED_DRY_RUN',
        dryRun: true,
        runId: run.id,
        sent: 0,
        failed: 0,
        articles: articles.length,
        subscribers: subscribers.length,
        selectionMode,
      };
    }

    if (!this.resendService) {
      await this.finishRun(run.id, {
        status: 'FAILED',
        error_summary: 'resend_not_configured',
        duration_ms: Date.now() - started,
      });
      throw new Error('ResendEmailService is required for weekly newsletter send');
    }

    let sent = 0;
    let failed = 0;
    let resendQuotaHit = false;
    let haltedReason = null;

    for (const subscriber of subscribers) {
      const locale = String(subscriber.locale || 'ro-RO');
      const isRo = locale.toLowerCase().startsWith('ro');
      const localeKey = isRo ? 'ro-RO' : 'en-US';
      const html = buildWeeklyNewsletterHtml({
        articles,
        weekStart,
        weekEnd,
        locale: localeKey,
        unsubscribeEmail: subscriber.email,
        baseUrl: this.baseUrl,
      });
      const text = buildWeeklyNewsletterText({
        articles,
        weekStart,
        weekEnd,
        unsubscribeEmail: subscriber.email,
        baseUrl: this.baseUrl,
      });

      try {
        await this.resendService.sendEmail({
          to: subscriber.email,
          subject: isRo ? subjectRo : subjectEn,
          html,
          text,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error(`Weekly newsletter send failed for ${subscriber.email}:`, error?.message || error);
        if (error instanceof ResendEmailError && (error.isQuota || error.isAuth)) {
          resendQuotaHit = !!error.isQuota;
          haltedReason = error.isQuota ? 'resend_quota' : 'resend_auth';
          break;
        }
      }
    }

    let status = 'OK';
    if (haltedReason) {
      status = sent > 0 ? 'PARTIAL' : 'FAILED';
    } else if (failed > 0 && sent > 0) {
      status = 'PARTIAL';
    } else if (failed > 0 && sent === 0) {
      status = 'FAILED';
    }

    await this.finishRun(run.id, {
      status,
      emails_sent: sent,
      emails_failed: failed,
      resend_quota_hit: resendQuotaHit,
      error_summary: haltedReason || (failed > 0 ? `${failed}_failed` : null),
      duration_ms: Date.now() - started,
    });

    if (haltedReason && this.adminAlertService) {
      await this.adminAlertService.sendAlert({
        alertKey: `newsletter_weekly_${haltedReason}`,
        subject: `Newsletter săptămânal oprit: ${haltedReason}`,
        body: `sent=${sent} failed=${failed} edition_week=${editionWeek}`,
      });
    }

    return {
      status,
      runId: run.id,
      sent,
      failed,
      articles: articles.length,
      subscribers: subscribers.length,
      selectionMode,
      haltedReason,
      weekStart,
      weekEnd,
      editionWeek,
    };
  }

  _emptyWeekMeta() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = formatter.format(new Date());
    const today = new Date(`${todayStr}T12:00:00Z`);
    const day = today.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(thisMonday.getUTCDate() - 7);
    const weekEnd = new Date(thisMonday);
    weekEnd.setUTCDate(thisMonday.getUTCDate() - 1);

    const toIso = (d) => d.toISOString().slice(0, 10);
    return {
      edition_week: toIso(weekStart),
      week_start: toIso(weekStart),
      week_end: toIso(weekEnd),
    };
  }
}

export default WeeklyNewsletterService;
