/**
 * Repository pentru gestionarea căutărilor salvate
 * Respectă principiul Single Responsibility - gestionează doar operațiunile CRUD
 */

import { GraphQLError } from 'graphql';

export class SavedSearchRepository {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Creează o căutare salvată
   * @param {Object} searchData - Datele căutării
   * @returns {Promise<Object>} Căutarea salvată
   */
  async createSavedSearch(searchData) {
    try {
      const { data, error } = await this.supabase
        .from('saved_searches')
        .insert([searchData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          throw new GraphQLError('Există deja o căutare salvată cu acest nume', {
            extensions: { code: 'DUPLICATE_NAME' }
          });
        }
        throw new GraphQLError(`Eroare la salvarea căutării: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la salvarea căutării', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține căutările salvate ale unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare și filtrare
   * @returns {Promise<Object>} Lista de căutări salvate cu paginare
   */
  async getSavedSearches(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        orderBy = 'created_at',
        orderDirection = 'desc',
        favoritesOnly = false
      } = options;

      let query = this.supabase
        .from('saved_searches')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Filtrare după favorite
      if (favoritesOnly) {
        query = query.eq('is_favorite', true);
      }

      // Sortare
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });

      // Paginare
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new GraphQLError(`Eroare la obținerea căutărilor salvate: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return {
        savedSearches: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea căutărilor salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține o căutare salvată după ID
   * @param {string} searchId - ID-ul căutării
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object|null>} Căutarea salvată sau null
   */
  async getSavedSearchById(searchId, userId) {
    try {
      const { data, error } = await this.supabase
        .from('saved_searches')
        .select('*')
        .eq('id', searchId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null;
        }
        throw new GraphQLError(`Eroare la obținerea căutării salvate: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează o căutare salvată
   * @param {string} searchId - ID-ul căutării
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} updateData - Datele de actualizare
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async updateSavedSearch(searchId, userId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from('saved_searches')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          throw new GraphQLError('Căutarea salvată nu a fost găsită', {
            extensions: { code: 'NOT_FOUND' }
          });
        }
        if (error.code === '23505') { // Unique constraint violation
          throw new GraphQLError('Există deja o căutare salvată cu acest nume', {
            extensions: { code: 'DUPLICATE_NAME' }
          });
        }
        throw new GraphQLError(`Eroare la actualizarea căutării salvate: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Șterge o căutare salvată
   * @param {string} searchId - ID-ul căutării
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă a fost ștearsă
   */
  async deleteSavedSearch(searchId, userId) {
    try {
      const { error } = await this.supabase
        .from('saved_searches')
        .delete()
        .eq('id', searchId)
        .eq('user_id', userId);

      if (error) {
        throw new GraphQLError(`Eroare la ștergerea căutării salvate: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la ștergerea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Comută statusul de favorit pentru o căutare salvată
   * @param {string} searchId - ID-ul căutării
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async toggleFavoriteSearch(searchId, userId) {
    try {
      // Obține căutarea curentă
      const currentSearch = await this.getSavedSearchById(searchId, userId);
      if (!currentSearch) {
        throw new GraphQLError('Căutarea salvată nu a fost găsită', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      // Comută statusul de favorit
      return await this.updateSavedSearch(searchId, userId, {
        is_favorite: !currentSearch.is_favorite
      });
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la comutarea statusului de favorit', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Activează/dezactivează notificările email pentru o căutare salvată
   * @param {string} searchId - ID-ul căutării
   * @param {string} userId - ID-ul utilizatorului
   * @param {boolean} enabled - Starea notificărilor
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async toggleEmailNotifications(searchId, userId, enabled) {
    try {
      const { data, error } = await this.supabase
        .from('saved_searches')
        .update({ email_notifications_enabled: enabled })
        .eq('id', searchId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new GraphQLError('Căutarea salvată nu a fost găsită', {
            extensions: { code: 'NOT_FOUND' }
          });
        }
        throw new GraphQLError(`Eroare la actualizarea notificărilor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea notificărilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține căutările salvate cu notificări email activate
   * @returns {Promise<Array>} Lista de căutări cu notificări
   */
  async getSavedSearchesWithEmailNotifications() {
    try {
      const { data, error } = await this.supabase
        .from('saved_searches')
        .select(`
          *,
          profiles!saved_searches_user_id_fkey (
            id,
            email,
            display_name
          )
        `)
        .eq('email_notifications_enabled', true);

      if (error) {
        throw new GraphQLError(`Eroare la obținerea căutărilor cu notificări: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea căutărilor cu notificări', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține numărul de notificări email active pentru un utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Numărul de notificări active
   */
  async getActiveEmailNotificationsCount(userId) {
    try {
      const { count, error } = await this.supabase
        .from('saved_searches')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('email_notifications_enabled', true);

      if (error) {
        throw new GraphQLError(`Eroare la numărarea notificărilor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return count || 0;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la numărarea notificărilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}
