/**
 * Serviciu pentru gestionarea digest-urilor zilnice de email
 */

import { ResendEmailService, ResendEmailError } from './ResendEmailService.js';
import { AdminAlertService } from './AdminAlertService.js';
import {
  buildDigestHtml,
  buildDigestText,
  validateDigestEmailPayload,
} from './AlertDigestEmailBuilder.js';

const RO_TZ = 'Europe/Bucharest';
const SLOT_WINDOW_FALLBACK_MS = 3 * 60 * 60 * 1000;
const MAX_PRIMARY_ARTICLES = 25;

export class DailyDigestService {
  constructor(supabaseClient, emailTemplateService, newsletterRepository, options = {}) {
    this.supabase = supabaseClient;
    this.emailTemplateService = emailTemplateService;
    this.newsletterRepository = newsletterRepository;
    this.resendService = options.resendService || new ResendEmailService();
    this.adminAlertService = options.adminAlertService || new AdminAlertService(supabaseClient, this.resendService);
    this.stiriService = options.stiriService || null;
    this.baseUrl = options.baseUrl || process.env.WEB_BASE_URL || 'https://www.decodoruloficial.ro';
  }

  _bucharestDateParts(date = new Date()) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: RO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: RO_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    const slot = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

    return { day, slot };
  }

  _formatRoDate(date = new Date()) {
    return new Intl.DateTimeFormat('ro-RO', {
      timeZone: RO_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  _manageAlertsUrl() {
    return `${this.baseUrl.replace(/\/$/, '')}/alerte`;
  }

  _disableAllAlertsUrl() {
    return `${this.baseUrl.replace(/\/$/, '')}/alerte?action=disable-all`;
  }

  /**
   * Send a demo digest email so the user can verify delivery.
   * Rate-limited: max 1 per 10 minutes per user.
   */
  async sendTestAlertEmail(userId) {
    const { data: authUser, error: authError } = await this.supabase.auth.admin.getUserById(userId);
    if (authError || !authUser?.user?.email) {
      return { success: false, error: 'Nu am găsit adresa de email a contului.' };
    }

    const to = authUser.user.email;
    const userName =
      authUser.user.user_metadata?.full_name
      || authUser.user.user_metadata?.name
      || to.split('@')[0];

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await this.supabase
      .from('email_digest_logs')
      .select('id, sent_at')
      .eq('user_id', userId)
      .eq('slot', 'test')
      .gte('sent_at', tenMinAgo)
      .limit(1);

    if (recent?.length) {
      return {
        success: false,
        error: 'Poți trimite un email de test o dată la 10 minute. Încearcă din nou puțin mai târziu.',
        email: to,
      };
    }

    const currentDate = this._formatRoDate(new Date());
    const demoArticles = [
      {
        id: 'demo-1',
        title: 'Exemplu: modificare la un act pe care îl urmărești',
        excerpt: 'Acesta este un email de test. Când apar noutăți reale, le vei primi aici, în același format.',
        watchLabel: 'Act urmărit (exemplu)',
        link: `${this.baseUrl.replace(/\/$/, '')}/stiri`,
      },
    ];

    const manageUrl = this._manageAlertsUrl();
    const disableUrl = this._disableAllAlertsUrl();

    const html = buildDigestHtml({
      userName,
      currentDate,
      primaryArticles: demoArticles,
      categoryArticles: [],
      referenceArticles: [],
      similarArticles: [],
      manageAlertsUrl: manageUrl,
      disableAllAlertsUrl: disableUrl,
      baseUrl: this.baseUrl,
    });

    const text = buildDigestText({
      userName,
      currentDate,
      primaryArticles: demoArticles,
      categoryArticles: [],
      manageAlertsUrl: manageUrl,
      disableAllAlertsUrl: disableUrl,
      baseUrl: this.baseUrl,
    });

    const subject = `[Test] Rezumat alerte — ${currentDate}`;
    const validation = validateDigestEmailPayload({
      to,
      subject,
      html,
      articles: demoArticles,
    });

    if (!validation.ok) {
      return { success: false, error: `invalid_email_payload:${validation.reason}`, email: to };
    }

    try {
      const result = await this.resendService.sendEmail({ to, subject, html, text });
      const today = this._bucharestDateParts().day;
      await this.supabase.from('email_digest_logs').insert({
        user_id: userId,
        digest_date: today,
        slot: 'test',
        articles_sent_count: 1,
        primary_count: 1,
        reference_count: 0,
        status: 'SENT',
        resend_id: result.id,
        sent_at: new Date().toISOString(),
      });

      return { success: true, email: to, resendId: result.id };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Trimiterea a eșuat',
        email: to,
      };
    }
  }

  async _acquireSlotLock(slot, day) {
    const { data: running } = await this.supabase
      .from('email_slot_runs')
      .select('id, slot')
      .eq('status', 'RUNNING')
      .limit(1);

    if (running?.length) {
      return { acquired: false, reason: 'overlap', runningSlot: running[0].slot };
    }

    const { data, error } = await this.supabase
      .from('email_slot_runs')
      .insert({
        slot,
        run_day: day,
        status: 'RUNNING',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create slot run: ${error.message}`);
    }

    return { acquired: true, runId: data.id };
  }

  async _finishSlotRun(runId, patch) {
    await this.supabase
      .from('email_slot_runs')
      .update({
        ...patch,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  }

  async _getMatchWindow(day, slot) {
    const { data: lastOk } = await this.supabase
      .from('email_slot_runs')
      .select('finished_at')
      .eq('run_day', day)
      .eq('status', 'OK')
      .neq('slot', slot)
      .order('finished_at', { ascending: false })
      .limit(1);

    const until = new Date();
    let since;

    if (lastOk?.[0]?.finished_at) {
      since = new Date(lastOk[0].finished_at);
    } else {
      since = new Date(until.getTime() - SLOT_WINDOW_FALLBACK_MS);
    }

    return { since, until };
  }

  async _getDeliveredToday(userId, day) {
    const { data } = await this.supabase
      .from('email_article_deliveries')
      .select('stiri_id')
      .eq('user_id', userId)
      .eq('delivery_date', day);

    return new Set((data || []).map((r) => Number(r.stiri_id)));
  }

  async _getWatchHits(userId, since, until) {
    const { data, error } = await this.supabase.rpc('get_legislation_watch_hits', {
      p_user_id: userId,
      p_since: since.toISOString(),
      p_until: until.toISOString(),
    });

    if (error) {
      console.error(`Watch hits error for ${userId}:`, error.message);
      return [];
    }

    return (data || []).map((hit) => ({
      id: hit.stiri_id,
      title: hit.stiri_title,
      slug: hit.stiri_slug,
      link: `${this.baseUrl.replace(/\/$/, '')}/stiri/${hit.stiri_slug}`,
      excerpt: '',
      publishedAt: hit.publication_date
        ? new Date(hit.publication_date).toLocaleDateString('ro-RO', { timeZone: RO_TZ })
        : '',
      source: 'watch',
      watchLabel: hit.watch_label,
      relationshipType: hit.relationship_type,
      confidenceScore: hit.confidence_score,
    }));
  }

  async _getSearchHits(user, since, until) {
    if (!user.saved_searches?.length) return [];

    const articles = [];
    for (const search of user.saved_searches) {
      const searchArticles = await this.findArticlesForSearch(search, since, until);
      searchArticles.forEach((article) => {
        articles.push({ ...article, searchName: search.name, source: 'search' });
      });
    }

    return this.removeDuplicateArticles(articles);
  }

  async _getCategoryHits(user, since, until) {
    const settings = user.notification_settings || {};
    if (settings.category_email_enabled !== true) {
      return [];
    }

    const { data, error } = await this.supabase.rpc('get_category_digest_hits', {
      p_user_id: user.user_id,
      p_since: since.toISOString(),
      p_until: until.toISOString(),
    });

    if (error) {
      console.error(`Category hits error for ${user.user_id}:`, error.message);
      return [];
    }

    return (data || []).map((hit) => ({
      id: hit.stiri_id,
      title: hit.stiri_title,
      slug: hit.stiri_slug,
      link: `${this.baseUrl.replace(/\/$/, '')}/stiri/${hit.stiri_slug}`,
      excerpt: '',
      publishedAt: hit.publication_date
        ? new Date(hit.publication_date).toLocaleDateString('ro-RO', { timeZone: RO_TZ })
        : '',
      source: 'category',
      categoryLabel: hit.category,
    }));
  }

  _dedupeCategoryFromPrimary(categoryArticles, primaryArticles) {
    const primaryIds = new Set(primaryArticles.map((a) => Number(a.id)));
    return categoryArticles.filter((a) => !primaryIds.has(Number(a.id)));
  }

  _splitPrimaryAndReference(articles, deliveredSet) {
    const primary = [];
    const reference = [];
    const seen = new Set();

    for (const article of articles) {
      const id = Number(article.id);
      if (seen.has(id)) continue;
      seen.add(id);

      if (deliveredSet.has(id)) {
        reference.push(article);
      } else {
        primary.push(article);
      }
    }

    return { primary, reference };
  }

  async _findSimilarArticles(primaryArticles, excludeIds) {
    if (!primaryArticles.length) return [];

    const firstId = primaryArticles[0].id;
    const exclude = new Set([...excludeIds, ...primaryArticles.map((a) => Number(a.id))]);
    const similar = [];

    if (this.stiriService) {
      try {
        const related = await this.stiriService.getRelatedStories({
          storyId: String(firstId),
          limit: 5,
          minScore: 1.0,
        });
        for (const story of related || []) {
          if (!exclude.has(Number(story.id))) {
            similar.push({
              id: story.id,
              title: story.title,
              slug: story.slug,
              link: story.slug
                ? `${this.baseUrl.replace(/\/$/, '')}/stiri/${story.slug}`
                : `${this.baseUrl.replace(/\/$/, '')}/stiri/${story.id}`,
            });
          }
        }
        return similar.slice(0, 5);
      } catch (error) {
        console.error('Similar articles via stiriService failed:', error.message);
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: connections } = await this.supabase
      .from('legislative_connections')
      .select('source_document_id, target_document_id')
      .or(`source_document_id.eq.${firstId},target_document_id.eq.${firstId}`)
      .limit(20);

    const candidateIds = [];
    for (const conn of connections || []) {
      const otherId = Number(conn.source_document_id) === Number(firstId)
        ? conn.target_document_id
        : conn.source_document_id;
      if (otherId && !exclude.has(Number(otherId))) {
        candidateIds.push(otherId);
      }
    }

    if (!candidateIds.length) return [];

    const { data: stiri } = await this.supabase
      .from('stiri')
      .select('id, title, publication_date')
      .in('id', candidateIds.slice(0, 10))
      .gte('publication_date', thirtyDaysAgo)
      .order('publication_date', { ascending: false })
      .limit(5);

    for (const row of stiri || []) {
      similar.push({
        id: row.id,
        title: row.title,
        link: `${this.baseUrl.replace(/\/$/, '')}/stiri/${row.id}`,
      });
    }

    return similar.slice(0, 5);
  }

  async _insertDeliveries(userId, day, slot, articleIds) {
    if (!articleIds.length) return;

    const rows = articleIds.map((stiriId) => ({
      user_id: userId,
      stiri_id: stiriId,
      delivery_date: day,
      first_slot: slot,
      role: 'primary',
    }));

    const { error } = await this.supabase
      .from('email_article_deliveries')
      .upsert(rows, { onConflict: 'user_id,stiri_id,delivery_date', ignoreDuplicates: true });

    if (error) {
      console.error('email_article_deliveries insert failed:', error.message);
    }
  }

  async _createSlotDigestLog(userId, day, slot, counts, status, errorMessage, resendId, durationMs) {
    try {
      const logData = {
        user_id: userId,
        digest_date: day,
        slot,
        articles_sent_count: counts.primary || 0,
        primary_count: counts.primary || 0,
        reference_count: counts.reference || 0,
        status,
        error_message: errorMessage,
        resend_id: resendId || null,
        duration_ms: durationMs || null,
        sent_at: status === 'SENT' ? new Date().toISOString() : null,
      };

      await this.supabase
        .from('email_digest_logs')
        .insert(logData);
    } catch (error) {
      if (error?.code !== '23505') {
        console.error('Slot digest log failed:', error);
      }
    }
  }

  async _sendSlotDigestEmail(user, primaryArticles, categoryArticles, referenceArticles, similarArticles, digestDate) {
    const manageUrl = this._manageAlertsUrl();
    const disableUrl = this._disableAllAlertsUrl();
    const currentDate = this._formatRoDate(digestDate);
    const truncatedPrimary = primaryArticles.slice(0, MAX_PRIMARY_ARTICLES);
    const truncatedCategory = categoryArticles.slice(0, 10);

    const html = buildDigestHtml({
      userName: user.user_name,
      currentDate,
      primaryArticles: truncatedPrimary,
      categoryArticles: truncatedCategory,
      referenceArticles,
      similarArticles,
      manageAlertsUrl: manageUrl,
      disableAllAlertsUrl: disableUrl,
      baseUrl: this.baseUrl,
    });

    const text = buildDigestText({
      userName: user.user_name,
      currentDate,
      primaryArticles: truncatedPrimary,
      categoryArticles: truncatedCategory,
      referenceArticles,
      similarArticles,
      manageAlertsUrl: manageUrl,
      disableAllAlertsUrl: disableUrl,
      baseUrl: this.baseUrl,
    });

    const totalCount = truncatedPrimary.length + truncatedCategory.length;
    const subject = totalCount === 1
      ? `1 noutate legislativă — ${currentDate}`
      : `${totalCount} noutăți legislative — ${currentDate}`;

    // Canary override only when caller sets user_email to the canary address.
    // Never redirect all digests via DIGEST_CANARY_EMAIL env alone.
    const to = user.user_email;

    const validation = validateDigestEmailPayload({
      to,
      subject,
      html,
      articles: [...truncatedPrimary, ...truncatedCategory],
    });

    if (!validation.ok) {
      return { success: false, error: `invalid_email_payload:${validation.reason}` };
    }

    const result = await this.resendService.sendEmail({ to, subject, html, text });
    return { success: true, resendId: result.id, to };
  }

  /**
   * Procesează un slot de digest (L–V :55) cu dedup pe zi și skip dacă nu există noutăți.
   * @param {{ slot?: string, day?: string }} params
   */
  async processSlot({ slot, day } = {}) {
    const started = Date.now();
    const parts = this._bucharestDateParts();
    const runDay = day || parts.day;
    const runSlot = slot || parts.slot;

    console.log(`Starting digest slot ${runSlot} for ${runDay}`);

    const lock = await this._acquireSlotLock(runSlot, runDay);
    if (!lock.acquired) {
      await this.supabase.from('email_slot_runs').insert({
        slot: runSlot,
        run_day: runDay,
        status: 'SKIPPED_OVERLAP',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
      });
      return { status: 'SKIPPED_OVERLAP', slot: runSlot, day: runDay };
    }

    const results = {
      slot: runSlot,
      day: runDay,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      primaryArticlesSent: 0,
      haltedReason: null,
    };

    let canaryPassed = !process.env.DIGEST_CANARY_EMAIL;
    let templateHalt = false;

    try {
      const { data: users, error: usersError } = await this.supabase.rpc('get_users_with_active_digests');
      if (usersError) {
        throw new Error(`get_users_with_active_digests: ${usersError.message}`);
      }

      const { since, until } = await this._getMatchWindow(runDay, runSlot);

      if (!canaryPassed && users?.length) {
        const sampleUser = users[0];
        const sampleWatch = await this._getWatchHits(sampleUser.user_id, since, until);
        const sampleSearch = await this._getSearchHits(sampleUser, since, until);
        const sampleAll = this.removeDuplicateArticles([...sampleWatch, ...sampleSearch]).slice(0, 3);

        if (sampleAll.length) {
          const canaryResult = await this._sendSlotDigestEmail(
            { ...sampleUser, user_name: 'Canary', user_email: process.env.DIGEST_CANARY_EMAIL },
            sampleAll,
            [],
            [],
            [],
            new Date()
          );
          if (!canaryResult.success) {
            templateHalt = true;
            results.haltedReason = canaryResult.error;
            await this.adminAlertService.sendAlert({
              alertKey: `digest_canary_fail_${runDay}`,
              subject: `Digest canary invalid — slot ${runSlot}`,
              body: `Canary send failed: ${canaryResult.error}\nSlot: ${runSlot}\nDay: ${runDay}`,
            });
            await this._finishSlotRun(lock.runId, {
              status: 'FAILED',
              error_summary: canaryResult.error,
              duration_ms: Date.now() - started,
            });
            return results;
          }
        }
        canaryPassed = true;
      }

      for (const user of users || []) {
        if (results.haltedReason) break;

        results.processed++;
        const userStarted = Date.now();

        try {
          if (!user.user_email) {
            results.skipped++;
            await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: 0, reference: 0 }, 'SKIPPED', 'no_email', null, Date.now() - userStarted);
            continue;
          }

          const [watchHits, searchHits, categoryHitsRaw] = await Promise.all([
            this._getWatchHits(user.user_id, since, until),
            this._getSearchHits(user, since, until),
            this._getCategoryHits(user, since, until),
          ]);

          const allArticles = this.removeDuplicateArticles([...watchHits, ...searchHits]);
          const deliveredSet = await this._getDeliveredToday(user.user_id, runDay);
          const { primary, reference } = this._splitPrimaryAndReference(allArticles, deliveredSet);
          const categoryArticles = this._dedupeCategoryFromPrimary(
            this.removeDuplicateArticles(categoryHitsRaw),
            primary
          );

          if (!primary.length && !categoryArticles.length) {
            results.skipped++;
            await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: 0, reference: reference.length }, 'SKIPPED', 'no_new_articles', null, Date.now() - userStarted);
            continue;
          }

          const similar = await this._findSimilarArticles(primary.length ? primary : categoryArticles, [...deliveredSet]);

          const emailResult = await this._sendSlotDigestEmail(user, primary, categoryArticles, reference, similar, new Date());

          if (!emailResult.success) {
            if (String(emailResult.error).includes('invalid_email_payload') && results.sent === 0 && results.failed === 0) {
              templateHalt = true;
              results.haltedReason = emailResult.error;
              await this.adminAlertService.sendAlert({
                alertKey: `digest_template_invalid_${runDay}`,
                subject: `Template digest invalid — slot ${runSlot}`,
                body: emailResult.error,
              });
              break;
            }

            results.failed++;
            await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: primary.length, reference: reference.length }, 'FAILED', emailResult.error, null, Date.now() - userStarted);
            continue;
          }

          await this._insertDeliveries(user.user_id, runDay, runSlot, [
            ...primary.map((a) => Number(a.id)),
            ...categoryArticles.map((a) => Number(a.id)),
          ]);
          await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: primary.length + categoryArticles.length, reference: reference.length }, 'SENT', null, emailResult.resendId, Date.now() - userStarted);

          results.sent++;
          results.primaryArticlesSent += primary.length + categoryArticles.length;
        } catch (error) {
          if (error instanceof ResendEmailError && error.isQuota) {
            results.haltedReason = 'resend_quota';
            results.failed++;
            await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: 0, reference: 0 }, 'FAILED', 'resend_quota', null, Date.now() - userStarted);
            await this.adminAlertService.sendAlert({
              alertKey: `resend_quota_${runDay}`,
              subject: 'Cota Resend epuizată — digeste oprite',
              body: `Slot ${runSlot} on ${runDay} halted after 429.\nProcessed: ${results.processed}, sent: ${results.sent}`,
            });
            break;
          }

          if (error instanceof ResendEmailError && error.isAuth) {
            results.haltedReason = 'resend_auth';
            await this.adminAlertService.sendAlert({
              alertKey: `resend_auth_${runDay}`,
              subject: 'Resend auth failed',
              body: error.message,
            });
            break;
          }

          results.failed++;
          console.error(`Slot digest user ${user.user_id} failed:`, error);
          await this._createSlotDigestLog(user.user_id, runDay, runSlot, { primary: 0, reference: 0 }, 'FAILED', error.message, null, Date.now() - userStarted);
        }
      }

      const status = results.haltedReason
        ? (templateHalt ? 'FAILED' : 'PARTIAL')
        : 'OK';

      await this._finishSlotRun(lock.runId, {
        status,
        users_considered: results.processed,
        users_sent: results.sent,
        users_skipped: results.skipped,
        users_failed: results.failed,
        primary_articles_sent: results.primaryArticlesSent,
        resend_quota_hit: results.haltedReason === 'resend_quota',
        error_summary: results.haltedReason,
        duration_ms: Date.now() - started,
      });

      if (results.failed > 0 || results.haltedReason) {
        await this.adminAlertService.sendAlert({
          alertKey: `digest_slot_summary_${runDay}_${runSlot}`,
          subject: `Digest slot ${runSlot} — ${status}`,
          body: JSON.stringify(results, null, 2),
        });
      }

      return results;
    } catch (error) {
      await this._finishSlotRun(lock.runId, {
        status: 'FAILED',
        error_summary: error.message,
        duration_ms: Date.now() - started,
      });
      await this.adminAlertService.sendAlert({
        alertKey: `digest_slot_crash_${runDay}_${runSlot}`,
        subject: `Digest slot ${runSlot} crashed`,
        body: error.message,
      });
      throw error;
    }
  }

  /**
   * Ops summary for admin dashboard.
   */
  async getEmailOpsSummary() {
    const { data: todayRows } = await this.supabase
      .from('v_email_ops_today')
      .select('*')
      .limit(1);

    const { data: recentSlots } = await this.supabase
      .from('email_slot_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    const today = todayRows?.[0] || {};

    return {
      today: {
        runDay: today.run_day,
        slotsOk: today.slots_ok ?? 0,
        slotsFailed: today.slots_failed ?? 0,
        slotsOverlap: today.slots_overlap ?? 0,
        emailsSent: today.emails_sent ?? 0,
        usersSkipped: today.users_skipped ?? 0,
        usersFailed: today.users_failed ?? 0,
        primaryArticles: today.primary_articles ?? 0,
        quotaHit: today.quota_hit ?? false,
        durationP50Ms: today.duration_p50_ms,
        durationP95Ms: today.duration_p95_ms,
      },
      recentSlots: (recentSlots || []).map((row) => ({
        id: row.id,
        slot: row.slot,
        runDay: row.run_day,
        status: row.status,
        usersSent: row.users_sent ?? 0,
        usersSkipped: row.users_skipped ?? 0,
        usersFailed: row.users_failed ?? 0,
        primaryArticlesSent: row.primary_articles_sent ?? 0,
        resendQuotaHit: row.resend_quota_hit ?? false,
        errorSummary: row.error_summary,
        durationMs: row.duration_ms,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
    };
  }

  /**
   * Procesează digest-ul zilnic pentru toți utilizatorii cu notificări active
   * @param {Date} digestDate - Data pentru care se procesează digest-ul (implicit azi)
   * @returns {Promise<Object>} Rezultatul procesării
   */
  async processDailyDigest(digestDate = new Date()) {
    try {
      console.log(`Starting daily digest processing for ${digestDate.toISOString().split('T')[0]}`);

      // Obține toți utilizatorii cu notificări active
      let users = [];
      try {
        const { data: usersData, error: usersError } = await this.supabase.rpc('get_users_with_active_email_notifications');

        if (usersError) {
          // If the function returns a structure mismatch error, it might be because tables don't exist yet
          if (usersError.message.includes('structure of query does not match function result type')) {
            console.log('Database tables may not exist yet. Please run the migrations first.');
            return {
              processed: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              error: 'Database tables not found - please run migrations'
            };
          }
          throw new Error(`Error fetching users with active notifications: ${usersError.message}`);
        }

        users = usersData || [];
      } catch (error) {
        console.log('Error accessing users function:', error.message);
        return {
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          error: error.message
        };
      }

      if (!users || users.length === 0) {
        console.log('No users with active email notifications found');
        return {
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: 0
        };
      }

      console.log(`Found ${users.length} users with active email notifications`);

      const results = {
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0
      };

      // Procesează fiecare utilizator
      for (const user of users) {
        try {
          results.processed++;
          const userResult = await this.processUserDigest(user, digestDate);
          
          if (userResult.status === 'sent') {
            results.sent++;
          } else if (userResult.status === 'failed') {
            results.failed++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          console.error(`Error processing digest for user ${user.user_id}:`, error);
          results.failed++;
        }
      }

      console.log('Daily digest processing completed:', results);
      return results;

    } catch (error) {
      console.error('Error in processDailyDigest:', error);
      throw error;
    }
  }

  /**
   * Procesează digest-ul pentru un utilizator specific
   * @param {Object} user - Datele utilizatorului
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Object>} Rezultatul procesării
   */
  async processUserDigest(user, digestDate) {
    try {
      const dateStr = digestDate.toISOString().split('T')[0];

      // Verifică dacă digest-ul a fost deja procesat pentru această dată
      const { data: existingLog } = await this.supabase
        .from('email_digest_logs')
        .select('id, status')
        .eq('user_id', user.user_id)
        .eq('digest_date', dateStr)
        .single();

      if (existingLog) {
        console.log(`Digest already processed for user ${user.user_id} on ${dateStr} with status: ${existingLog.status}`);
        return { status: 'skipped', reason: 'already_processed' };
      }

      // Găsește articole noi pentru căutările salvate ale utilizatorului
      const articles = await this.findNewArticlesForUser(user, digestDate);

      if (articles.length === 0) {
        console.log(`No new articles found for user ${user.user_id} on ${dateStr}`);
        
        // Creează log pentru "no articles"
        await this.createDigestLog(user.user_id, dateStr, 0, [], 'SKIPPED', null);
        return { status: 'skipped', reason: 'no_articles' };
      }

      // Generează și trimite email-ul
      const emailResult = await this.sendDigestEmail(user, articles, digestDate);

      if (emailResult.success) {
        // Creează log pentru email trimis cu succes
        const searchIds = user.saved_searches.map(search => search.id);
        await this.createDigestLog(
          user.user_id, 
          dateStr, 
          articles.length, 
          searchIds, 
          'SENT', 
          null
        );
        
        console.log(`Digest email sent successfully to user ${user.user_id} with ${articles.length} articles`);
        return { status: 'sent', articlesCount: articles.length };
      } else {
        // Creează log pentru email eșuat
        await this.createDigestLog(
          user.user_id, 
          dateStr, 
          articles.length, 
          [], 
          'FAILED', 
          emailResult.error
        );
        
        console.error(`Failed to send digest email to user ${user.user_id}:`, emailResult.error);
        return { status: 'failed', error: emailResult.error };
      }

    } catch (error) {
      console.error(`Error processing user digest for ${user.user_id}:`, error);
      throw error;
    }
  }

  /**
   * Găsește articole noi pentru căutările salvate ale unui utilizator
   * @param {Object} user - Datele utilizatorului
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Array>} Lista de articole noi
   */
  async findNewArticlesForUser(user, digestDate) {
    try {
      const startDate = new Date(digestDate);
      startDate.setDate(startDate.getDate() - 1); // Ultimele 24 de ore
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(digestDate);
      endDate.setHours(23, 59, 59, 999);

      const allArticles = [];

      // Procesează fiecare căutare salvată
      for (const search of user.saved_searches) {
        try {
          const searchArticles = await this.findArticlesForSearch(search, startDate, endDate);
          
          // Adaugă numele căutării la fiecare articol
          const articlesWithSearchName = searchArticles.map(article => ({
            ...article,
            searchName: search.name
          }));

          allArticles.push(...articlesWithSearchName);
        } catch (error) {
          console.error(`Error finding articles for search ${search.id}:`, error);
          // Continuă cu următoarea căutare
        }
      }

      // Elimină duplicatele (același articol poate să se potrivească cu mai multe căutări)
      const uniqueArticles = this.removeDuplicateArticles(allArticles);

      return uniqueArticles;

    } catch (error) {
      console.error('Error finding new articles for user:', error);
      return [];
    }
  }

  /**
   * Găsește articole pentru o căutare specifică
   * @param {Object} search - Căutarea salvată
   * @param {Date} startDate - Data de început
   * @param {Date} endDate - Data de sfârșit
   * @returns {Promise<Array>} Lista de articole
   */
  async findArticlesForSearch(search, startDate, endDate) {
    try {
      const { data: articles, error } = await this.supabase
        .from('stiri')
        .select(`
          id,
          title,
          content,
          link,
          published_at,
          source,
          category,
          tags
        `)
        .gte('published_at', startDate.toISOString())
        .lte('published_at', endDate.toISOString())
        .order('published_at', { ascending: false })
        .limit(50); // Limitează pentru performanță

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!articles || articles.length === 0) {
        return [];
      }

      // Aplică filtrele de căutare (simplificat - poate fi extins)
      const filteredArticles = this.applySearchFilters(articles, search.search_params);

      // Formatează articolele pentru email
      return filteredArticles.map(article => ({
        id: article.id,
        title: article.title,
        link: article.link || `https://monitoruloficial.ro/stiri/${article.id}`,
        excerpt: this.generateExcerpt(article.content),
        publishedAt: new Date(article.published_at).toLocaleDateString('ro-RO'),
        source: article.source,
        category: article.category
      }));

    } catch (error) {
      console.error('Error finding articles for search:', error);
      return [];
    }
  }

  /**
   * Aplică filtrele de căutare la articole
   * @param {Array} articles - Lista de articole
   * @param {Object} searchParams - Parametrii de căutare
   * @returns {Array} Articolele filtrate
   */
  applySearchFilters(articles, searchParams) {
    if (!searchParams || typeof searchParams !== 'object') {
      return articles;
    }

    return articles.filter(article => {
      // Filtru după cuvinte cheie
      if (searchParams.keywords && searchParams.keywords.length > 0) {
        const keywords = searchParams.keywords.toLowerCase();
        const titleMatch = article.title.toLowerCase().includes(keywords);
        const contentMatch = article.content.toLowerCase().includes(keywords);
        
        if (!titleMatch && !contentMatch) {
          return false;
        }
      }

      // Filtru după categorie
      if (searchParams.category && searchParams.category !== 'all') {
        if (article.category !== searchParams.category) {
          return false;
        }
      }

      // Filtru după sursă
      if (searchParams.source && searchParams.source !== 'all') {
        if (article.source !== searchParams.source) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Generează un excerpt din conținutul articolului
   * @param {string} content - Conținutul articolului
   * @param {number} maxLength - Lungimea maximă (implicit 200)
   * @returns {string} Excerpt-ul generat
   */
  generateExcerpt(content, maxLength = 200) {
    if (!content) return '';
    
    // Elimină HTML tags
    const textContent = content.replace(/<[^>]*>/g, '');
    
    if (textContent.length <= maxLength) {
      return textContent;
    }
    
    return textContent.substring(0, maxLength).trim() + '...';
  }

  /**
   * Elimină articolele duplicate
   * @param {Array} articles - Lista de articole
   * @returns {Array} Articolele unice
   */
  removeDuplicateArticles(articles) {
    const seen = new Set();
    return articles.filter(article => {
      if (seen.has(article.id)) {
        return false;
      }
      seen.add(article.id);
      return true;
    });
  }

  /**
   * Trimite email-ul de digest
   * @param {Object} user - Datele utilizatorului
   * @param {Array} articles - Lista de articole
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Object>} Rezultatul trimiterii
   */
  async sendDigestEmail(user, articles, digestDate) {
    try {
      // Obține template-ul de digest
      const template = await this.emailTemplateService.getTemplateByName('daily_article_digest');
      
      if (!template) {
        throw new Error('Daily digest template not found');
      }

      // Pregătește variabilele pentru template
      const variables = {
        userName: user.user_name,
        currentDate: digestDate.toLocaleDateString('ro-RO'),
        totalArticleCount: articles.length,
        articleList: articles
      };

      // Procesează template-ul
      const processedTemplate = await this.emailTemplateService.processTemplate('daily_article_digest', variables);

      // Trimite email-ul
      const emailData = {
        to: user.user_email,
        subject: processedTemplate.subject,
        html: processedTemplate.bodyHtml,
        templateId: template.id
      };

      const result = await this.newsletterRepository.sendEmail(emailData);

      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error('Error sending digest email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Creează un log pentru digest-ul procesat
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} digestDate - Data digest-ului
   * @param {number} articlesCount - Numărul de articole
   * @param {Array} searchIds - ID-urile căutărilor
   * @param {string} status - Statusul digest-ului
   * @param {string} errorMessage - Mesajul de eroare (dacă există)
   */
  async createDigestLog(userId, digestDate, articlesCount, searchIds, status, errorMessage) {
    try {
      // Obține template-ul pentru a lua ID-ul
      const template = await this.emailTemplateService.getTemplateByName('daily_article_digest');
      
      const logData = {
        user_id: userId,
        digest_date: digestDate,
        articles_sent_count: articlesCount,
        saved_searches_triggered: searchIds,
        template_id: template?.id,
        status: status,
        error_message: errorMessage,
        sent_at: status === 'SENT' ? new Date().toISOString() : null
      };

      await this.supabase
        .from('email_digest_logs')
        .insert(logData);

    } catch (error) {
      console.error('Error creating digest log:', error);
      // Nu aruncăm eroarea aici pentru a nu întrerupe procesul principal
    }
  }

  /**
   * Obține statisticile digest-urilor pentru o perioadă
   * @param {Date} startDate - Data de început
   * @param {Date} endDate - Data de sfârșit
   * @returns {Promise<Object>} Statisticile
   */
  async getDigestStats(startDate, endDate) {
    try {
      const { data: stats, error } = await this.supabase
        .from('email_digest_logs')
        .select('status, articles_sent_count')
        .gte('digest_date', startDate.toISOString().split('T')[0])
        .lte('digest_date', endDate.toISOString().split('T')[0]);

      if (error) {
        throw new Error(`Error fetching digest stats: ${error.message}`);
      }

      const result = {
        total: stats.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        totalArticles: 0
      };

      stats.forEach(stat => {
        result[stat.status.toLowerCase()]++;
        result.totalArticles += stat.articles_sent_count || 0;
      });

      return result;

    } catch (error) {
      console.error('Error getting digest stats:', error);
      throw error;
    }
  }
}

export default DailyDigestService;
