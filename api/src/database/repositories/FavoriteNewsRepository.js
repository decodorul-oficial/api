/**
 * Repository pentru gestionarea știrilor favorite ale utilizatorilor
 * Respectă principiul Single Responsibility prin focusarea doar pe operațiunile de bază de date
 */

export class FavoriteNewsRepository {
  /**
   * Constructor care primește clientul Supabase prin injecție
   * @param {Object} supabaseClient - Clientul Supabase
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Adaugă o știre la favoritele utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} newsId - ID-ul știrii
   * @returns {Promise<Object>} Știrea adăugată la favorite
   */
  async addFavoriteNews(userId, newsId) {
    try {
      const { data, error } = await this.supabase
        .from('favorite_news')
        .insert({
          user_id: userId,
          news_id: newsId
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add favorite news: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('FavoriteNewsRepository.addFavoriteNews error:', error);
      throw error;
    }
  }

  /**
   * Șterge o știre din favoritele utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} newsId - ID-ul știrii
   * @returns {Promise<boolean>} True dacă știrea a fost ștearsă cu succes
   */
  async removeFavoriteNews(userId, newsId) {
    try {
      const { error } = await this.supabase
        .from('favorite_news')
        .delete()
        .eq('user_id', userId)
        .eq('news_id', newsId);

      if (error) {
        throw new Error(`Failed to remove favorite news: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('FavoriteNewsRepository.removeFavoriteNews error:', error);
      throw error;
    }
  }

  /**
   * Verifică dacă o știre este în favoritele utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} newsId - ID-ul știrii
   * @returns {Promise<boolean>} True dacă știrea este în favorite
   */
  async isFavoriteNews(userId, newsId) {
    try {
      const { data, error } = await this.supabase
        .from('favorite_news')
        .select('id')
        .eq('user_id', userId)
        .eq('news_id', newsId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error(`Failed to check favorite news: ${error.message}`);
      }

      return !!data;
    } catch (error) {
      console.error('FavoriteNewsRepository.isFavoriteNews error:', error);
      throw error;
    }
  }

  /**
   * Obține toate știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare și sortare
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @param {string} options.orderBy - Câmpul după care se sortează
   * @param {string} options.orderDirection - Direcția sortării (ASC/DESC)
   * @returns {Promise<Object>} Știrile favorite cu informații de paginare
   */
  async getFavoriteNews(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        orderBy = 'created_at',
        orderDirection = 'DESC'
      } = options;

      // Obține știrile favorite cu informații de paginare și datele știrii
      const { data: favoriteNews, error: favoriteError } = await this.supabase
        .from('favorite_news')
        .select(`
          *,
          stiri!favorite_news_news_id_fkey(
            title,
            publication_date,
            view_count,
            content
          )
        `)
        .eq('user_id', userId)
        .order(orderBy, { ascending: orderDirection === 'ASC' })
        .range(offset, offset + limit - 1);

      if (favoriteError) {
        throw new Error(`Failed to fetch favorite news: ${favoriteError.message}`);
      }

      // Obține numărul total de știri favorite
      const { count: totalCount, error: countError } = await this.supabase
        .from('favorite_news')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        throw new Error(`Failed to count favorite news: ${countError.message}`);
      }

      // Calculează informațiile de paginare
      const hasNextPage = offset + limit < totalCount;
      const hasPreviousPage = offset > 0;
      const currentPage = Math.floor(offset / limit) + 1;
      const totalPages = Math.ceil(totalCount / limit);

      return {
        favoriteNews: favoriteNews || [],
        pagination: {
          totalCount: totalCount || 0,
          hasNextPage,
          hasPreviousPage,
          currentPage,
          totalPages
        }
      };
    } catch (error) {
      console.error('FavoriteNewsRepository.getFavoriteNews error:', error);
      throw error;
    }
  }

  /**
   * Obține doar ID-urile știrilor favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Array<string>>} Array cu ID-urile știrilor favorite
   */
  async getFavoriteNewsIds(userId) {
    try {
      const { data, error } = await this.supabase
        .from('favorite_news')
        .select('news_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch favorite news IDs: ${error.message}`);
      }

      return (data || []).map(item => item.news_id);
    } catch (error) {
      console.error('FavoriteNewsRepository.getFavoriteNewsIds error:', error);
      throw error;
    }
  }

  /**
   * Șterge toate știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă toate știrile au fost șterse cu succes
   */
  async clearAllFavoriteNews(userId) {
    try {
      const { error } = await this.supabase
        .from('favorite_news')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Failed to clear all favorite news: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('FavoriteNewsRepository.clearAllFavoriteNews error:', error);
      throw error;
    }
  }

  /**
   * Obține statistici despre știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Statistici despre știrile favorite
   */
  async getFavoriteNewsStats(userId) {
    try {
      const { count: totalFavorites, error: countError } = await this.supabase
        .from('favorite_news')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        throw new Error(`Failed to get favorite news stats: ${countError.message}`);
      }

      // Obține data celei mai recente știri favorite
      const { data: latestFavorite, error: latestError } = await this.supabase
        .from('favorite_news')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestError && latestError.code !== 'PGRST116') {
        throw new Error(`Failed to get latest favorite news: ${latestError.message}`);
      }

      return {
        totalFavorites: totalFavorites || 0,
        latestFavoriteDate: latestFavorite?.created_at || null
      };
    } catch (error) {
      console.error('FavoriteNewsRepository.getFavoriteNewsStats error:', error);
      throw error;
    }
  }

  /**
   * Verifică dacă știrile există în baza de date
   * @param {Array<string>} newsIds - Array cu ID-urile știrilor de verificat
   * @returns {Promise<Array<string>>} Array cu ID-urile știrilor care există
   */
  async validateNewsIds(newsIds) {
    try {
      if (!newsIds || newsIds.length === 0) {
        return [];
      }

      const { data, error } = await this.supabase
        .from('stiri')
        .select('id')
        .in('id', newsIds);

      if (error) {
        throw new Error(`Failed to validate news IDs: ${error.message}`);
      }

      return (data || []).map(item => item.id);
    } catch (error) {
      console.error('FavoriteNewsRepository.validateNewsIds error:', error);
      throw error;
    }
  }
}

export default FavoriteNewsRepository;
