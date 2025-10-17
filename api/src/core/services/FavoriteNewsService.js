/**
 * Serviciu pentru gestionarea știrilor favorite ale utilizatorilor
 * Respectă principiul Single Responsibility prin focusarea doar pe logica de business pentru știrile favorite
 * Respectă principiul Dependency Inversion prin injectarea repository-urilor
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';

/**
 * Scheme de validare pentru input-uri
 */
const newsIdSchema = z.string().min(1, 'News ID is required');
const userIdSchema = z.string().uuid('Invalid user ID');
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['created_at', 'updated_at']).default('created_at'),
  orderDirection: z.enum(['ASC', 'DESC']).default('DESC')
});

/**
 * Serviciu pentru gestionarea știrilor favorite
 */
export class FavoriteNewsService {
  /**
   * Constructor care primește dependențele prin injecție
   * @param {Object} favoriteNewsRepository - Repository-ul pentru știrile favorite
   * @param {Object} subscriptionService - Serviciul pentru abonamente
   * @param {Object} userService - Serviciul pentru utilizatori
   */
  constructor(favoriteNewsRepository, subscriptionService, userService) {
    this.favoriteNewsRepository = favoriteNewsRepository;
    this.subscriptionService = subscriptionService;
    this.userService = userService;
  }

  /**
   * Verifică dacă utilizatorul are acces la funcționalitatea de știri favorite
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă utilizatorul are acces
   */
  async hasAccessToFavorites(userId) {
    try {
      // Verifică dacă utilizatorul are abonament activ
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      if (subscription && subscription.status === 'ACTIVE') {
        return true;
      }

      // Verifică dacă utilizatorul este în trial
      const trialStatus = await this.userService.checkTrialStatus(userId);
      if (trialStatus && trialStatus.isTrial) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('FavoriteNewsService.hasAccessToFavorites error:', error);
      return false;
    }
  }

  /**
   * Adaugă o știre la favoritele utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} newsId - ID-ul știrii
   * @returns {Promise<Object>} Știrea adăugată la favorite
   */
  async addFavoriteNews(userId, newsId) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);
      const validatedNewsId = newsIdSchema.parse(newsId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Pentru a salva știri ca favorite, aveți nevoie de un abonament activ sau trial.'
          }
        });
      }

      // Verifică dacă știrea există
      const validNewsIds = await this.favoriteNewsRepository.validateNewsIds([validatedNewsId]);
      if (validNewsIds.length === 0) {
        throw new GraphQLError('Știrea nu există', {
          extensions: { code: 'NEWS_NOT_FOUND' }
        });
      }

      // Verifică dacă știrea nu este deja în favorite
      const isAlreadyFavorite = await this.favoriteNewsRepository.isFavoriteNews(validatedUserId, validatedNewsId);
      if (isAlreadyFavorite) {
        throw new GraphQLError('Știrea este deja în favoritele dumneavoastră', {
          extensions: { code: 'ALREADY_FAVORITE' }
        });
      }

      // Adaugă știrea la favorite
      const favoriteNews = await this.favoriteNewsRepository.addFavoriteNews(validatedUserId, validatedNewsId);

      return {
        id: favoriteNews.id,
        userId: favoriteNews.user_id,
        newsId: favoriteNews.news_id,
        createdAt: favoriteNews.created_at,
        updatedAt: favoriteNews.updated_at
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
      throw new GraphQLError('Eroare internă la adăugarea știrii la favorite', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
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
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);
      const validatedNewsId = newsIdSchema.parse(newsId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Pentru a gestiona știrile favorite, aveți nevoie de un abonament activ sau trial.'
          }
        });
      }

      // Verifică dacă știrea este în favorite
      const isFavorite = await this.favoriteNewsRepository.isFavoriteNews(validatedUserId, validatedNewsId);
      if (!isFavorite) {
        throw new GraphQLError('Știrea nu este în favoritele dumneavoastră', {
          extensions: { code: 'NOT_FAVORITE' }
        });
      }

      // Șterge știrea din favorite
      await this.favoriteNewsRepository.removeFavoriteNews(validatedUserId, validatedNewsId);

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la ștergerea știrii din favorite', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Comută statusul unei știri în favorite (adaugă dacă nu este, șterge dacă este)
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} newsId - ID-ul știrii
   * @returns {Promise<Object>} Rezultatul operației
   */
  async toggleFavoriteNews(userId, newsId) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);
      const validatedNewsId = newsIdSchema.parse(newsId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Pentru a gestiona știrile favorite, aveți nevoie de un abonament activ sau trial.'
          }
        });
      }

      // Verifică dacă știrea există
      const validNewsIds = await this.favoriteNewsRepository.validateNewsIds([validatedNewsId]);
      if (validNewsIds.length === 0) {
        throw new GraphQLError('Știrea nu există', {
          extensions: { code: 'NEWS_NOT_FOUND' }
        });
      }

      // Verifică dacă știrea este deja în favorite
      const isFavorite = await this.favoriteNewsRepository.isFavoriteNews(validatedUserId, validatedNewsId);

      if (isFavorite) {
        // Șterge din favorite
        await this.favoriteNewsRepository.removeFavoriteNews(validatedUserId, validatedNewsId);
        return {
          action: 'removed',
          isFavorite: false,
          message: 'Știrea a fost ștearsă din favorite'
        };
      } else {
        // Adaugă la favorite
        const favoriteNews = await this.favoriteNewsRepository.addFavoriteNews(validatedUserId, validatedNewsId);
        return {
          action: 'added',
          isFavorite: true,
          message: 'Știrea a fost adăugată la favorite',
          favoriteNews: {
            id: favoriteNews.id,
            userId: favoriteNews.user_id,
            newsId: favoriteNews.news_id,
            createdAt: favoriteNews.created_at,
            updatedAt: favoriteNews.updated_at
          }
        };
      }
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la comutarea statusului știrii în favorite', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare și sortare
   * @returns {Promise<Object>} Știrile favorite cu informații de paginare
   */
  async getFavoriteNews(userId, options = {}) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);
      const validatedOptions = paginationSchema.parse(options);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Pentru a vizualiza știrile favorite, aveți nevoie de un abonament activ sau trial.'
          }
        });
      }

      // Obține știrile favorite
      const result = await this.favoriteNewsRepository.getFavoriteNews(validatedUserId, validatedOptions);

      return {
        favoriteNews: result.favoriteNews.map(item => ({
          id: item.id,
          userId: item.user_id,
          newsId: item.news_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          // News properties from joined stiri table
          title: item.stiri?.title || '',
          publicationDate: item.stiri?.publication_date || '',
          viewCount: item.stiri?.view_count || 0,
          summary: item.stiri?.content?.summary || null
        })),
        pagination: result.pagination
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
      throw new GraphQLError('Eroare internă la preluarea știrilor favorite', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține doar ID-urile știrilor favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Array<string>>} Array cu ID-urile știrilor favorite
   */
  async getFavoriteNewsIds(userId) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        // Returnează array gol pentru utilizatorii fără acces
        return [];
      }

      // Obține ID-urile știrilor favorite
      const favoriteNewsIds = await this.favoriteNewsRepository.getFavoriteNewsIds(validatedUserId);

      return favoriteNewsIds;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      console.error('FavoriteNewsService.getFavoriteNewsIds error:', error);
      // Returnează array gol în caz de eroare pentru a nu bloca alte funcționalități
      return [];
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
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);
      const validatedNewsId = newsIdSchema.parse(newsId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        return false;
      }

      // Verifică dacă știrea este în favorite
      const isFavorite = await this.favoriteNewsRepository.isFavoriteNews(validatedUserId, validatedNewsId);

      return isFavorite;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      console.error('FavoriteNewsService.isFavoriteNews error:', error);
      // Returnează false în caz de eroare pentru a nu bloca alte funcționalități
      return false;
    }
  }

  /**
   * Șterge toate știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă toate știrile au fost șterse cu succes
   */
  async clearAllFavoriteNews(userId) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ sau trial', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Pentru a gestiona știrile favorite, aveți nevoie de un abonament activ sau trial.'
          }
        });
      }

      // Șterge toate știrile favorite
      await this.favoriteNewsRepository.clearAllFavoriteNews(validatedUserId);

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la ștergerea tuturor știrilor favorite', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține statistici despre știrile favorite ale utilizatorului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Statistici despre știrile favorite
   */
  async getFavoriteNewsStats(userId) {
    try {
      // Validare input
      const validatedUserId = userIdSchema.parse(userId);

      // Verifică dacă utilizatorul are acces la funcționalitatea
      const hasAccess = await this.hasAccessToFavorites(validatedUserId);
      if (!hasAccess) {
        return {
          totalFavorites: 0,
          latestFavoriteDate: null
        };
      }

      // Obține statisticile
      const stats = await this.favoriteNewsRepository.getFavoriteNewsStats(validatedUserId);

      return stats;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0].message}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      console.error('FavoriteNewsService.getFavoriteNewsStats error:', error);
      // Returnează statistici default în caz de eroare
      return {
        totalFavorites: 0,
        latestFavoriteDate: null
      };
    }
  }
}

export default FavoriteNewsService;
