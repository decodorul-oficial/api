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
  limit: z.number().min(1).max(validationConfig.maxStiriLimit).optional(),
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
      createdAt: stire.created_at,
      updatedAt: stire.updated_at
    };
  }
}

export default StiriService;
