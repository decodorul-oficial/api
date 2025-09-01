/**
 * Service pentru analitice și statistici
 * Respectă principiul Single Responsibility - business logic pentru dashboard
 */

import { GraphQLError } from 'graphql';

export class AnalyticsService {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }

  /**
   * Validează și normalizează datele de input pentru perioada
   */
  _validateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new GraphQLError('Date invalide furnizate', {
        extensions: { code: 'INVALID_INPUT' }
      });
    }

    if (start > end) {
      throw new GraphQLError('Data de început trebuie să fie înainte de data de sfârșit', {
        extensions: { code: 'INVALID_INPUT' }
      });
    }

    // Limitează intervalul la maximum 2 ani pentru performanță
    const maxDays = 2 * 365; // 2 ani
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > maxDays) {
      throw new GraphQLError('Intervalul de timp nu poate fi mai mare de 2 ani', {
        extensions: { code: 'INVALID_INPUT' }
      });
    }

    return {
      startDate: start.toISOString().split('T')[0], // Format YYYY-MM-DD
      endDate: end.toISOString().split('T')[0]
    };
  }

  /**
   * Formatează datele pentru TimeDataPoint
   */
  _formatTimeData(data) {
    return data.map(item => ({
      date: item.date || item.publication_date,
      value: parseInt(item.value || item.count || 0)
    }));
  }

  /**
   * Formatează datele pentru AnalyticsDataPoint
   */
  _formatAnalyticsData(data) {
    return data.map(item => ({
      label: item.label || item.name || item.author || item.category || item.keyword || item.text || 'Unknown',
      value: parseInt(item.value || item.count || 0)
    }));
  }

  /**
   * Obține toate datele pentru dashboard
   */
  async getDashboardData(startDate, endDate) {
    try {
      // Validează și normalizează datele
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);

      // Obține datele din repository
      const dashboardData = await this.analyticsRepository.getDashboardData(validStartDate, validEndDate);

      // Formatează datele pentru GraphQL
      return {
        totalActs: parseInt(dashboardData.totalActs || 0),
        legislativeActivityOverTime: this._formatTimeData(dashboardData.legislativeActivityOverTime),
        topActiveMinistries: this._formatAnalyticsData(dashboardData.topActiveMinistries),
        distributionByCategory: this._formatAnalyticsData(dashboardData.distributionByCategory),
        topKeywords: this._formatAnalyticsData(dashboardData.topKeywords),
        topMentionedLaws: this._formatAnalyticsData(dashboardData.topMentionedLaws)
      };
    } catch (error) {
      console.error('Error in AnalyticsService.getDashboardData:', error);
      throw error;
    }
  }

  /**
   * Obține numărul total de acte în perioada specificată
   */
  async getTotalActs(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      return await this.analyticsRepository.getTotalActs(validStartDate, validEndDate);
    } catch (error) {
      console.error('Error in AnalyticsService.getTotalActs:', error);
      throw error;
    }
  }

  /**
   * Obține activitatea legislativă în timp
   */
  async getLegislativeActivityOverTime(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      const data = await this.analyticsRepository.getLegislativeActivityOverTime(validStartDate, validEndDate);
      return this._formatTimeData(data);
    } catch (error) {
      console.error('Error in AnalyticsService.getLegislativeActivityOverTime:', error);
      throw error;
    }
  }

  /**
   * Obține top instituții active
   */
  async getTopActiveMinistries(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      const data = await this.analyticsRepository.getTopActiveMinistries(validStartDate, validEndDate);
      return this._formatAnalyticsData(data);
    } catch (error) {
      console.error('Error in AnalyticsService.getTopActiveMinistries:', error);
      throw error;
    }
  }

  /**
   * Obține distribuția pe categorii
   */
  async getDistributionByCategory(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      const data = await this.analyticsRepository.getDistributionByCategory(validStartDate, validEndDate);
      return this._formatAnalyticsData(data);
    } catch (error) {
      console.error('Error in AnalyticsService.getDistributionByCategory:', error);
      throw error;
    }
  }

  /**
   * Obține top cuvinte cheie
   */
  async getTopKeywords(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      const data = await this.analyticsRepository.getTopKeywords(validStartDate, validEndDate);
      return this._formatAnalyticsData(data);
    } catch (error) {
      console.error('Error in AnalyticsService.getTopKeywords:', error);
      throw error;
    }
  }

  /**
   * Obține actele cele mai menționate
   */
  async getTopMentionedLaws(startDate, endDate) {
    try {
      const { startDate: validStartDate, endDate: validEndDate } = this._validateDateRange(startDate, endDate);
      const data = await this.analyticsRepository.getTopMentionedLaws(validStartDate, validEndDate);
      return this._formatAnalyticsData(data);
    } catch (error) {
      console.error('Error in AnalyticsService.getTopMentionedLaws:', error);
      throw error;
    }
  }
}

export default AnalyticsService;
