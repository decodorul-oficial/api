/**
 * Serviciu pentru gestionarea utilizatorilor
 * Respectă principiul Single Responsibility Principle prin focusarea doar pe logica de business pentru utilizatori
 * Respectă principiul Dependency Inversion prin injectarea repository-urilor
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { decryptPassword, isEncryptedPassword } from '../../utils/crypto.js';
import { supabaseConfig } from '../../config/index.js';

/**
 * Scheme de validare pentru input-uri
 */
const signUpSchema = z.object({
  email: z.string().email('Email invalid'),
  password: z.string().min(1, 'Parola este obligatorie')
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
   * @param {Object} supabaseClient - Clientul Supabase cu service key pentru operațiuni DB
   * @param {Object} userRepository - Repository-ul pentru utilizatori
   * @param {Object} newsletterService - Serviciul pentru newsletter
   */
  constructor(supabaseClient, userRepository, newsletterService) {
    this.supabase = supabaseClient; // Client cu service key pentru operațiuni DB
    this.userRepository = userRepository;
    this.newsletterService = newsletterService;
  }

  /**
   * Client efemer cu anon key pentru password grant.
   * Nu folosim service_role + signOut: signOut invalidează refresh token-ul
   * și setSession pe frontend eșuează („Auth session missing”).
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  _createAuthGrantClient() {
    if (!supabaseConfig.anonKey) {
      throw new GraphQLError('SUPABASE_ANON_KEY lipsește din configurația API', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
    return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  /**
   * signInWithPassword pe clientul service_role lasă JWT-ul userului pe singleton.
   * Apoi RLS tratează request-urile ca `authenticated` (nu service_role) — ex. blochează
   * newsletter_subscribers. Curățăm sesiunea locală imediat după ce am extras token-ul.
   *
   * Notă: pentru login/signup folosește `_createAuthGrantClient()` — nu apela signOut
   * pe sesiunea care trebuie returnată clientului.
   */
  async _clearServiceAuthSession() {
    try {
      await this.supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('Failed to clear service-client auth session:', error?.message || error);
    }
  }

  /**
   * Procesează parola - decriptează dacă este criptată, altfel o returnează ca atare
   * @param {string} password - Parola de procesat
   * @param {boolean} isSignUp - Dacă este pentru înregistrare (necesită validare strictă)
   * @returns {string} Parola procesată (decriptată sau originală)
   */
  processPassword(password, isSignUp = false) {
    try {
      let processedPassword;
      //console.log('🔍 Parola primită:', password);
      // Verifică dacă parola este criptată
      if (isEncryptedPassword(password)) {
        processedPassword = decryptPassword(password);
      } else {
        console.log('ℹ️ Parola primită nu este criptată, o folosesc direct');
        processedPassword = password;
      }

      // Validare strictă pentru înregistrare
      if (isSignUp) {
        const passwordValidation = z.string()
          .min(8, 'Parola trebuie să aibă cel puțin 8 caractere')
          .max(128, 'Parola nu poate depăși 128 de caractere')
          .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
            'Parola trebuie să conțină cel puțin o literă mică, o literă mare, o cifră și un caracter special'
          );
        
        passwordValidation.parse(processedPassword);
      }

      return processedPassword;
    } catch (error) {
      console.error('Eroare la procesarea parolei:', error.message);
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare a parolei: ${error.errors[0].message}`, {
          extensions: { code: 'PASSWORD_VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare la procesarea parolei de autentificare', {
        extensions: { code: 'PASSWORD_PROCESSING_ERROR' }
      });
    }
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

      // Procesează parola (decriptează dacă este criptată) cu validare strictă pentru înregistrare
      const processedPassword = this.processPassword(validatedData.password, true);

      // Creează utilizatorul folosind Admin API (service_role)
      const { data: createdUser, error: createError } = await this.supabase.auth.admin.createUser({
        email: validatedData.email,
        password: processedPassword,
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

      // Set up 14-day trial for new users
      await this.setupTrialForNewUser(createdUser.user.id);

      // Generează sesiune după creare (deoarece Admin API nu returnează session)
      const authGrantClient = this._createAuthGrantClient();
      const { data: signInData, error: signInError } = await authGrantClient.auth.signInWithPassword({
        email: validatedData.email,
        password: processedPassword
      });
      const sessionToken = signInData?.session?.access_token || '';
      const refreshToken = signInData?.session?.refresh_token || '';

      if (signInError) {
        // Dacă autentificarea eșuează (politici proiect), întoarcem user fără token
        return {
          token: '',
          refreshToken: '',
          user: {
            id: createdUser.user.id,
            email: createdUser.user.email,
            profile: {
              id: profile?.id || createdUser.user.id,
              subscriptionTier: profile?.subscription_tier || 'free',
              displayName: profile?.display_name,
              avatarUrl: profile?.avatar_url,
              createdAt: profile?.created_at || new Date().toISOString(),
              updatedAt: profile?.updated_at || new Date().toISOString()
            }
          }
        };
      }

      return {
        token: sessionToken,
        refreshToken,
        user: {
          id: createdUser.user.id,
          email: createdUser.user.email,
          profile: {
            id: profile?.id || createdUser.user.id,
            subscriptionTier: profile?.subscription_tier || 'free',
            displayName: profile?.display_name,
            avatarUrl: profile?.avatar_url,
            createdAt: profile?.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString()
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

      // Procesează parola (decriptează dacă este criptată) fără validare strictă pentru autentificare
      const processedPassword = this.processPassword(validatedData.password, false);

      // Autentificare în Supabase Auth (client anon efemer — nu invalida refresh token)
      const authGrantClient = this._createAuthGrantClient();
      const { data: authData, error: authError } = await authGrantClient.auth.signInWithPassword({
        email: validatedData.email,
        password: processedPassword
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

      const sessionToken = authData.session?.access_token;
      const refreshToken = authData.session?.refresh_token || '';

      // Obține profilul utilizatorului
      const profile = await this.userRepository.getProfileById(authData.user.id);
      
      if (!profile) {
        // Creează profil dacă nu există (pentru compatibilitate cu utilizatori existenți)
        await this.userRepository.createProfile(authData.user.id);
      }

      return {
        token: sessionToken,
        refreshToken,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          profile: {
            id: profile?.id || authData.user.id,
            subscriptionTier: profile?.subscription_tier || 'free',
            displayName: profile?.display_name,
            avatarUrl: profile?.avatar_url,
            createdAt: profile?.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString()
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
   * Schimbă parola pentru utilizatorul autentificat
   * 1) Verifică parola curentă printr-un sign-in dedicat
   * 2) Validează și setează noua parolă via Admin API
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} email - Email-ul utilizatorului
   * @param {{ currentPassword: string, newPassword: string }} input - Parolele
   * @returns {Promise<boolean>} True dacă operațiunea a reușit
   */
  async changePassword(userId, email, { currentPassword, newPassword }) {
    try {
      if (!userId || !email) {
        throw new GraphQLError('Utilizator invalid pentru schimbarea parolei', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      // 1) Procesează parolele (decriptează dacă vin criptate)
      const processedCurrentPassword = this.processPassword(currentPassword, false);
      const processedNewPassword = this.processPassword(newPassword, true); // validare strictă ca la signUp

      // 2) Verifică parola curentă prin sign-in pe client anon efemer
      const authGrantClient = this._createAuthGrantClient();
      const { error: verifyError } = await authGrantClient.auth.signInWithPassword({
        email,
        password: processedCurrentPassword
      });

      if (verifyError) {
        throw new GraphQLError('Parola curentă este incorectă', {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      // 3) Actualizează parola via Admin API (necesită service_role)
      const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
        password: processedNewPassword
      });

      if (updateError) {
        throw new GraphQLError(`Eroare la schimbarea parolei: ${updateError.message}`, {
          extensions: { code: 'AUTH_ERROR' }
        });
      }

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la schimbarea parolei', {
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

      // Încearcă să valideze token-ul cu Supabase Auth
      try {
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        
        if (!error && user) {
          // Obține profilul utilizatorului
          const profile = await this.userRepository.getProfileById(user.id);
          
        return {
          id: user.id,
          email: user.email,
          profile: {
            id: profile?.id || user.id,
            subscriptionTier: profile?.subscription_tier || 'free',
            displayName: profile?.display_name,
            avatarUrl: profile?.avatar_url,
            createdAt: profile?.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString()
          }
        };
        }
      } catch (authError) {
        console.log('Supabase auth validation failed, trying manual JWT decode:', authError.message);
      }

      // Fallback: decodifică manual JWT-ul pentru a extrage informațiile utilizatorului
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          console.log('Invalid JWT format');
          return null;
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        // Verifică dacă token-ul este valid și nu a expirat
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          console.log('Token expired');
          return null;
        }

        // Verifică dacă este pentru utilizator autentificat
        if (payload.role !== 'authenticated' || !payload.sub) {
          console.log('Token not for authenticated user');
          return null;
        }

        // Obține profilul utilizatorului
        const profile = await this.userRepository.getProfileById(payload.sub);

        return {
          id: payload.sub,
          email: payload.email,
          profile: {
            id: profile?.id || payload.sub,
            subscriptionTier: profile?.subscription_tier || 'free',
            displayName: profile?.display_name,
            avatarUrl: profile?.avatar_url,
            createdAt: profile?.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString()
          }
        };
      } catch (jwtError) {
        console.error('JWT decode error:', jwtError.message);
        return null;
      }
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
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at || new Date().toISOString(),
        updatedAt: profile.updated_at || new Date().toISOString()
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
      const allowedFields = ['subscriptionTier', 'displayName', 'avatarUrl'];
      const filteredData = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          // Transformă câmpurile din camelCase în snake_case pentru baza de date
          if (key === 'subscriptionTier') {
            obj['subscription_tier'] = updateData[key];
          } else if (key === 'displayName') {
            obj['display_name'] = updateData[key];
          } else if (key === 'avatarUrl') {
            obj['avatar_url'] = updateData[key];
          }
          return obj;
        }, {});

      if (Object.keys(filteredData).length === 0) {
        throw new GraphQLError('Nu sunt câmpuri valide de actualizat', {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }

      // Actualizează profilul în tabela profiles
      const updatedProfile = await this.userRepository.updateProfile(userId, filteredData);

      // Dacă s-a actualizat display_name, sincronizează cu Supabase Auth
      if (updateData.displayName !== undefined) {
        try {
          await this.syncDisplayNameToAuth(userId, updateData.displayName);
        } catch (authError) {
          // Log eroarea dar nu întrerupe procesul principal
          console.warn(`Eroare la sincronizarea display_name cu Auth pentru utilizatorul ${userId}:`, authError.message);
        }
      }

      return {
        id: updatedProfile.id,
        subscriptionTier: updatedProfile.subscription_tier,
        displayName: updatedProfile.display_name,
        avatarUrl: updatedProfile.avatar_url,
        createdAt: updatedProfile.created_at || new Date().toISOString(),
        updatedAt: updatedProfile.updated_at || new Date().toISOString()
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
          professionPackId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      return {
        preferredCategories: preferences.preferred_categories || [],
        notificationSettings: preferences.notification_settings || {},
        professionPackId: preferences.profession_pack_id || null,
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
        stiri: result.stiri.map(stire => this.transformStireForGraphQL(stire, { preview: true })),
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
   * @param {{ preview?: boolean }} [options]
   * @returns {Object} Știrea transformată pentru GraphQL
   */
  transformStireForGraphQL(stire, { preview = false } = {}) {
    const content = stire.content && typeof stire.content === 'object' ? stire.content : {};
    let previewContent = content;
    if (preview) {
      const summarySource = content.summary || content.text || content.body || '';
      const summary = typeof summarySource === 'string'
        ? summarySource.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900)
        : '';
      previewContent = {
        summary,
        act: content.act || content.actName,
        actName: content.actName,
        partea: content.partea,
        monitorulOficial: content.monitorulOficial,
        moNumberDate: content.moNumberDate,
        sourceUrl: content.sourceUrl,
        url: content.url,
        lucide_icon: content.lucide_icon,
        lucideIcon: content.lucideIcon,
        category: content.category,
        keywords: content.keywords,
      };
    }

    return {
      id: stire.id.toString(),
      title: stire.title,
      publicationDate: stire.publication_date,
      content: previewContent,
      topics: preview ? undefined : (stire.topics || []),
      entities: preview ? undefined : (stire.entities || []),
      createdAt: stire.created_at,
      updatedAt: stire.updated_at,
      filename: stire.filename,
      viewCount: stire.view_count || 0,
      predictedViews: stire.predicted_views,
      category: stire.category
    };
  }

  /**
   * Set up 14-day trial for new user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async setupTrialForNewUser(userId) {
    try {
      console.log(`🔧 Setting up trial for user: ${userId}`);
      
      // Use RPC function to set up trial (handles schema issues)
      console.log('📞 Calling setup_trial_for_new_user RPC function...');
      const { data: result, error: rpcError } = await this.supabase
        .rpc('setup_trial_for_new_user', { user_id_param: userId });
      
      if (rpcError) {
        console.error('❌ Error calling RPC function:', rpcError);
        throw new Error(`Failed to call setup_trial_for_new_user: ${rpcError.message}`);
      }
      
      if (!result || !result.success) {
        console.error('❌ RPC function returned error:', result);
        throw new Error(`Trial setup failed: ${result?.error || 'Unknown error'}`);
      }
      
      console.log('✅ Trial setup completed successfully via RPC:', {
        subscription_id: result.subscription_id,
        trial_start: result.trial_start,
        trial_end: result.trial_end,
        tier_id: result.tier_id
      });
      
    } catch (error) {
      console.error('❌ Error setting up trial for new user:', error);
      console.error('Stack trace:', error.stack);
      
      // Log the error but don't throw to avoid breaking signup process
      // This allows user creation to succeed even if trial setup fails
      console.log('⚠️ Continuing with user creation despite trial setup failure');
    }
  }

  /**
   * Check trial status for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Trial status
   */
  async checkTrialStatus(userId) {
    try {
      // Get trial subscription from payments.subscriptions
      const { data: trialSubscription } = await this.supabase
        .from('subscriptions')
        .select('trial_start, trial_end, tier_id, status')
        .eq('user_id', userId)
        .eq('status', 'TRIALING')
        .single();
            
      if (!trialSubscription?.trial_end) {
        return { isTrial: false, hasTrial: false };
      }
      
      const now = new Date();
      const trialEnd = new Date(trialSubscription.trial_end);
      
      if (now > trialEnd) {
        // Trial expired, downgrade to free
        await this.downgradeFromTrial(userId);
        return { 
          isTrial: false, 
          hasTrial: true, 
          expired: true,
          trialStart: trialSubscription.trial_start,
          trialEnd: trialSubscription.trial_end,
          tierId: trialSubscription.tier_id
        };
      }
      
      const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      
      return {
        isTrial: true,
        hasTrial: true,
        trialStart: trialSubscription.trial_start,
        trialEnd: trialSubscription.trial_end,
        tierId: trialSubscription.tier_id,
        daysRemaining: daysRemaining
      };
    } catch (error) {
      console.error('Error checking trial status:', error);
      return { isTrial: false, hasTrial: false };
    }
  }

  /**
   * Downgrade user from trial to free tier
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async downgradeFromTrial(userId) {
    try {
      // Downgrade user to free tier (only subscription_tier, no trial fields)
      await this.supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      // Cancel trial subscription
      await this.supabase
        .from('subscriptions')
        .update({
          status: 'CANCELED',
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'TRIALING');
    } catch (error) {
      console.error('Error downgrading from trial:', error);
      throw error;
    }
  }

  /**
   * Get user's current subscription tier (including trial status)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's subscription info
   */
  async getUserSubscriptionInfo(userId) {
    try {
      const profile = await this.userRepository.getProfileById(userId);
      const trialStatus = await this.checkTrialStatus(userId);
      
      return {
        subscriptionTier: profile.subscription_tier,
        trialStatus: trialStatus,
        isInTrial: trialStatus.isTrial,
        hasTrial: trialStatus.hasTrial
      };
    } catch (error) {
      console.error('Error getting user subscription info:', error);
      return {
        subscriptionTier: 'free',
        trialStatus: { isTrial: false, hasTrial: false },
        isInTrial: false,
        hasTrial: false
      };
    }
  }

  /**
   * Check if user is subscribed to newsletter
   * @param {string} email - User's email address
   * @returns {Promise<boolean>} True if user is subscribed to newsletter
   */
  async isNewsletterSubscribed(email) {
    try {
      if (!email || typeof email !== 'string') {
        return false;
      }

      const subscription = await this.newsletterService.getSubscriptionByEmail(email);
      return !!(subscription && subscription.status === 'subscribed');
    } catch (error) {
      console.error('Error checking newsletter subscription:', error);
      return false;
    }
  }

  /**
   * Sincronizează display_name cu Supabase Auth user metadata
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} displayName - Numele de afișare
   * @returns {Promise<void>}
   */
  async syncDisplayNameToAuth(userId, displayName) {
    try {
      // Folosește service client pentru a actualiza user metadata
      const { error } = await this.supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          display_name: displayName
        }
      });

      if (error) {
        throw new Error(`Eroare la actualizarea user metadata: ${error.message}`);
      }

      console.log(`Display name sincronizat cu Auth pentru utilizatorul ${userId}: ${displayName}`);
    } catch (error) {
      console.error('Eroare la sincronizarea display_name cu Auth:', error);
      throw error;
    }
  }

  /**
   * Verifică dacă un utilizator este admin
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă utilizatorul este admin, false altfel
   */
  async isAdmin(userId) {
    try {
      // Folosește funcția RPC care accesează schema auth
      const { data, error } = await this.supabase.rpc('check_user_admin_status', {
        user_id: userId
      });

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }
}

export default UserService;
