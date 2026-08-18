/**
 * Repository for legislation_watches CRUD.
 */

import { GraphQLError } from 'graphql';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    targetType: row.target_type,
    targetStiriId: row.target_stiri_id != null ? String(row.target_stiri_id) : null,
    targetExternalId: row.target_external_id != null ? String(row.target_external_id) : null,
    normalizedKey: row.normalized_key,
    normalizedIdentifier: row.normalized_identifier || {},
    alertIntensity: row.alert_intensity,
    relationFilters: row.relation_filters || [],
    emailEnabled: row.email_enabled,
    instantEnabled: row.instant_enabled,
    minConfidence: row.min_confidence,
    sourcePackId: row.source_pack_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LegislationWatchRepository {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  mapRow(row) {
    return mapRow(row);
  }

  async listByUser(userId) {
    const { data, error } = await this.supabase
      .from('legislation_watches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new GraphQLError(`Eroare la listarea urmăririlor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return (data || []).map(mapRow);
  }

  async getById(watchId, userId) {
    const { data, error } = await this.supabase
      .from('legislation_watches')
      .select('*')
      .eq('id', watchId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new GraphQLError(`Eroare la obținerea urmăririi: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return mapRow(data);
  }

  async create(row) {
    const { data, error } = await this.supabase
      .from('legislation_watches')
      .insert([row])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new GraphQLError('Urmărești deja acest act legislativ', {
          extensions: { code: 'DUPLICATE_WATCH' },
        });
      }
      throw new GraphQLError(`Eroare la crearea urmăririi: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return mapRow(data);
  }

  async update(watchId, userId, patch) {
    const { data, error } = await this.supabase
      .from('legislation_watches')
      .update(patch)
      .eq('id', watchId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      throw new GraphQLError(`Eroare la actualizarea urmăririi: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    if (!data) {
      throw new GraphQLError('Urmărirea nu a fost găsită', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    return mapRow(data);
  }

  async delete(watchId, userId) {
    const { error } = await this.supabase
      .from('legislation_watches')
      .delete()
      .eq('id', watchId)
      .eq('user_id', userId);

    if (error) {
      throw new GraphQLError(`Eroare la ștergerea urmăririi: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return true;
  }

  async bulkSetEmail(userId, enabled) {
    const { data, error } = await this.supabase
      .from('legislation_watches')
      .update({ email_enabled: enabled })
      .eq('user_id', userId)
      .select('id');

    if (error) {
      throw new GraphQLError(`Eroare la actualizarea alertelor email: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return data?.length || 0;
  }

  async disableAllEmailAndInstant(userId) {
    const { error } = await this.supabase
      .from('legislation_watches')
      .update({ email_enabled: false, instant_enabled: false })
      .eq('user_id', userId);

    if (error) {
      throw new GraphQLError(`Eroare la dezactivarea alertelor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }
  }
}

export default LegislationWatchRepository;
