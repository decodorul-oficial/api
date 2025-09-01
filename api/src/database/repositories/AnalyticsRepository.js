/**
 * Repository pentru analize și statistici
 * Execută query-uri agregate pentru dashboard-ul de analitice
 */

import { GraphQLError } from 'graphql';

export class AnalyticsRepository {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Calculează numărul total de acte normative în intervalul specificat
   */
  async getTotalActs(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_total_acts', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('Error getting total acts:', error);
        throw new GraphQLError('Eroare la obținerea numărului total de acte', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || 0;
    } catch (error) {
      console.error('Error in getTotalActs:', error);
      throw error;
    }
  }

  /**
   * Obține activitatea legislativă în timp (pe zile)
   */
  async getLegislativeActivityOverTime(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_legislative_activity_over_time', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('Error getting legislative activity over time:', error);
        throw new GraphQLError('Eroare la obținerea activității legislative în timp', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      console.error('Error in getLegislativeActivityOverTime:', error);
      throw error;
    }
  }

  /**
   * Obține top 5 cele mai active ministere/instituții
   */
  async getTopActiveMinistries(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_top_active_ministries', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: 5
      });

      if (error) {
        console.error('Error getting top active ministries:', error);
        throw new GraphQLError('Eroare la obținerea ministerelor active', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTopActiveMinistries:', error);
      throw error;
    }
  }

  /**
   * Obține distribuția actelor pe categorii
   */
  async getDistributionByCategory(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_distribution_by_category', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('Error getting distribution by category:', error);
        throw new GraphQLError('Eroare la obținerea distribuției pe categorii', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDistributionByCategory:', error);
      throw error;
    }
  }

  /**
   * Obține top 10 cele mai frecvente cuvinte cheie
   */
  async getTopKeywords(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_top_keywords', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: 10
      });

      if (error) {
        console.error('Error getting top keywords:', error);
        throw new GraphQLError('Eroare la obținerea cuvintelor cheie', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTopKeywords:', error);
      throw error;
    }
  }

  /**
   * Obține top 10 cele mai menționate legi (entități WORK_OF_ART)
   */
  async getTopMentionedLaws(startDate, endDate) {
    try {
      const { data, error } = await this.supabase.rpc('get_top_mentioned_laws', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: 10
      });

      if (error) {
        console.error('Error getting top mentioned laws:', error);
        throw new GraphQLError('Eroare la obținerea actelor menționate', {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTopMentionedLaws:', error);
      throw error;
    }
  }

  /**
   * Obține toate datele pentru dashboard într-un singur apel
   */
  async getDashboardData(startDate, endDate) {
    try {
      // Execută toate query-urile în paralel pentru performanță
      const [
        totalActs,
        legislativeActivityOverTime,
        topActiveMinistries,
        distributionByCategory,
        topKeywords,
        topMentionedLaws
      ] = await Promise.all([
        this.getTotalActs(startDate, endDate),
        this.getLegislativeActivityOverTime(startDate, endDate),
        this.getTopActiveMinistries(startDate, endDate),
        this.getDistributionByCategory(startDate, endDate),
        this.getTopKeywords(startDate, endDate),
        this.getTopMentionedLaws(startDate, endDate)
      ]);

      return {
        totalActs,
        legislativeActivityOverTime,
        topActiveMinistries,
        distributionByCategory,
        topKeywords,
        topMentionedLaws
      };
    } catch (error) {
      console.error('Error in getDashboardData:', error);
      throw error;
    }
  }
}

export default AnalyticsRepository;
