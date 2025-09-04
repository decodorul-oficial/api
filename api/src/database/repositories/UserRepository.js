/**
 * Repository pentru operațiunile cu utilizatori și profile
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe operațiunile cu utilizatori
 * Respectă principiul Dependency Inversion prin injectarea clientului Supabase
 */

import { GraphQLError } from 'graphql';
import { DEFAULT_SUBSCRIPTION_TIER } from '../../config/subscriptions.js';

/**
 * Repository pentru gestionarea utilizatorilor și profilelor
 */
export class UserRepository {
  /**
   * Constructor care primește clientul Supabase prin injecție de dependență
   * @param {Object} supabaseClient - Clientul Supabase injectat
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.profilesTable = 'profiles';
    this.usageLogsTable = 'usage_logs';
    this.userPreferencesTable = 'user_preferences';
  }

  /**
   * Obține profilul unui utilizator după ID
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object|null>} Profilul utilizatorului sau null dacă nu există
   */
  async getProfileById(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.profilesTable)
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Nu s-a găsit profilul
        }
        throw new GraphQLError(`Eroare la preluarea profilului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea profilului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Creează un profil pentru un utilizator nou
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} subscriptionTier - Tier-ul de abonament (implicit 'free')
   * @returns {Promise<Object>} Profilul creat
   */
  async createProfile(userId, subscriptionTier = DEFAULT_SUBSCRIPTION_TIER) {
    try {
      const { data, error } = await this.supabase
        .from(this.profilesTable)
        .upsert({
          id: userId,
          subscription_tier: subscriptionTier
        }, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la crearea profilului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la crearea profilului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează profilul unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} updateData - Datele de actualizat
   * @returns {Promise<Object>} Profilul actualizat
   */
  async updateProfile(userId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from(this.profilesTable)
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la actualizarea profilului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea profilului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține numărul de cereri făcute de un utilizator în ultimele 24 de ore
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Numărul de cereri
   */
  async getRequestCountLast24Hours(userId) {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { count, error } = await this.supabase
        .from(this.usageLogsTable)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('request_timestamp', twentyFourHoursAgo.toISOString());

      if (error) {
        throw new GraphQLError(`Eroare la numărarea cererilor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return count || 0;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la numărarea cererilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Loghează o cerere nouă pentru un utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<void>}
   */
  async logRequest(userId) {
    try {
      const { error } = await this.supabase
        .from(this.usageLogsTable)
        .insert([{
          user_id: userId,
          request_timestamp: new Date().toISOString()
        }]);

      if (error) {
        // Nu aruncăm eroare pentru logarea cererii, deoarece nu afectează funcționalitatea principală
        console.error('Eroare la logarea cererii:', error);
      }
    } catch (error) {
      // Logăm eroarea dar nu o propagăm mai departe
      console.error('Eroare internă la logarea cererii:', error);
    }
  }

  /**
   * Obține istoricul cererilor pentru un utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiunile de paginare
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @returns {Promise<Object>} Istoricul cererilor cu paginare
   */
  async getRequestHistory(userId, { limit = 50, offset = 0 } = {}) {
    try {
      const { data, error, count } = await this.supabase
        .from(this.usageLogsTable)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('request_timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new GraphQLError(`Eroare la preluarea istoricului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return {
        requests: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea istoricului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține preferințele unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object|null>} Preferințele utilizatorului sau null dacă nu există
   */
  async getUserPreferences(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.userPreferencesTable)
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Nu s-au găsit preferințele
        }
        throw new GraphQLError(`Eroare la preluarea preferințelor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea preferințelor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează preferințele unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} preferences - Preferințele de actualizat
   * @param {Array} preferences.preferredCategories - Categoriile preferate
   * @param {Object} preferences.notificationSettings - Setările de notificare
   * @returns {Promise<Object>} Preferințele actualizate
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const { data, error } = await this.supabase
        .from(this.userPreferencesTable)
        .upsert({
          id: userId,
          preferred_categories: preferences.preferredCategories || [],
          notification_settings: preferences.notificationSettings || {}
        }, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la actualizarea preferințelor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea preferințelor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține știrile personalizate pentru un utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiunile de paginare și sortare
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @param {string} options.orderBy - Câmpul pentru sortare
   * @param {string} options.orderDirection - Direcția sortării
   * @returns {Promise<Object>} Știrile personalizate cu paginare
   */
  async getPersonalizedStiri(userId, options = {}) {
    try {
      const { limit = 10, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' } = options;
      
      const { data, error } = await this.supabase.rpc('get_personalized_stiri', {
        user_uuid: userId,
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_order_dir: orderDirection
      });

      if (error) {
        throw new GraphQLError(`Eroare la preluarea știrilor personalizate: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      const result = data || { items: [], total_count: 0 };
      
      return {
        stiri: result.items || [],
        totalCount: result.total_count || 0,
        hasNextPage: (offset + limit) < (result.total_count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea știrilor personalizate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}

export default UserRepository;
