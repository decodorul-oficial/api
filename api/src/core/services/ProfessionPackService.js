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

  async applyProfessionPack(userId, packId) {
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

    const mergedCategories = mergeUniqueCategories(
      current?.preferred_categories,
      pack.categories
    );

    const paid = await this.legislationWatchService.hasPaidSubscription(userId);

    // Opt-out: pachetul pornește digestele pe email + domenii; userul oprește ce nu vrea.
    const prevSettings = current?.notification_settings || {};
    const notificationSettings = paid
      ? {
          ...prevSettings,
          digest_email_enabled: true,
          category_email_enabled: true,
        }
      : prevSettings;

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
      emailEnabledByDefault: paid,
      hubUrl: '/favorite?tab=alerte',
    };

    if (paid) {
      const keywords = (pack.keywords || []).slice(0, 2);
      for (const keyword of keywords) {
        try {
          await this.savedSearchRepository.createSavedSearch({
            user_id: userId,
            name: `${pack.name_ro}: ${keyword}`,
            description: `Căutare din pachetul ${pack.name_ro}`,
            search_params: { keywords: keyword },
            is_favorite: false,
            email_notifications_enabled: true,
          });
          result.searchesCreated += 1;
        } catch (error) {
          result.skippedSearches.push({ keyword, reason: error.message });
        }
      }

      for (const identifierText of pack.anchor_identifiers || []) {
        try {
          const canAdd = await this.supabase.rpc('check_legislation_watch_limit', { p_user_id: userId });
          if (canAdd.data !== true) {
            result.skippedWatches.push({ identifierText, reason: 'watch_limit' });
            break;
          }

          await this.legislationWatchService.add(userId, {
            label: identifierText,
            targetType: 'NORMALIZED_REF',
            identifierText,
            alertIntensity: 'IMPORTANT',
            emailEnabled: true,
          });
          result.watchesCreated += 1;
        } catch (error) {
          result.skippedWatches.push({
            identifierText,
            reason: error instanceof GraphQLError ? error.message : error.message,
          });
        }
      }
    }

    return result;
  }
}

export default ProfessionPackService;
