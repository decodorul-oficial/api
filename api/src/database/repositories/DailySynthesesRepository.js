/**
 * Repository pentru operațiunile cu daily_syntheses
 */

import { GraphQLError } from 'graphql';

export class DailySynthesesRepository {
  /**
   * @param {Object} supabaseClient - Clientul Supabase injectat (service role)
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.publicSchema = typeof supabaseClient.schema === 'function'
      ? supabaseClient.schema('public')
      : supabaseClient;
    this.tableName = 'daily_syntheses';
  }

  /**
   * Returnează sinteza de tip "detailed" pentru o anumită zi
   * @param {string} dateISO - Data în format YYYY-MM-DD
   * @returns {Promise<Object|null>} Obiect cu câmpurile cerute sau null
   */
  async getDetailedSynthesisByDate(dateISO) {
    try {
      const { data, error } = await this.publicSchema
        .from(this.tableName)
        .select('synthesis_date, synthesis_type, title, content, summary, metadata')
        .eq('synthesis_date', dateISO)
        .eq('synthesis_type', 'detailed')
        .single();

      if (error) {
        // PGRST116 = no rows
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new GraphQLError(`Eroare la preluarea sintezei: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea sintezei', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}

export default DailySynthesesRepository;


