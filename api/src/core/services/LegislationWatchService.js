/**
 * Business logic for legislation watches and alert preferences.
 */

import { GraphQLError } from 'graphql';

const INTENSITY_TO_DB = {
  IMPORTANT: 'important',
  CRITICAL: 'critical',
  MENTIONS: 'mentions',
};

const TARGET_TYPE_TO_DB = {
  STIRI: 'stiri',
  EXTERNAL: 'external',
  NORMALIZED_REF: 'normalized_ref',
};

const INTENSITY_FILTERS = {
  important: ['modifică', 'completează', 'abrogă', 'derogă', 'suspendă'],
  critical: ['modifică', 'abrogă'],
  mentions: ['modifică', 'completează', 'abrogă', 'derogă', 'suspendă', 'face referire la'],
};

const TARGET_TYPE_TO_GRAPHQL = {
  stiri: 'STIRI',
  external: 'EXTERNAL',
  normalized_ref: 'NORMALIZED_REF',
};

function toGraphQLWatch(row) {
  if (!row) return null;
  const dbTarget = row.targetType || row.target_type;
  const intensity = String(row.alertIntensity || row.alert_intensity || 'important').toUpperCase();

  return {
    id: row.id,
    label: row.label,
    targetType: TARGET_TYPE_TO_GRAPHQL[dbTarget] || 'NORMALIZED_REF',
    targetStiriId: row.targetStiriId ?? (row.target_stiri_id != null ? String(row.target_stiri_id) : null),
    targetExternalId: row.targetExternalId ?? (row.target_external_id != null ? String(row.target_external_id) : null),
    normalizedKey: row.normalizedKey ?? row.normalized_key,
    normalizedIdentifier: row.normalizedIdentifier ?? row.normalized_identifier ?? {},
    alertIntensity: ['IMPORTANT', 'CRITICAL', 'MENTIONS'].includes(intensity) ? intensity : 'IMPORTANT',
    relationFilters: row.relationFilters ?? row.relation_filters ?? INTENSITY_FILTERS.important,
    emailEnabled: row.emailEnabled ?? row.email_enabled ?? false,
    instantEnabled: row.instantEnabled ?? row.instant_enabled ?? false,
    minConfidence: row.minConfidence ?? row.min_confidence ?? 0.55,
    sourcePackId: row.sourcePackId ?? row.source_pack_id ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

export class LegislationWatchService {
  constructor(legislationWatchRepository, supabaseClient) {
    this.repository = legislationWatchRepository;
    this.supabase = supabaseClient;
  }

  async hasPaidSubscription(userId) {
    const { data, error } = await this.supabase.rpc('user_has_paid_subscription', {
      p_user_id: userId,
    });
    if (error) {
      console.error('user_has_paid_subscription error:', error.message);
      return false;
    }
    return data === true;
  }

  _requirePaid(message = 'Această funcționalitate necesită un abonament Pro activ') {
    throw new GraphQLError(message, {
      extensions: { code: 'SUBSCRIPTION_REQUIRED' },
    });
  }

  _requireLimit(canProceed, message) {
    if (!canProceed) {
      throw new GraphQLError(message, {
        extensions: { code: 'LIMIT_REACHED' },
      });
    }
  }

  async list(userId) {
    const rows = await this.repository.listByUser(userId);
    return rows.map(toGraphQLWatch);
  }

  async getLimitInfo(userId) {
    const [
      watchLimit,
      watchCount,
      emailLimit,
      emailCount,
    ] = await Promise.all([
      this.supabase.rpc('get_user_legislation_watch_limit', { p_user_id: userId }),
      this.supabase.rpc('get_user_legislation_watch_count', { p_user_id: userId }),
      this.supabase.rpc('get_user_watch_email_limit', { p_user_id: userId }),
      this.supabase.rpc('get_user_watch_email_count', { p_user_id: userId }),
    ]);

    const limit = watchLimit.data ?? 0;
    const count = watchCount.data ?? 0;
    const eLimit = emailLimit.data ?? 0;
    const eCount = emailCount.data ?? 0;

    const watchPct = limit > 0 ? count / limit : 0;
    const emailPct = eLimit > 0 ? eCount / eLimit : 0;

    return {
      watchLimit: limit,
      watchCount: count,
      canAddMore: count < limit,
      emailLimit: eLimit,
      emailCount: eCount,
      canEnableMoreEmail: eCount < eLimit,
      showLimitWarning: watchPct >= 0.9 || emailPct >= 0.9,
    };
  }

  async _normalizeIdentifier(identifierText) {
    const { data, error } = await this.supabase.rpc('normalize_legislative_identifier', {
      p_text: identifierText,
    });
    if (error) {
      throw new GraphQLError(`Nu am putut normaliza identificatorul: ${error.message}`, {
        extensions: { code: 'INVALID_IDENTIFIER' },
      });
    }
    return data || {};
  }

  async _normalizedKey(identifierJson) {
    const { data, error } = await this.supabase.rpc('legislation_normalized_key', {
      p_id: identifierJson,
    });
    if (error || !data) {
      throw new GraphQLError('Identificatorul legislativ nu este valid', {
        extensions: { code: 'INVALID_IDENTIFIER' },
      });
    }
    return data;
  }

  async _resolveTarget(normalizedIdentifier, normalizedKey) {
    const identifierText = [
      normalizedIdentifier?.type,
      normalizedIdentifier?.number,
      normalizedIdentifier?.year,
    ].filter(Boolean).join(' ');

    if (identifierText) {
      const { data: resolved } = await this.supabase.rpc('resolve_legislative_identifier', {
        p_text: identifierText,
      });
      if (resolved?.length && resolved[0]?.document_id) {
        return {
          targetType: 'stiri',
          targetStiriId: resolved[0].document_id,
          targetExternalId: null,
        };
      }
    }

    const { data: external } = await this.supabase
      .from('external_legislative_documents')
      .select('id')
      .eq('normalized_identifier', normalizedIdentifier)
      .limit(1)
      .maybeSingle();

    if (external?.id) {
      return {
        targetType: 'external',
        targetStiriId: null,
        targetExternalId: external.id,
      };
    }

    const type = normalizedIdentifier?.type;
    const number = normalizedIdentifier?.number;
    const year = normalizedIdentifier?.year;
    if (type && number && year) {
      const { data: stiriMatch } = await this.supabase
        .from('stiri')
        .select('id')
        .ilike('title', `%${type}%${number}%${year}%`)
        .order('publication_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (stiriMatch?.id) {
        return {
          targetType: 'stiri',
          targetStiriId: stiriMatch.id,
          targetExternalId: null,
        };
      }
    }

    return {
      targetType: 'normalized_ref',
      targetStiriId: null,
      targetExternalId: null,
    };
  }

  async _getMasterDigestEnabled(userId) {
    const { data } = await this.supabase
      .from('user_preferences')
      .select('notification_settings')
      .eq('id', userId)
      .maybeSingle();

    const settings = data?.notification_settings || {};
    return settings.digest_email_enabled !== false;
  }

  async add(userId, input) {
    const canAdd = await this.supabase.rpc('check_legislation_watch_limit', { p_user_id: userId });
    this._requireLimit(canAdd.data === true, 'Ai atins limita de acte urmărite pentru abonamentul tău');

    const intensityDb = INTENSITY_TO_DB[input.alertIntensity] || 'important';

    let normalizedIdentifier = {};
    let normalizedKey;
    let targetType;
    let targetStiriId = null;
    let targetExternalId = null;

    if (input.targetType === 'STIRI' && input.targetStiriId) {
      targetType = 'stiri';
      targetStiriId = Number(input.targetStiriId);
      const { data: stire } = await this.supabase
        .from('stiri')
        .select('title')
        .eq('id', targetStiriId)
        .maybeSingle();

      if (!stire) {
        throw new GraphQLError('Știrea nu a fost găsită', { extensions: { code: 'NOT_FOUND' } });
      }

      normalizedIdentifier = await this._normalizeIdentifier(stire.title);
      normalizedKey = await this._normalizedKey(normalizedIdentifier);
    } else if (input.targetType === 'EXTERNAL' && input.targetExternalId) {
      targetType = 'external';
      targetExternalId = Number(input.targetExternalId);
      const { data: ext } = await this.supabase
        .from('external_legislative_documents')
        .select('normalized_identifier, identifier')
        .eq('id', targetExternalId)
        .maybeSingle();

      if (!ext) {
        throw new GraphQLError('Documentul extern nu a fost găsit', { extensions: { code: 'NOT_FOUND' } });
      }

      normalizedIdentifier = ext.normalized_identifier || await this._normalizeIdentifier(ext.identifier);
      normalizedKey = await this._normalizedKey(normalizedIdentifier);
    } else if (input.identifierText) {
      normalizedIdentifier = await this._normalizeIdentifier(input.identifierText);
      normalizedKey = await this._normalizedKey(normalizedIdentifier);
      const resolved = await this._resolveTarget(normalizedIdentifier, normalizedKey);
      targetType = resolved.targetType;
      targetStiriId = resolved.targetStiriId;
      targetExternalId = resolved.targetExternalId;
    } else {
      throw new GraphQLError('Specificați un act de urmărit', {
        extensions: { code: 'INVALID_INPUT' },
      });
    }

    let emailEnabled = input.emailEnabled ?? false;
    const canEmailLimit = await this.supabase.rpc('check_watch_email_limit', { p_user_id: userId });
    if (input.emailEnabled === undefined) {
      const masterOn = await this._getMasterDigestEnabled(userId);
      emailEnabled = masterOn && canEmailLimit.data === true;
    } else if (emailEnabled && canEmailLimit.data !== true) {
      this._requireLimit(false, 'Ai atins limita de alerte email pentru acte urmărite');
    }

    const row = await this.repository.create({
      user_id: userId,
      label: input.label,
      target_type: targetType,
      target_stiri_id: targetStiriId,
      target_external_id: targetExternalId,
      normalized_key: normalizedKey,
      normalized_identifier: normalizedIdentifier,
      alert_intensity: intensityDb,
      relation_filters: INTENSITY_FILTERS[intensityDb] || INTENSITY_FILTERS.important,
      email_enabled: emailEnabled,
      instant_enabled: false,
      min_confidence: 0.55,
      source_pack_id: input.sourcePackId || null,
    });

    return toGraphQLWatch(row);
  }

  async update(userId, watchId, { alertIntensity, label }) {
    const patch = {};
    if (label != null) patch.label = label;
    if (alertIntensity != null) {
      const intensityDb = INTENSITY_TO_DB[alertIntensity];
      if (!intensityDb) {
        throw new GraphQLError('Intensitate invalidă', { extensions: { code: 'INVALID_INPUT' } });
      }
      patch.alert_intensity = intensityDb;
      patch.relation_filters = INTENSITY_FILTERS[intensityDb];
    }

    const updated = await this.repository.update(watchId, userId, patch);
    return toGraphQLWatch(updated);
  }

  async remove(userId, watchId) {
    return this.repository.delete(watchId, userId);
  }

  async toggleEmail(userId, watchId, enabled) {
    if (enabled) {
      const canEmail = await this.supabase.rpc('check_watch_email_limit', { p_user_id: userId });
      this._requireLimit(canEmail.data === true, 'Ai atins limita de alerte email pentru acte urmărite');
    }

    const updated = await this.repository.update(watchId, userId, { email_enabled: enabled });
    return toGraphQLWatch(updated);
  }

  async toggleInstant(userId, watchId, enabled) {
    if (enabled) {
      // Auto-enable master so user can turn Instant on per-act without a prior hub step
      await this.updateAlertMasterSettings(userId, { instantMasterEnabled: true });
    }

    const updated = await this.repository.update(watchId, userId, { instant_enabled: enabled });
    return toGraphQLWatch(updated);
  }

  async bulkSetWatchEmail(userId, enabled) {
    if (enabled) {
      const canEmail = await this.supabase.rpc('check_watch_email_limit', { p_user_id: userId });
      // Soft: enable as many as limit allows via repository bulk; still check that limit > 0
      if (canEmail.data !== true) {
        const info = await this.getLimitInfo(userId);
        if (info.emailLimit <= 0) {
          this._requireLimit(false, 'Alertele email nu sunt disponibile pe abonamentul tău actual');
        }
      }
    }

    return this.repository.bulkSetEmail(userId, enabled);
  }

  async updateAlertMasterSettings(userId, settings) {
    const { data: current } = await this.supabase
      .from('user_preferences')
      .select('notification_settings, preferred_categories')
      .eq('id', userId)
      .maybeSingle();

    const merged = {
      ...(current?.notification_settings || {}),
    };

    if (settings.digestEmailEnabled !== undefined && settings.digestEmailEnabled !== null) {
      merged.digest_email_enabled = settings.digestEmailEnabled;
    }
    if (settings.instantMasterEnabled !== undefined && settings.instantMasterEnabled !== null) {
      merged.instant_master_enabled = settings.instantMasterEnabled;
    }
    if (settings.categoryEmailEnabled !== undefined && settings.categoryEmailEnabled !== null) {
      merged.category_email_enabled = settings.categoryEmailEnabled;
    }

    const { data, error } = await this.supabase
      .from('user_preferences')
      .upsert({
        id: userId,
        preferred_categories: current?.preferred_categories || [],
        notification_settings: merged,
      }, { onConflict: 'id' })
      .select('notification_settings')
      .single();

    if (error) {
      throw new GraphQLError(`Eroare la actualizarea setărilor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return data.notification_settings;
  }

  async disableAllEmailAlerts(userId) {
    await this.updateAlertMasterSettings(userId, {
      digestEmailEnabled: false,
      instantMasterEnabled: false,
      categoryEmailEnabled: false,
    });

    await this.repository.disableAllEmailAndInstant(userId);

    await this.supabase
      .from('saved_searches')
      .update({ email_notifications_enabled: false })
      .eq('user_id', userId);

    try {
      await this.supabase.from('alert_preference_audit').insert({
        user_id: userId,
        action: 'disable_all_email',
      });
    } catch (error) {
      console.error('alert_preference_audit insert failed:', error);
    }

    return true;
  }

  /**
   * Compute next weekday digest slot (L–V :55) in Europe/Bucharest.
   */
  _nextDigestSlot() {
    const SLOTS = ['07:55', '09:55', '11:55', '13:55', '15:55', '17:55', '19:55', '21:55'];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
      const candidate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Bucharest',
        weekday: 'short',
      }).format(candidate);
      if (weekday === 'Sat' || weekday === 'Sun') continue;

      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Bucharest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(candidate);

      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Bucharest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const nowHour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
      const nowMinute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
      const nowMinutes = nowHour * 60 + nowMinute;

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Bucharest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);

      for (const slot of SLOTS) {
        const [h, m] = slot.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        if (day === today && slotMinutes <= nowMinutes) continue;
        return { day, slot, label: `${day === today ? 'azi' : day} la ${slot}` };
      }
    }

    return { day: null, slot: null, label: null };
  }

  async getAlertStatus(userId) {
    const paid = await this.hasPaidSubscription(userId);

    const { data: prefs } = await this.supabase
      .from('user_preferences')
      .select('notification_settings, preferred_categories, profession_pack_id')
      .eq('id', userId)
      .maybeSingle();

    const settings = prefs?.notification_settings || {};
    const digestEnabled = settings.digest_email_enabled !== false;
    const instantMasterEnabled = settings.instant_master_enabled === true;
    const categoryEmailEnabled = settings.category_email_enabled === true;
    const preferredCategories = Array.isArray(prefs?.preferred_categories)
      ? prefs.preferred_categories
      : [];

    const watches = await this.repository.listByUser(userId);
    const { data: searches } = await this.supabase
      .from('saved_searches')
      .select('id, name, email_notifications_enabled, source_pack_id')
      .eq('user_id', userId);

    const searchRows = searches || [];
    const watchEmailOn = watches.filter((w) => w.emailEnabled).length;
    const watchInstantOn = watches.filter((w) => w.instantEnabled).length;
    const searchEmailOn = searchRows.filter((s) => s.email_notifications_enabled).length;
    const categoryOn = categoryEmailEnabled && preferredCategories.length > 0 ? 1 : 0;

    const totalItems = watches.length + searchRows.length + (preferredCategories.length > 0 ? 1 : 0);
    const activeDelivery =
      watchEmailOn + watchInstantOn + searchEmailOn + (categoryEmailEnabled ? categoryOn : 0);

    const { data: authUser } = await this.supabase.auth.admin.getUserById(userId);
    const emailConfirmed = !!authUser?.user?.email_confirmed_at;
    const userEmail = authUser?.user?.email || null;

    let blockedReason = 'OK';
    let status = 'ACTIVE';

    if (!emailConfirmed) {
      blockedReason = 'EMAIL_UNCONFIRMED';
      status = 'BLOCKED';
    } else if (!paid) {
      blockedReason = 'NEEDS_SUBSCRIPTION';
      status = totalItems > 0 ? 'CONFIGURING' : 'NEEDS_PRO';
    } else if (!digestEnabled && watchInstantOn === 0) {
      blockedReason = 'MASTER_OFF';
      status = 'OFF';
    } else if (totalItems === 0) {
      blockedReason = 'NO_ITEMS';
      status = 'CONFIGURING';
    } else if (activeDelivery === 0) {
      blockedReason = 'ALL_MUTED';
      status = 'OFF';
    }

    const nextSlot = this._nextDigestSlot();

    const { data: lastDigest } = await this.supabase
      .from('email_digest_logs')
      .select('digest_date, slot, articles_sent_count, primary_count, sent_at, status')
      .eq('user_id', userId)
      .eq('status', 'SENT')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: historyDigests } = await this.supabase
      .from('email_digest_logs')
      .select('id, digest_date, slot, articles_sent_count, primary_count, sent_at, status')
      .eq('user_id', userId)
      .eq('status', 'SENT')
      .order('sent_at', { ascending: false })
      .limit(10);

    const { data: historyInstant } = await this.supabase
      .from('user_notifications')
      .select('id, title, body, href, created_at, type')
      .eq('user_id', userId)
      .eq('type', 'instant_watch_alert')
      .order('created_at', { ascending: false })
      .limit(10);

    const packIds = [
      ...new Set([
        prefs?.profession_pack_id,
        ...watches.map((w) => w.sourcePackId).filter(Boolean),
        ...searchRows.map((s) => s.source_pack_id).filter(Boolean),
      ].filter(Boolean)),
    ];

    let packsById = {};
    if (packIds.length) {
      const { data: packs } = await this.supabase
        .from('profession_packs')
        .select('id, name_ro')
        .in('id', packIds);
      packsById = Object.fromEntries((packs || []).map((p) => [p.id, p.name_ro]));
    }

    return {
      status,
      blockedReason,
      canReceive: paid && blockedReason === 'OK',
      canConfigure: true,
      digestEmailEnabled: digestEnabled,
      instantMasterEnabled,
      categoryEmailEnabled,
      professionPackId: prefs?.profession_pack_id || null,
      professionPackName: prefs?.profession_pack_id
        ? packsById[prefs.profession_pack_id] || null
        : null,
      preferredCategories,
      userEmail,
      emailConfirmed,
      counts: {
        watches: watches.length,
        watchEmailOn,
        watchInstantOn,
        searches: searchRows.length,
        searchEmailOn,
        categories: preferredCategories.length,
        categoryEmailOn: categoryEmailEnabled,
      },
      nextDigest: nextSlot.slot
        ? { day: nextSlot.day, slot: nextSlot.slot, label: nextSlot.label }
        : null,
      lastDigest: lastDigest
        ? {
            day: lastDigest.digest_date,
            slot: lastDigest.slot,
            articlesCount: lastDigest.articles_sent_count ?? lastDigest.primary_count ?? 0,
            sentAt: lastDigest.sent_at,
          }
        : null,
      history: {
        digests: (historyDigests || []).map((d) => ({
          id: d.id,
          day: d.digest_date,
          slot: d.slot,
          articlesCount: d.articles_sent_count ?? d.primary_count ?? 0,
          sentAt: d.sent_at,
          status: d.status,
        })),
        instant: (historyInstant || []).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          href: n.href,
          createdAt: n.created_at,
        })),
      },
      packNames: packsById,
    };
  }

  /** @deprecated internal — maps GraphQL target type */
  static targetTypeToDb(value) {
    return TARGET_TYPE_TO_DB[value] || value?.toLowerCase();
  }
}

export default LegislationWatchService;
