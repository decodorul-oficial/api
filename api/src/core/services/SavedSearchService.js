/**
 * Serviciu pentru gestionarea căutărilor salvate
 * Respectă principiul Single Responsibility - gestionează logica de business
 */

import { GraphQLError } from 'graphql';
import { validateInput, saveSearchInputSchema, updateSavedSearchInputSchema, savedSearchPaginationSchema } from '../../config/validation.js';

export class SavedSearchService {
  constructor(savedSearchRepository, userService) {
    this.savedSearchRepository = savedSearchRepository;
    this.userService = userService;
  }

  /**
   * Verifică dacă utilizatorul are abonament activ (nu free)
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă are abonament activ
   */
  async hasActiveSubscription(userId) {
    try {
      const userProfile = await this.userService.getUserProfile(userId);
      return userProfile.subscriptionTier !== 'free';
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Salvează o căutare
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} input - Datele căutării
   * @returns {Promise<Object>} Căutarea salvată
   */
  async saveSearch(userId, input) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot salva căutări'
          }
        });
      }

      // Validează input-ul
      const validatedInput = validateInput(saveSearchInputSchema, input);

      // Pregătește datele pentru salvare
      const searchData = {
        user_id: userId,
        name: validatedInput.name,
        description: validatedInput.description || null,
        search_params: validatedInput.searchParams,
        is_favorite: validatedInput.isFavorite || false
      };

      // Salvează căutarea
      const savedSearch = await this.savedSearchRepository.createSavedSearch(searchData);

      return {
        id: savedSearch.id,
        name: savedSearch.name,
        description: savedSearch.description,
        searchParams: savedSearch.search_params,
        isFavorite: savedSearch.is_favorite,
        emailNotificationsEnabled: savedSearch.email_notifications_enabled,
        createdAt: savedSearch.created_at,
        updatedAt: savedSearch.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la salvarea căutării', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține căutările salvate ale unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare și filtrare
   * @returns {Promise<Object>} Lista de căutări salvate
   */
  async getSavedSearches(userId, options = {}) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot accesa căutările salvate'
          }
        });
      }

      // Validează opțiunile de paginare
      const validatedOptions = validateInput(savedSearchPaginationSchema, options);

      // Obține căutările salvate
      const result = await this.savedSearchRepository.getSavedSearches(userId, validatedOptions);

      // Formatează rezultatul
      return {
        savedSearches: result.savedSearches.map(search => ({
          id: search.id,
          name: search.name,
          description: search.description,
          searchParams: search.search_params,
          isFavorite: search.is_favorite,
          emailNotificationsEnabled: search.email_notifications_enabled,
          createdAt: search.created_at,
          updatedAt: search.updated_at
        })),
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
      throw new GraphQLError('Eroare internă la obținerea căutărilor salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține o căutare salvată după ID
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} searchId - ID-ul căutării
   * @returns {Promise<Object|null>} Căutarea salvată sau null
   */
  async getSavedSearchById(userId, searchId) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot accesa căutările salvate'
          }
        });
      }

      // Obține căutarea
      const search = await this.savedSearchRepository.getSavedSearchById(searchId, userId);
      if (!search) {
        return null;
      }

      return {
        id: search.id,
        name: search.name,
        description: search.description,
        searchParams: search.search_params,
        isFavorite: search.is_favorite,
        emailNotificationsEnabled: search.email_notifications_enabled,
        createdAt: search.created_at,
        updatedAt: search.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează o căutare salvată
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} searchId - ID-ul căutării
   * @param {Object} input - Datele de actualizare
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async updateSavedSearch(userId, searchId, input) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot actualiza căutările salvate'
          }
        });
      }

      // Validează input-ul
      const validatedInput = validateInput(updateSavedSearchInputSchema, input);

      // Actualizează căutarea
      const updatedSearch = await this.savedSearchRepository.updateSavedSearch(searchId, userId, validatedInput);

      return {
        id: updatedSearch.id,
        name: updatedSearch.name,
        description: updatedSearch.description,
        searchParams: updatedSearch.search_params,
        isFavorite: updatedSearch.is_favorite,
        emailNotificationsEnabled: updatedSearch.email_notifications_enabled,
        createdAt: updatedSearch.created_at,
        updatedAt: updatedSearch.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Șterge o căutare salvată
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} searchId - ID-ul căutării
   * @returns {Promise<boolean>} True dacă a fost ștearsă
   */
  async deleteSavedSearch(userId, searchId) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot șterge căutările salvate'
          }
        });
      }

      // Șterge căutarea
      return await this.savedSearchRepository.deleteSavedSearch(searchId, userId);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la ștergerea căutării salvate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Comută statusul de favorit pentru o căutare salvată
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} searchId - ID-ul căutării
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async toggleFavoriteSearch(userId, searchId) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot gestiona favoritele'
          }
        });
      }

      // Comută statusul de favorit
      const updatedSearch = await this.savedSearchRepository.toggleFavoriteSearch(searchId, userId);

      return {
        id: updatedSearch.id,
        name: updatedSearch.name,
        description: updatedSearch.description,
        searchParams: updatedSearch.search_params,
        isFavorite: updatedSearch.is_favorite,
        emailNotificationsEnabled: updatedSearch.email_notifications_enabled,
        createdAt: updatedSearch.created_at,
        updatedAt: updatedSearch.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la comutarea statusului de favorit', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Activează/dezactivează notificările email pentru o căutare salvată
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} searchId - ID-ul căutării
   * @param {boolean} enabled - Starea notificărilor
   * @returns {Promise<Object>} Căutarea actualizată
   */
  async toggleEmailNotifications(userId, searchId, enabled) {
    try {
      // Verifică abonamentul
      const hasSubscription = await this.hasActiveSubscription(userId);
      if (!hasSubscription) {
        throw new GraphQLError('Această funcționalitate necesită un abonament activ', {
          extensions: { 
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Doar utilizatorii cu abonament Pro sau Enterprise pot gestiona notificările email'
          }
        });
      }

      // Dacă se încearcă activarea, verifică limita
      if (enabled) {
        const canEnable = await this.canEnableEmailNotifications(userId);
        if (!canEnable) {
          const limit = await this.getEmailNotificationLimit(userId);
          throw new GraphQLError(`Ai atins limita de ${limit} notificări email active pentru abonamentul tău`, {
            extensions: { 
              code: 'EMAIL_NOTIFICATION_LIMIT_REACHED',
              message: `Limita pentru abonamentul tău este de ${limit} notificări email active`
            }
          });
        }
      }

      // Comută notificările email
      const updatedSearch = await this.savedSearchRepository.toggleEmailNotifications(searchId, userId, enabled);

      return {
        id: updatedSearch.id,
        name: updatedSearch.name,
        description: updatedSearch.description,
        searchParams: updatedSearch.search_params,
        isFavorite: updatedSearch.is_favorite,
        emailNotificationsEnabled: updatedSearch.email_notifications_enabled,
        createdAt: updatedSearch.created_at,
        updatedAt: updatedSearch.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la comutarea notificărilor email', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Verifică dacă utilizatorul poate activa mai multe notificări email
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă poate activa
   */
  async canEnableEmailNotifications(userId) {
    try {
      const { data, error } = await this.savedSearchRepository.supabase.rpc('check_email_notification_limit', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error checking email notification limit:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error checking email notification limit:', error);
      return false;
    }
  }

  /**
   * Obține limita de notificări email pentru utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Limita de notificări
   */
  async getEmailNotificationLimit(userId) {
    try {
      const { data, error } = await this.savedSearchRepository.supabase.rpc('get_user_email_notification_limit', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error getting email notification limit:', error);
        return 0;
      }

      return data || 0;
    } catch (error) {
      console.error('Error getting email notification limit:', error);
      return 0;
    }
  }

  /**
   * Obține numărul curent de notificări email active pentru utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Numărul de notificări active
   */
  async getCurrentEmailNotificationsCount(userId) {
    try {
      return await this.savedSearchRepository.getActiveEmailNotificationsCount(userId);
    } catch (error) {
      console.error('Error getting current email notifications count:', error);
      return 0;
    }
  }

  /**
   * Obține informații despre notificările email pentru utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Informații despre notificări
   */
  async getEmailNotificationInfo(userId) {
    try {
      const [limit, currentCount] = await Promise.all([
        this.getEmailNotificationLimit(userId),
        this.getCurrentEmailNotificationsCount(userId)
      ]);

      return {
        limit,
        currentCount,
        canEnableMore: currentCount < limit,
        remaining: Math.max(0, limit - currentCount)
      };
    } catch (error) {
      console.error('Error getting email notification info:', error);
      return {
        limit: 0,
        currentCount: 0,
        canEnableMore: false,
        remaining: 0
      };
    }
  }
}
