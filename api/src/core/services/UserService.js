/**
 * Serviciu pentru gestionarea utilizatorilor
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe logica de business pentru utilizatori
 * Respectă principiul Dependency Inversion prin injectarea repository-urilor
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';

/**
 * Scheme de validare pentru input-uri
 */
const signUpSchema = z.object({
  email: z.string().email('Email invalid'),
  password: z.string().min(6, 'Parola trebuie să aibă cel puțin 6 caractere')
});

const signInSchema = z.object({
  email: z.string().email('Email invalid'),
  password: z.string().min(1, 'Parola este obligatorie')
});

/**
 * Serviciu pentru gestionarea utilizatorilor
 */
export class UserService {
  /**
   * Constructor care primește dependențele prin injecție
   * @param {Object} supabaseClient - Clientul Supabase
   * @param {Object} userRepository - Repository-ul pentru utilizatori
   */
  constructor(supabaseClient, userRepository) {
    this.supabase = supabaseClient;
    this.userRepository = userRepository;
  }

  /**
   * Gestionează înregistrarea unui utilizator nou
   * @param {Object} credentials - Credențialele de înregistrare
   * @param {string} credentials.email - Email-ul utilizatorului
   * @param {string} credentials.password - Parola utilizatorului
   * @returns {Promise<Object>} Răspunsul de autentificare cu token și user
   */
  async handleSignUp({ email, password }) {
    try {
      // Validare input
      const validatedData = signUpSchema.parse({ email, password });

      // Creează utilizatorul folosind Admin API (service_role)
      const { data: createdUser, error: createError } = await this.supabase.auth.admin.createUser({
        email: validatedData.email,
        password: validatedData.password,
        email_confirm: true
      });

      if (createError) {
        throw new GraphQLError(`Eroare la înregistrare: ${createError.message}`, {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      if (!createdUser?.user) {
        throw new GraphQLError('Nu s-a putut crea utilizatorul', {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      // În unele proiecte trigger-ul DB creează profilul automat.
      // Pentru robustețe, nu eșuăm dacă profilul nu există încă; folosim fallback 'free'.
      let profile = null;
      try {
        profile = await this.userRepository.getProfileById(createdUser.user.id);
      } catch (_) {
        // Ignorăm erorile de citire profil aici
      }

      // Generează sesiune după creare (deoarece Admin API nu returnează session)
      const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password
      });

      if (signInError) {
        // Dacă autentificarea eșuează (politici proiect), întoarcem user fără token
        return {
          token: '',
          user: {
            id: createdUser.user.id,
            email: createdUser.user.email,
            profile: {
              id: profile?.id || createdUser.user.id,
              subscriptionTier: profile?.subscription_tier || 'free'
            }
          }
        };
      }

      return {
        token: signInData.session?.access_token || '',
        user: {
          id: createdUser.user.id,
          email: createdUser.user.email,
          profile: {
            id: profile?.id || createdUser.user.id,
            subscriptionTier: profile?.subscription_tier || 'free'
          }
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
      throw new GraphQLError('Eroare internă la înregistrare', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Gestionează autentificarea unui utilizator
   * @param {Object} credentials - Credențialele de autentificare
   * @param {string} credentials.email - Email-ul utilizatorului
   * @param {string} credentials.password - Parola utilizatorului
   * @returns {Promise<Object>} Răspunsul de autentificare cu token și user
   */
  async handleSignIn({ email, password }) {
    try {
      // Validare input
      const validatedData = signInSchema.parse({ email, password });

      // Autentificare în Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password
      });

      if (authError) {
        throw new GraphQLError(`Eroare la autentificare: ${authError.message}`, {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      if (!authData.user) {
        throw new GraphQLError('Credențiale invalide', {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      // Obține profilul utilizatorului
      const profile = await this.userRepository.getProfileById(authData.user.id);
      
      if (!profile) {
        // Creează profil dacă nu există (pentru compatibilitate cu utilizatori existenți)
        await this.userRepository.createProfile(authData.user.id);
      }

      return {
        token: authData.session?.access_token,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          profile: {
            id: profile?.id || authData.user.id,
            subscriptionTier: profile?.subscription_tier || 'free'
          }
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
      throw new GraphQLError('Eroare internă la autentificare', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Validează un token JWT și returnează utilizatorul
   * @param {string} token - Token-ul JWT de validat
   * @returns {Promise<Object|null>} Utilizatorul validat sau null
   */
  async validateToken(token) {
    try {
      if (!token) {
        return null;
      }

      const { data: { user }, error } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      // Obține profilul utilizatorului
      const profile = await this.userRepository.getProfileById(user.id);

      return {
        id: user.id,
        email: user.email,
        profile: {
          id: profile?.id || user.id,
          subscriptionTier: profile?.subscription_tier || 'free'
        }
      };
    } catch (error) {
      console.error('Eroare la validarea token-ului:', error);
      return null;
    }
  }

  /**
   * Obține profilul complet al unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object|null>} Profilul complet sau null
   */
  async getUserProfile(userId) {
    try {
      const profile = await this.userRepository.getProfileById(userId);
      
      if (!profile) {
        return null;
      }

      return {
        id: profile.id,
        subscriptionTier: profile.subscription_tier,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea profilului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează profilul unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} updateData - Datele de actualizat
   * @returns {Promise<Object>} Profilul actualizat
   */
  async updateUserProfile(userId, updateData) {
    try {
      // Validare că utilizatorul nu încearcă să actualizeze câmpuri restricționate
      const allowedFields = ['subscription_tier'];
      const filteredData = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {});

      if (Object.keys(filteredData).length === 0) {
        throw new GraphQLError('Nu sunt câmpuri valide de actualizat', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      const updatedProfile = await this.userRepository.updateProfile(userId, filteredData);

      return {
        id: updatedProfile.id,
        subscriptionTier: updatedProfile.subscription_tier,
        createdAt: updatedProfile.created_at,
        updatedAt: updatedProfile.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea profilului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține preferințele unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Preferințele utilizatorului
   */
  async getUserPreferences(userId) {
    try {
      const preferences = await this.userRepository.getUserPreferences(userId);
      
      if (!preferences) {
        // Returnează preferințe default dacă nu există
        return {
          preferredCategories: [],
          notificationSettings: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      return {
        preferredCategories: preferences.preferred_categories || [],
        notificationSettings: preferences.notification_settings || {},
        createdAt: preferences.created_at,
        updatedAt: preferences.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea preferințelor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează preferințele unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} preferences - Preferințele de actualizat
   * @param {Array} preferences.preferredCategories - Categoriile preferate
   * @param {Object} preferences.notificationSettings - Setările de notificare
   * @returns {Promise<Object>} Preferințele actualizate
   */
  async updateUserPreferences(userId, preferences) {
    try {
      // Validare input
      if (!preferences.preferredCategories || !Array.isArray(preferences.preferredCategories)) {
        throw new GraphQLError('Categoriile preferate trebuie să fie un array', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      const updatedPreferences = await this.userRepository.updateUserPreferences(userId, preferences);

      return {
        preferredCategories: updatedPreferences.preferred_categories || [],
        notificationSettings: updatedPreferences.notification_settings || {},
        createdAt: updatedPreferences.created_at,
        updatedAt: updatedPreferences.updated_at
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea preferințelor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține știrile personalizate pentru un utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiunile de paginare și sortare
   * @returns {Promise<Object>} Știrile personalizate cu paginare
   */
  async getPersonalizedStiri(userId, options = {}) {
    try {
      const result = await this.userRepository.getPersonalizedStiri(userId, options);

      return {
        stiri: result.stiri.map(stire => this.transformStireForGraphQL(stire)),
        pagination: {
          totalCount: result.totalCount,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
          currentPage: Math.floor((options.offset || 0) / (options.limit || 10)) + 1,
          totalPages: Math.ceil(result.totalCount / (options.limit || 10))
        }
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la preluarea știrilor personalizate', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Transformă o știre din formatul bazei de date în formatul GraphQL
   * @param {Object} stire - Știrea din baza de date
   * @returns {Object} Știrea transformată pentru GraphQL
   */
  transformStireForGraphQL(stire) {
    return {
      id: stire.id.toString(),
      title: stire.title,
      publicationDate: stire.publication_date,
      content: stire.content,
      topics: stire.topics || [],
      entities: stire.entities || [],
      createdAt: stire.created_at,
      updatedAt: stire.updated_at,
      filename: stire.filename,
      viewCount: stire.view_count || 0,
      predictedViews: stire.predicted_views
    };
  }
}

export default UserService;
