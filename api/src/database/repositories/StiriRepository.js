/**
 * Repository pentru operațiunile cu știri
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe operațiunile cu știri
 * Respectă principiul Dependency Inversion prin injectarea clientului Supabase
 */

import { GraphQLError } from 'graphql';

/**
 * Repository pentru gestionarea știrilor
 */
export class StiriRepository {
  /**
   * Constructor care primește clientul Supabase prin injecție de dependență
   * @param {Object} supabaseClient - Clientul Supabase injectat
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.publicSchema = typeof supabaseClient.schema === 'function'
      ? supabaseClient.schema('public')
      : supabaseClient;
    this.tableName = 'stiri';
  }

  /**
   * Returnează categoriile distincte cu numărul de știri
   */
  async getCategories({ limit = 100 } = {}) {
    try {
      const rpc = await this.publicSchema.rpc('get_categories', { p_limit: Number(limit) });
      if (rpc.error) {
        throw new GraphQLError(`Eroare la obținerea categoriilor: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      // Forma returnată de RPC este rows cu coloane name, count
      return (rpc.data || []).map(row => ({
        name: row.name,
        count: Number(row.count) || 0
      }));
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea categoriilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
  /**
   * Obține știrile cu paginare și filtrare
   * @param {Object} options - Opțiunile de paginare și filtrare
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @param {string} options.orderBy - Câmpul pentru sortare
   * @param {string} options.orderDirection - Direcția sortării (asc/desc)
   * @returns {Promise<Array>} Lista de știri
   */
  async getStiri({ limit = 10, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' } = {}) {
    try {
      const { data, error, count } = await this.publicSchema
        .from(this.tableName)
        .select('*', { count: 'exact' })
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new GraphQLError(`Eroare la preluarea știrilor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return {
        stiri: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea știrilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține știrile dintr-o categorie (content->>'category') cu paginare
   * @param {Object} options
   * @param {string} options.category - Categoria (case-insensitive)
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @param {string} options.orderBy - Câmpul pentru sortare
   * @param {string} options.orderDirection - Direcția sortării (asc/desc)
   */
  async getStiriByCategory({ category, limit = 10, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' } = {}) {
    try {
      // PostgREST nu suportă direct unaccent aici; folosim ILIKE pentru a permite cazuri insensibile
      const { data, error, count } = await this.publicSchema
        .from(this.tableName)
        .select('*', { count: 'exact' })
        .filter('content->>category', 'ilike', category)
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new GraphQLError(`Eroare la preluarea știrilor pe categorie: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return {
        stiri: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea știrilor pe categorie', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Caută știrile folosind căutare fuzzy/full-text
   * Implementare: ilike pe title + conversie content JSONB la text și strip de markup simplu
   * Notă: Pentru rezultate mai bune, recomandăm în viitor trigram/tsvector
   */
  async searchStiri({ query, limit = 10, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' } = {}) {
    try {
      // Folosește RPC optimizat în DB (folosește coloanele generate indexate)
      const rpc = await this.publicSchema.rpc('stiri_search', {
        p_query: query,
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_order_dir: orderDirection
      });
      if (rpc.error) {
        throw new GraphQLError(`Eroare la căutarea știrilor: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      const data = rpc.data?.items || [];
      const count = rpc.data?.total_count || rpc.data?.items?.length || 0;

      return {
        stiri: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la căutarea știrilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Caută știri cu suport pentru fuzzy/full-text search + keywords + filtrare dată
   * Folosește funcția optimizată stiri_search_enhanced din DB
   */
  async searchStiriByKeywords({ query, keywords, publicationDateFrom, publicationDateTo, limit = 10, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' } = {}) {
    try {
      // Validează și convertește keywords la formatul corect pentru PostgreSQL
      let pgKeywords = null;
      if (Array.isArray(keywords) && keywords.length > 0) {
        pgKeywords = keywords.filter(k => typeof k === 'string' && k.trim().length > 0);
        if (pgKeywords.length === 0) {
          pgKeywords = null;
        }
      }

      // Validează formatele de dată
      const parseDate = (dateStr) => {
        if (!dateStr) return null;
        // Acceptă format YYYY-MM-DD sau ISO8601
        const dateOnlyMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
        if (dateOnlyMatch) return dateStr;
        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) return null;
        return parsed.toISOString().slice(0, 10);
      };

      const dateFrom = parseDate(publicationDateFrom);
      const dateTo = parseDate(publicationDateTo);

      // Folosește RPC îmbunătățit în DB
      const rpc = await this.publicSchema.rpc('stiri_search_enhanced', {
        p_query: query || null,
        p_keywords: pgKeywords,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_order_dir: orderDirection
      });

      if (rpc.error) {
        throw new GraphQLError(`Eroare la căutarea îmbunătățită a știrilor: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      const data = rpc.data?.items || [];
      const count = rpc.data?.total_count || rpc.data?.items?.length || 0;

      return {
        stiri: data || [],
        totalCount: count || 0,
        hasNextPage: (offset + limit) < (count || 0),
        hasPreviousPage: offset > 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la căutarea îmbunătățită a știrilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține o știre după ID
   * @param {number} id - ID-ul știrii
   * @returns {Promise<Object|null>} Știrea sau null dacă nu există
   */
  async getStireById(id) {
    try {
      const { data, error } = await this.publicSchema
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Nu s-a găsit știrea
        }
        throw new GraphQLError(`Eroare la preluarea știrii: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea știrii', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Înregistrează o vizualizare pentru o știre cu deduplicare pe 24h
   * @param {number} newsId - ID-ul știrii
   * @param {Object} options - Opțiuni pentru tracking
   * @param {string} options.ip - Adresa IP (string)
   * @param {string} [options.userAgent] - User-Agent (opțional)
   * @param {string} [options.sessionId] - ID sesiune (opțional)
   * @returns {Promise<boolean>} True dacă s-a înregistrat o nouă vizualizare
   */
  async trackNewsView(newsId, { ip, userAgent, sessionId } = {}) {
    try {
      const rpc = await this.publicSchema.rpc('track_news_view', {
        p_news_id: Number(newsId),
        p_ip: ip,
        p_user_agent: userAgent || null,
        p_session_id: sessionId || null
      });

      if (rpc.error) {
        throw new GraphQLError(`Eroare la înregistrarea vizualizării: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return Boolean(rpc.data);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la înregistrarea vizualizării', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține cele mai citite știri, opțional filtrate pe perioadă
   * @param {Object} options
   * @param {string} [options.period] - '24h' | '7d' | '30d' | 'all'
   * @param {number} [options.limit] - Numărul de știri
   * @returns {Promise<Array>} Lista de știri ordonate descrescător după view_count
   */
  async getMostReadStiri({ period = 'all', limit = 10 } = {}) {
    try {
      const rpc = await this.publicSchema.rpc('get_most_read_stiri', {
        p_period: period,
        p_limit: limit
      });

      if (rpc.error) {
        throw new GraphQLError(`Eroare la obținerea celor mai citite știri: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return rpc.data || [];
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea celor mai citite știri', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Returnează top entități ca JSONB de la funcția SQL
   */
  async getTopEntities({ limit = 20 } = {}) {
    try {
      const rpc = await this.publicSchema.rpc('get_top_entities', { p_limit: limit });
      if (rpc.error) {
        throw new GraphQLError(`Eroare la obținerea top entități: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      return rpc.data || [];
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea top entități', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Returnează top topicuri ca JSONB de la funcția SQL
   */
  async getTopTopics({ limit = 20 } = {}) {
    try {
      const rpc = await this.publicSchema.rpc('get_top_topics', { p_limit: limit });
      if (rpc.error) {
        throw new GraphQLError(`Eroare la obținerea top topicuri: ${rpc.error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      return rpc.data || [];
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea top topicuri', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Creează o nouă știre
   * @param {Object} stireData - Datele știrii
   * @returns {Promise<Object>} Știrea creată
   */
  async createStire(stireData) {
    try {
      const { data, error } = await this.publicSchema
        .from(this.tableName)
        .insert([stireData])
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la crearea știrii: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la crearea știrii', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează o știre existentă
   * @param {number} id - ID-ul știrii
   * @param {Object} updateData - Datele de actualizat
   * @returns {Promise<Object>} Știrea actualizată
   */
  async updateStire(id, updateData) {
    try {
      const { data, error } = await this.publicSchema
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la actualizarea știrii: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea știrii', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Șterge o știre
   * @param {number} id - ID-ul știrii
   * @returns {Promise<boolean>} True dacă știrea a fost ștearsă
   */
  async deleteStire(id) {
    try {
      const { error } = await this.publicSchema
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        throw new GraphQLError(`Eroare la ștergerea știrii: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la ștergerea știrii', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}

export default StiriRepository;
