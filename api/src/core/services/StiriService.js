/**
 * Serviciu pentru gestionarea știrilor
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe logica de business pentru știri
 * Respectă principiul Dependency Inversion prin injectarea repository-urilor
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { validationConfig } from '../../config/index.js';

/**
 * Scheme de validare pentru input-uri
 */
const getStiriSchema = z.object({
  limit: z.number().min(1, 'Limita trebuie să fie cel puțin 1').max(validationConfig.maxStiriLimit, `Limita nu poate depăși ${validationConfig.maxStiriLimit}`).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(['id', 'title', 'publication_date', 'created_at']).optional(),
  orderDirection: z.enum(['asc', 'desc']).optional()
});

const createStireSchema = z.object({
  title: z.string().min(1, 'Titlul este obligatoriu').max(500, 'Titlul este prea lung'),
  publication_date: z.string().datetime('Data de publicare trebuie să fie o dată validă'),
  content: z.record(z.any()).refine(data => Object.keys(data).length > 0, 'Conținutul nu poate fi gol')
});

const updateStireSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  publication_date: z.string().datetime().optional(),
  content: z.record(z.any()).optional()
});

/**
 * Serviciu pentru gestionarea știrilor
 */
export class StiriService {
  /**
   * Constructor care primește dependențele prin injecție
   * @param {Object} stiriRepository - Repository-ul pentru știri
   */
  constructor(stiriRepository) {
    this.stiriRepository = stiriRepository;
  }

  /**
   * Obține știrile cu paginare și filtrare
   * @param {Object} options - Opțiunile de paginare și filtrare
   * @param {number} options.limit - Numărul maxim de rezultate
   * @param {number} options.offset - Offset-ul pentru paginare
   * @param {string} options.orderBy - Câmpul pentru sortare
   * @param {string} options.orderDirection - Direcția sortării
   * @returns {Promise<Object>} Lista de știri cu informații de paginare
   */
  async getStiri(options = {}) {
    try {
      // Validare și normalizare input
      const validatedOptions = getStiriSchema.parse({
        limit: options.limit || validationConfig.defaultStiriLimit,
        offset: options.offset || 0,
        orderBy: options.orderBy || 'publication_date',
        orderDirection: options.orderDirection || 'desc'
      });

      // Obține știrile din repository
      const result = await this.stiriRepository.getStiri(validatedOptions);

      // Transformă datele pentru GraphQL
      return {
        stiri: result.stiri.map(stire => this.transformStireForGraphQL(stire)),
        pagination: {
          totalCount: result.totalCount,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
          currentPage: Math.floor(validatedOptions.offset / validatedOptions.limit) + 1,
          totalPages: Math.ceil(result.totalCount / validatedOptions.limit)
        }
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
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
      if (!id || isNaN(Number(id))) {
        throw new GraphQLError('ID invalid pentru știre', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      const stire = await this.stiriRepository.getStireById(Number(id));
      
      if (!stire) {
        return null;
      }

      return this.transformStireForGraphQL(stire);
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
   * Înregistrează o vizualizare pentru o știre
   * @param {number} id - ID știre
   * @param {Object} meta - Metadate request
   * @param {string} meta.ip - IP client
   * @param {string} [meta.userAgent] - User-Agent opțional
   * @param {string} [meta.sessionId] - Session ID opțional
   * @returns {Promise<boolean>} True dacă a fost înregistrată o nouă vizualizare
   */
  async trackStireView(id, { ip, userAgent, sessionId } = {}) {
    try {
      if (!id || isNaN(Number(id))) {
        throw new GraphQLError('ID invalid pentru știre', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      if (!ip || typeof ip !== 'string') {
        throw new GraphQLError('IP invalid pentru tracking vizualizări', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      // Asigură-te că știrea există
      const stire = await this.stiriRepository.getStireById(Number(id));
      if (!stire) {
        throw new GraphQLError('Știrea nu a fost găsită', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      return await this.stiriRepository.trackNewsView(Number(id), {
        ip,
        userAgent,
        sessionId
      });
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la tracking vizualizare', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Returnează cele mai citite știri
   */
  async getMostReadStiri({ period = 'all', limit } = {}) {
    try {
      const normalizedLimit = typeof limit === 'number' && limit > 0 ? limit : validationConfig.defaultStiriLimit;
      const items = await this.stiriRepository.getMostReadStiri({ period, limit: normalizedLimit });
      return {
        stiri: items.map((stire) => this.transformStireForGraphQL(stire))
      };
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
   * Analytics: top entități
   */
  async getTopEntities({ limit = 20 } = {}) {
    try {
      const normalizedLimit = typeof limit === 'number' && limit > 0 ? limit : 20;
      const data = await this.stiriRepository.getTopEntities({ limit: normalizedLimit });
      return data;
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
   * Analytics: top topicuri
   */
  async getTopTopics({ limit = 20 } = {}) {
    try {
      const normalizedLimit = typeof limit === 'number' && limit > 0 ? limit : 20;
      const data = await this.stiriRepository.getTopTopics({ limit: normalizedLimit });
      return data;
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
   * Caută știri după un query text (fuzzy/full-text)
   * - Caută în title și content (JSONB) ignorând markup HTML/chei JSON
   */
  async searchStiri({ query, limit = validationConfig.defaultStiriLimit, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' }) {
    try {
      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        throw new GraphQLError('Query de căutare prea scurt', { extensions: { code: 'VALIDATION_ERROR' } });
      }

      const result = await this.stiriRepository.searchStiri({
        query: query.trim(),
        limit,
        offset,
        orderBy,
        orderDirection
      });

      return {
        stiri: result.stiri.map(stire => this.transformStireForGraphQL(stire)),
        pagination: {
          totalCount: result.totalCount,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(result.totalCount / limit)
        }
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la căutarea știrilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Caută știri după keywords din content JSONB
   * - Filtrează știrile care conțin toate keywords specificate (AND logic)
   */
  async searchStiriByKeywords({ keywords, publicationDateFrom, publicationDateTo, limit = validationConfig.defaultStiriLimit, offset = 0, orderBy = 'publication_date', orderDirection = 'desc' }) {
    try {
      if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new GraphQLError('Lista de keywords este invalidă sau goală', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      const normalizedKeywords = keywords
        .filter(k => typeof k === 'string' && k.trim().length > 0)
        .map(k => k.trim());
      if (normalizedKeywords.length === 0) {
        throw new GraphQLError('Lista de keywords nu conține valori valide', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      // Normalizează și validează intervalul de date (publication_date este de tip DATE în DB)
      const normalizeDateInput = (value) => {
        if (!value) return undefined;
        if (typeof value !== 'string') {
          throw new GraphQLError('Data trebuie să fie un string în format ISO (YYYY-MM-DD sau ISO8601)', {
            extensions: { code: 'VALIDATION_ERROR' }
          });
        }
        const dateOnlyMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
        if (dateOnlyMatch) return value; // deja YYYY-MM-DD
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
          throw new GraphQLError('Formatul datei este invalid. Folosește YYYY-MM-DD sau ISO8601.', {
            extensions: { code: 'VALIDATION_ERROR' }
          });
        }
        // Convertim la data UTC (YYYY-MM-DD) pentru a evita problemele de fus orar
        return parsed.toISOString().slice(0, 10);
      };

      const normalizedFrom = normalizeDateInput(publicationDateFrom);
      const normalizedTo = normalizeDateInput(publicationDateTo);
      if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
        throw new GraphQLError('Intervalul de date este invalid: data de început este după data de sfârșit', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      const result = await this.stiriRepository.searchStiriByKeywords({
        keywords: normalizedKeywords,
        publicationDateFrom: normalizedFrom,
        publicationDateTo: normalizedTo,
        limit,
        offset,
        orderBy,
        orderDirection
      });

      return {
        stiri: result.stiri.map(stire => this.transformStireForGraphQL(stire)),
        pagination: {
          totalCount: result.totalCount,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(result.totalCount / limit)
        }
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la căutarea știrilor după keywords', {
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
      // Validare input
      const validatedData = createStireSchema.parse(stireData);

      // Adaugă timestamp-ul de creare
      const stireToCreate = {
        ...validatedData,
        created_at: new Date().toISOString()
      };

      // Creează știrea în repository
      const createdStire = await this.stiriRepository.createStire(stireToCreate);

      return this.transformStireForGraphQL(createdStire);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
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
      if (!id || isNaN(Number(id))) {
        throw new GraphQLError('ID invalid pentru știre', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      // Validare input
      const validatedData = updateStireSchema.parse(updateData);

      // Verifică dacă știrea există
      const existingStire = await this.stiriRepository.getStireById(Number(id));
      if (!existingStire) {
        throw new GraphQLError('Știrea nu a fost găsită', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      // Adaugă timestamp-ul de actualizare
      const stireToUpdate = {
        ...validatedData,
        updated_at: new Date().toISOString()
      };

      // Actualizează știrea în repository
      const updatedStire = await this.stiriRepository.updateStire(Number(id), stireToUpdate);

      return this.transformStireForGraphQL(updatedStire);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
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
      if (!id || isNaN(Number(id))) {
        throw new GraphQLError('ID invalid pentru știre', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      // Verifică dacă știrea există
      const existingStire = await this.stiriRepository.getStireById(Number(id));
      if (!existingStire) {
        throw new GraphQLError('Știrea nu a fost găsită', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      // Șterge știrea din repository
      await this.stiriRepository.deleteStire(Number(id));

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

  /**
   * Transformă o știre din formatul bazei de date în formatul GraphQL
   * @param {Object} stire - Știrea din baza de date
   * @returns {Object} Știrea în format GraphQL
   */
  transformStireForGraphQL(stire) {
    return {
      id: stire.id,
      title: stire.title,
      publicationDate: stire.publication_date,
      content: stire.content,
      topics: stire.topics,
      entities: stire.entities,
      createdAt: stire.created_at,
      updatedAt: stire.updated_at,
      filename: stire.filename,
      viewCount: stire.view_count ?? 0,
      predictedViews: stire.predicted_views ?? null
    };
  }
}

export default StiriService;
