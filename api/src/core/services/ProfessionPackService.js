/**
 * Profession packs — editorial presets for categories, searches, and anchor watches.
 */

import { GraphQLError } from 'graphql';

function toGraphQLPack(row) {
  if (!row) return null;
  return {
    id: row.id,
    nameRo: row.name_ro,
    descriptionRo: row.description_ro,
    categories: row.categories || [],
    keywords: row.keywords || [],
    anchorIdentifiers: row.anchor_identifiers || [],
    sortOrder: row.sort_order ?? 0,
  };
}

function mergeUniqueCategories(existing, incoming) {
  const set = new Set(Array.isArray(existing) ? existing : []);
  for (const cat of incoming || []) {
    if (cat) set.add(String(cat));
  }
  return [...set];
}

export class ProfessionPackService {
  constructor(supabaseClient, legislationWatchService, savedSearchRepository) {
    this.supabase = supabaseClient;
    this.legislationWatchService = legislationWatchService;
    this.savedSearchRepository = savedSearchRepository;
  }

  async getProfessionPacks() {
    const { data, error } = await this.supabase
      .from('profession_packs')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new GraphQLError(`Eroare la încărcarea pachetelor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return (data || []).map(toGraphQLPack);
  }

  /**
   * @param {string} userId
   * @param {string} packId
   * @param {{
   *   keywords?: string[],
   *   anchors?: string[],
   *   includeCategories?: boolean,
   *   deliveryMode?: 'off' | 'digest' | 'instant',
   * }} [selection]
   */
  async applyProfessionPack(userId, packId, selection = {}) {
    const { data: pack, error: packError } = await this.supabase
      .from('profession_packs')
      .select('*')
      .eq('id', packId)
      .eq('is_active', true)
      .maybeSingle();

    if (packError || !pack) {
      throw new GraphQLError('Pachetul profesional nu a fost găsit', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    const { data: current } = await this.supabase
      .from('user_preferences')
      .select('preferred_categories, notification_settings')
      .eq('id', userId)
      .maybeSingle();

    const includeCategories = selection.includeCategories !== false;
    const mergedCategories = includeCategories
      ? mergeUniqueCategories(current?.preferred_categories, pack.categories)
      : (current?.preferred_categories || []);

    const deliveryMode = selection.deliveryMode || 'digest';
    const emailOn = deliveryMode === 'digest' || deliveryMode === 'instant';
    const instantOn = deliveryMode === 'instant';

    const canEmail = await this.supabase.rpc('check_watch_email_limit', { p_user_id: userId });
    const emailAllowed = canEmail.data === true;

    const prevSettings = current?.notification_settings || {};
    const notificationSettings = {
      ...prevSettings,
      digest_email_enabled: emailOn ? true : (prevSettings.digest_email_enabled ?? true),
      category_email_enabled: includeCategories && emailOn,
      ...(instantOn ? { instant_master_enabled: true } : {}),
    };

    const { error: prefError } = await this.supabase
      .from('user_preferences')
      .upsert({
        id: userId,
        profession_pack_id: packId,
        preferred_categories: mergedCategories,
        notification_settings: notificationSettings,
      }, { onConflict: 'id' });

    if (prefError) {
      throw new GraphQLError(`Eroare la salvarea preferințelor: ${prefError.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    const result = {
      packId: pack.id,
      packName: pack.name_ro,
      categoriesMerged: mergedCategories,
      searchesCreated: 0,
      watchesCreated: 0,
      skippedSearches: [],
      skippedWatches: [],
      emailEnabledByDefault: emailOn && emailAllowed,
      hubUrl: '/alerte',
    };

    const selectedKeywords = Array.isArray(selection.keywords)
      ? selection.keywords
      : (pack.keywords || []).slice(0, 2);

    for (const keyword of selectedKeywords) {
      if (!keyword) continue;
      try {
        await this.savedSearchRepository.createSavedSearch({
          user_id: userId,
          name: `${pack.name_ro}: ${keyword}`,
          description: `Căutare din pachetul ${pack.name_ro}`,
          search_params: { keywords: keyword },
          is_favorite: false,
          email_notifications_enabled: emailOn && emailAllowed,
          source_pack_id: pack.id,
        });
        result.searchesCreated += 1;
      } catch (error) {
        result.skippedSearches.push({ keyword, reason: error.message });
      }
    }

    const selectedAnchors = Array.isArray(selection.anchors)
      ? selection.anchors
      : (pack.anchor_identifiers || []);

    for (const identifierText of selectedAnchors) {
      if (!identifierText) continue;
      try {
        const canAdd = await this.supabase.rpc('check_legislation_watch_limit', { p_user_id: userId });
        if (canAdd.data !== true) {
          result.skippedWatches.push({ identifierText, reason: 'watch_limit' });
          break;
        }

        const watch = await this.legislationWatchService.add(userId, {
          label: identifierText,
          targetType: 'NORMALIZED_REF',
          identifierText,
          alertIntensity: 'IMPORTANT',
          emailEnabled: emailOn && emailAllowed,
          sourcePackId: pack.id,
        });

        if (instantOn && watch?.id) {
          try {
            await this.legislationWatchService.toggleInstant(userId, watch.id, true);
          } catch {
            /* optional — ignore if instant cannot be enabled */
          }
        }

        result.watchesCreated += 1;
      } catch (error) {
        result.skippedWatches.push({
          identifierText,
          reason: error instanceof GraphQLError ? error.message : error.message,
        });
      }
    }

    return result;
  }
}

export default ProfessionPackService;
