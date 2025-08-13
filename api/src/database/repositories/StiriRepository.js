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
    this.tableName = 'stiri';
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
      const { data, error, count } = await this.supabase
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
   * Obține o știre după ID
   * @param {number} id - ID-ul știrii
   * @returns {Promise<Object|null>} Știrea sau null dacă nu există
   */
  async getStireById(id) {
    try {
      const { data, error } = await this.supabase
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
   * Creează o nouă știre
   * @param {Object} stireData - Datele știrii
   * @returns {Promise<Object>} Știrea creată
   */
  async createStire(stireData) {
    try {
      const { data, error } = await this.supabase
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
      const { data, error } = await this.supabase
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
      const { error } = await this.supabase
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
