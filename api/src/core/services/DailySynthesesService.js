/**
 * Service pentru operațiuni cu daily_syntheses
 */

import { GraphQLError } from 'graphql';

export default class DailySynthesesService {
  /**
   * @param {import('../../database/repositories/DailySynthesesRepository.js').DailySynthesesRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Validează data și returnează sinteza de tip detailed pentru acea zi
   * @param {string} dateStr - format YYYY-MM-DD (sau ISO, va fi normalizat)
   */
  async getDetailedByDate(dateStr) {
    const dateISO = this.normalizeDate(dateStr);
    if (!dateISO) {
      throw new GraphQLError('Parametrul date este invalid. Folosește formatul YYYY-MM-DD.', {
        extensions: { code: 'BAD_USER_INPUT' }
      });
    }
    return await this.repository.getDetailedSynthesisByDate(dateISO);
  }

  /**
   * Normalizează o dată arbitrară la format YYYY-MM-DD
   * Acceptă: "YYYY-MM-DD" sau string ISO (ex: 2025-08-21T10:20:00Z)
   * @returns {string|null}
   */
  normalizeDate(dateStr) {
    if (typeof dateStr !== 'string' || dateStr.trim().length === 0) return null;
    // Acceptă deja formatul YYYY-MM-DD
    const simpleMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (simpleMatch) return dateStr;
    // Încearcă să parsezi ISO și extrage partea de dată
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
}


