/**
 * Resolver-i GraphQL pentru API-ul Monitorul Oficial
 * Respectă principiul Single Responsibility - resolver-ii sunt "subțiri" și apelează serviciile
 * Respectă principiul Dependency Inversion prin injectarea serviciilor
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { getRateLimitInfo } from '../middleware/rateLimiter.js';
import { validateGraphQLData } from '../middleware/security.js';
import { requireTrialOrSubscription } from '../middleware/auth.js';
import { getCaptchaInfo, validateCaptchaInResolver } from '../middleware/captcha.js';

/**
 * Formatează displayName-ul pentru utilizatorii neautentificați
 * Ex: "Radu Alexandru Nie" -> "R*** A******* N**"
 * @param {string} displayName - Numele de afișare original
 * @returns {string} Numele formatat cu inițialele și steluțe
 */
function formatDisplayNameForAnonymous(displayName) {
  if (!displayName || typeof displayName !== 'string') {
    return displayName;
  }
  
  return displayName
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      if (word.length === 1) return word;
      
      const firstLetter = word[0];
      const stars = '*'.repeat(word.length - 1);
      return firstLetter + stars;
    })
    .join(' ');
}
import {
  signUpInputSchema,
  signInInputSchema,
  createStireInputSchema,
  updateStireInputSchema,
  updateProfileInputSchema,
  updateUserPreferencesInputSchema,
  changePasswordInputSchema,
  paginationSchema,
  idSchema,
  saveSearchInputSchema,
  updateSavedSearchInputSchema,
  savedSearchPaginationSchema,
  createCommentInputSchema,
  updateCommentInputSchema,
  commentPaginationSchema,
  commentIdSchema,
  commentParentTypeSchema,
  favoriteNewsPaginationSchema,
  newsIdSchema,
  stiriStatsDayInputSchema,
  stiriStatsWeekInputSchema,
  stiriStatsYearInputSchema,
  stiriStatsMonthInputSchema
} from '../config/validation.js';
import SubscriptionService from '../core/services/SubscriptionService.js';
import { CommentService } from '../core/services/CommentService.js';
import { FavoriteNewsService } from '../core/services/FavoriteNewsService.js';
import { FavoriteNewsRepository } from '../database/repositories/FavoriteNewsRepository.js';
import { EmailTemplateRepository } from '../database/repositories/EmailTemplateRepository.js';
import { EmailTemplateService } from '../core/services/EmailTemplateService.js';
import { EmailNotificationService } from '../core/services/EmailNotificationService.js';
import { supabaseServiceClient as supabase } from '../database/supabaseClient.js';
import { cronJobResolvers } from './resolvers/cronJobResolvers.js';
import { createAdminUsersResolvers } from './resolvers/adminUsersResolvers.js';

/**
 * Helper function to check if user has access to high limits (active subscription or trial)
 * @param {Object} context - GraphQL context
 * @param {Object} subscriptionService - Subscription service instance
 * @param {Object} userService - User service instance
 * @returns {Promise<boolean>} True if user has access to high limits
 */
async function hasHighLimitAccess(context, subscriptionService, userService) {
  if (!context.user) {
    return false;
  }

  try {
    // Check for active subscription first
    const subscription = await subscriptionService.getUserSubscription(context.user.id);
    if (subscription && subscription.status === 'ACTIVE') {
      return true;
    }

    // Check for active trial
    const trialStatus = await userService.checkTrialStatus(context.user.id);
    if (trialStatus && trialStatus.isTrial) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking high limit access:', error);
    return false;
  }
}

/**
 * Resolver-i pentru tipuri scalare
 */
const scalarResolvers = {
  JSON: {
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => ast.value
  },
  DateTime: {
    serialize: (value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'string') {
        return value;
      }
      return null;
    },
    parseValue: (value) => {
      if (typeof value === 'string') {
        return new Date(value);
      }
      return value;
    },
    parseLiteral: (ast) => {
      if (ast.kind === 'StringValue') {
        return new Date(ast.value);
      }
      return null;
    }
  }
};

/**
 * Factory pentru crearea resolver-ilor cu dependențe injectate
 * @param {Object} services - Serviciile injectate
 * @returns {Object} Resolver-ii GraphQL
 */
export function createResolvers(services) {
  const { userService, stiriService, userRepository, newsletterService, dailySynthesesService, analyticsService, legislativeConnectionsService, savedSearchService, supabaseClient } = services;
  const subscriptionService = new SubscriptionService(supabaseClient);
  const commentService = new CommentService(supabaseClient, userService, subscriptionService);
  const favoriteNewsRepository = new FavoriteNewsRepository(supabaseClient);
  const favoriteNewsService = new FavoriteNewsService(favoriteNewsRepository, subscriptionService, userService);
  
  // Email notification services
  const emailTemplateRepository = new EmailTemplateRepository(supabaseClient);
  const emailTemplateService = new EmailTemplateService(emailTemplateRepository);
  const emailNotificationService = new EmailNotificationService(
    savedSearchService.savedSearchRepository,
    emailTemplateService,
    stiriService.stiriRepository,
    newsletterService.newsletterRepository
  );

  // Admin users resolvers
  const adminUsersResolvers = createAdminUsersResolvers({ 
    userService, 
    supabaseClient, 
    newsletterRepository: newsletterService.newsletterRepository 
  });

  // Minimal in-memory throttling map for updateOrderStatus (orderId+ip)
  const orderStatusThrottle = new Map();
  const ORDER_STATUS_WINDOW_MS = 60 * 1000; // 1 minute
  const ORDER_STATUS_MAX_REQUESTS = 10; // allow up to 10/min per orderId+ip

  /**
   * Resolver-i pentru tipuri
   */
  const typeResolvers = {
    User: {
      profile: (parent, args, context) => {
        // Returnează un obiect care să permită resolver-ii pentru Profile să se execute
        return {
          ...parent.profile,
          // Adaugă câmpurile necesare pentru ca resolver-ii Profile să funcționeze
          id: parent.profile?.id || parent.id,
          subscriptionTier: parent.profile?.subscriptionTier || 'free',
          displayName: parent.profile?.displayName,
          avatarUrl: parent.profile?.avatarUrl,
          createdAt: parent.profile?.createdAt || new Date().toISOString(),
          updatedAt: parent.profile?.updatedAt
        };
      }
    },

    Profile: {
      id: (parent) => parent.id,
      subscriptionTier: (parent) => parent.subscriptionTier,
      displayName: (parent) => parent.displayName,
      avatarUrl: (parent) => parent.avatarUrl,
      preferences: async (parent, args, context) => {
        if (!context.user) {
          return null;
        }
        try {
          return await userService.getUserPreferences(context.user.id);
        } catch (error) {
          return null;
        }
      },
      trialStatus: async (parent, args, context) => {
        if (!context.user) {
          return null;
        }
        try {
          return await userService.checkTrialStatus(context.user.id);
        } catch (error) {
          console.error('Error fetching trial status:', error);
          return { isTrial: false, hasTrial: false };
        }
      },
      isNewsletterSubscribed: async (parent, args, context) => {
        if (!context.user || !context.user.email) {
          return false;
        }
        try {
          return await userService.isNewsletterSubscribed(context.user.email);
        } catch (error) {
          console.error('Error checking newsletter subscription:', error);
          return false;
        }
      },
      isAdmin: async (parent, args, context) => {
        if (!context.user) {
          return false;
        }
        try {
          return await userService.isAdmin(context.user.id);
        } catch (error) {
          console.error('Error checking admin status:', error);
          return false;
        }
      },
      // Subscription information
      activeSubscription: async (parent, args, context) => {
        if (!context.user) {
          return null;
        }
        try {
          return await subscriptionService.getUserSubscription(context.user.id);
        } catch (error) {
          console.error('Error fetching active subscription:', error);
          return null;
        }
      },
      subscriptionUsage: async (parent, args, context) => {
        if (!context.user) {
          return null;
        }
        try {
          // Get user's active subscription
          const subscription = await subscriptionService.getUserSubscription(context.user.id);
          if (!subscription) {
            return null;
          }

          // Get usage data from rate limiter
          const rateLimitInfo = await getRateLimitInfo(context, userRepository);
          
          return {
            subscriptionId: subscription.id,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            requestsUsed: rateLimitInfo.currentRequests,
            requestsLimit: rateLimitInfo.requestLimit || 0,
            requestsRemaining: rateLimitInfo.remainingRequests || 0,
            lastResetAt: new Date().toISOString() // This should be calculated based on billing cycle
          };
        } catch (error) {
          console.error('Error fetching subscription usage:', error);
          return null;
        }
      },
      paymentMethods: async (parent, args, context) => {
        if (!context.user) {
          return [];
        }
        try {
          const { data: paymentMethods, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('user_id', context.user.id)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error fetching payment methods:', error);
            return [];
          }

          return paymentMethods || [];
        } catch (error) {
          console.error('Error fetching payment methods:', error);
          return [];
        }
      },
      subscriptionHistory: async (parent, args, context) => {
        if (!context.user) {
          return [];
        }
        try {
          const { data: subscriptions, error } = await supabase
            .from('subscriptions')
            .select(`
              *,
              subscription_tiers!inner(*)
            `)
            .eq('user_id', context.user.id)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error fetching subscription history:', error);
            return [];
          }

          // Transform subscriptions to match GraphQL schema
          return (subscriptions || []).map(subscription => ({
            ...subscription,
            subscription_tiers: subscription.subscription_tiers ? {
              id: subscription.subscription_tiers.id,
              name: subscription.subscription_tiers.name,
              displayName: subscription.subscription_tiers.display_name || subscription.subscription_tiers.name,
              description: subscription.subscription_tiers.description || `Subscription tier: ${subscription.subscription_tiers.display_name || subscription.subscription_tiers.name}`,
              price: subscription.subscription_tiers.price,
              currency: subscription.subscription_tiers.currency,
              interval: subscription.subscription_tiers.interval,
              features: subscription.subscription_tiers.features || [],
              isPopular: subscription.subscription_tiers.is_popular || false,
              trialDays: subscription.subscription_tiers.trial_days || 0,
              isActive: subscription.subscription_tiers.is_active,
              createdAt: subscription.subscription_tiers.created_at,
              updatedAt: subscription.subscription_tiers.updated_at
            } : null
          }));
        } catch (error) {
          console.error('Error fetching subscription history:', error);
          return [];
        }
      },
      favoriteNews: async (parent, args, context) => {
        if (!context.user) {
          return [];
        }
        try {
          return await favoriteNewsService.getFavoriteNewsIds(context.user.id);
        } catch (error) {
          console.error('Error fetching favorite news:', error);
          return [];
        }
      },
      createdAt: (parent) => parent.createdAt,
      updatedAt: (parent) => parent.updatedAt
    },

    Stire: {
      id: (parent) => parent.id,
      title: (parent) => parent.title,
      publicationDate: (parent) => parent.publicationDate,
      content: (parent) => parent.content,
      topics: (parent) => parent.topics,
      entities: (parent) => parent.entities,
      createdAt: (parent) => parent.createdAt,
      updatedAt: (parent) => parent.updatedAt,
      filename: (parent) => parent.filename,
      viewCount: (parent) => parent.viewCount,
      category: (parent) => parent.category
    },

    RequestLog: {
      id: (parent) => parent.id,
      userId: (parent) => parent.user_id,
      requestTimestamp: (parent) => parent.request_timestamp
    },

    // Subscription type resolvers
    Subscription: {
      id: (parent) => parent.id,
      userId: (parent) => parent.user_id,
      tier: (parent) => parent.subscription_tiers || parent.tier,
      status: (parent) => parent.status,
      netopiaOrderId: (parent) => parent.netopia_order_id,
      netopiaToken: (parent) => parent.netopia_token,
      currentPeriodStart: (parent) => parent.current_period_start,
      currentPeriodEnd: (parent) => parent.current_period_end,
      cancelAtPeriodEnd: (parent) => parent.cancel_at_period_end,
      canceledAt: (parent) => parent.canceled_at,
      trialStart: (parent) => parent.trial_start,
      trialEnd: (parent) => parent.trial_end,
      metadata: (parent) => parent.metadata,
      createdAt: (parent) => parent.created_at,
      updatedAt: (parent) => parent.updated_at
    },

    SubscriptionTier: {
      id: (parent) => parent.id,
      name: (parent) => parent.name,
      displayName: (parent) => parent.displayName || parent.display_name || parent.name,
      description: (parent) => parent.description,
      price: (parent) => parent.price,
      currency: (parent) => parent.currency,
      interval: (parent) => parent.interval,
      features: (parent) => parent.features || [],
      isPopular: (parent) => parent.isPopular || parent.is_popular,
      trialDays: (parent) => parent.trialDays || parent.trial_days,
      isActive: (parent) => parent.isActive !== undefined ? parent.isActive : parent.is_active,
      createdAt: (parent) => parent.createdAt || parent.created_at,
      updatedAt: (parent) => parent.updatedAt || parent.updated_at
    },

    PaymentMethod: {
      id: (parent) => parent.id,
      userId: (parent) => parent.user_id,
      netopiaToken: (parent) => parent.netopia_token,
      last4: (parent) => parent.last4,
      brand: (parent) => parent.brand,
      expMonth: (parent) => parent.exp_month,
      expYear: (parent) => parent.exp_year,
      isDefault: (parent) => parent.is_default,
      createdAt: (parent) => parent.created_at,
      updatedAt: (parent) => parent.updated_at
    },

    Order: {
      id: (parent) => parent.id,
      userId: (parent) => parent.user_id,
      subscriptionId: (parent) => parent.subscription_id,
      netopiaOrderId: (parent) => parent.netopia_order_id,
      amount: (parent) => (parent.amount !== undefined && parent.amount !== null ? Number(parent.amount) : null),
      currency: (parent) => parent.currency,
      status: (parent) => parent.status,
      checkoutUrl: (parent) => parent.checkout_url,
      paymentMethodId: (parent) => parent.payment_method_id,
      metadata: (parent) => parent.metadata,
      createdAt: (parent) => parent.created_at,
      updatedAt: (parent) => parent.updated_at
    },

    SubscriptionUsage: {
      subscriptionId: (parent) => parent.subscriptionId,
      currentPeriodStart: (parent) => parent.currentPeriodStart,
      currentPeriodEnd: (parent) => parent.currentPeriodEnd,
      requestsUsed: (parent) => parent.requestsUsed,
      requestsLimit: (parent) => parent.requestsLimit,
      requestsRemaining: (parent) => parent.requestsRemaining,
      lastResetAt: (parent) => parent.lastResetAt
    },

    // Comment type resolvers
    Comment: {
      id: (parent) => parent.id,
      userId: (parent, args, context) => {
        // Ascunde userId pentru comentariile altor utilizatori
        const currentUserId = context.user?.id;
        const isOwnComment = currentUserId && currentUserId === parent.user_id;
        return isOwnComment ? parent.user_id : null;
      },
      user: async (parent, args, context) => {
        // Obține ID-ul utilizatorului autentificat din context
        const currentUserId = context.user?.id;
        const isOwnComment = currentUserId && currentUserId === parent.user_id;
        const isAuthenticated = !!currentUserId;
        
        // Pentru comentariile proprii, returnează datele complete
        if (isOwnComment) {
          // Obține datele utilizatorului din auth.users
          const { data: userData, error: userError } = await supabase.auth.admin.getUserById(parent.user_id);
          
          // Obține datele profilului din profiles
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, subscription_tier')
            .eq('id', parent.user_id)
            .single();
          
          // Determină displayName: prioritate pentru user_metadata, apoi profiles.display_name
          let displayName = null;
          if (userData?.user?.user_metadata?.display_name) {
            displayName = userData.user.user_metadata.display_name;
          } else if (profileData?.display_name) {
            displayName = profileData.display_name;
          }
          
          return {
            id: parent.user_id,
            email: userData?.user?.email || 'user@example.com',
            profile: {
              id: parent.user_id,
              subscriptionTier: profileData?.subscription_tier || 'free',
              displayName: displayName,
              avatarUrl: profileData?.avatar_url || null
            }
          };
        } else {
          // Pentru comentariile altor utilizatori, returnează doar datele publice
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('display_name, avatar_url, subscription_tier')
            .eq('id', parent.user_id)
            .single();
          
          // Formatează displayName doar pentru utilizatorii neautentificați
          let displayName = profileData?.display_name || null;
          if (displayName && !isAuthenticated) {
            displayName = formatDisplayNameForAnonymous(displayName);
          }
          
          return {
            profile: {
              subscriptionTier: profileData?.subscription_tier || 'free',
              displayName: displayName,
              avatarUrl: profileData?.avatar_url || null
            }
          };
        }
      },
      content: (parent) => parent.content,
      parentType: (parent) => parent.parent_type.toUpperCase(),
      parentId: (parent) => parent.parent_id,
      isEdited: (parent) => parent.is_edited,
      editedAt: (parent) => parent.edited_at,
      createdAt: (parent) => parent.created_at,
      updatedAt: (parent) => parent.updated_at,
      editHistory: (parent, args, context) => {
        // Istoricul modificărilor este disponibil doar pentru proprietarul comentariului
        const currentUserId = context.user?.id;
        const isOwnComment = currentUserId && currentUserId === parent.user_id;
        
        if (isOwnComment) {
          return parent.editHistory || [];
        } else {
          // Pentru comentariile altor utilizatori sau utilizatorii neautentificați
          return [];
        }
      }
    },

    CommentEdit: {
      id: (parent) => parent.id,
      previousContent: (parent) => parent.previous_content,
      editedAt: (parent) => parent.edited_at
    }
  };

  return {
    ...scalarResolvers,
    ...typeResolvers,
    ...adminUsersResolvers,

    Query: {
      ...cronJobResolvers.Query,
      ...adminUsersResolvers.Query,
      // Query-uri pentru știri
      getStiri: async (parent, args, context) => {
        try {
          // Normalizează câmpurile orderBy din format GraphQL către coloane DB
          const normalizedArgs = {
            ...args,
            orderBy: args?.orderBy === 'publicationDate'
              ? 'publication_date'
              : args?.orderBy === 'createdAt'
                ? 'created_at'
                : args?.orderBy
          };

          // Check subscription/trial status for limit > 10
          if (normalizedArgs.limit && normalizedArgs.limit > 10) {
            if (!context.user) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat', {
                extensions: { code: 'UNAUTHENTICATED' }
              });
            }

            // Check if user has active subscription or trial
            const hasAccess = await hasHighLimitAccess(context, subscriptionService, userService);
            if (!hasAccess) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ sau trial', {
                extensions: { 
                  code: 'SUBSCRIPTION_REQUIRED',
                  message: 'Această funcționalitate necesită un abonament activ sau trial. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină.'
                }
              });
            }
          }

          // Validează parametrii de paginare
          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          return await stiriService.getStiri(validatedArgs);
        } catch (error) {
          throw error;
        }
      },

      getStireById: async (parent, { id }, context) => {
        try {
          // Validează ID-ul
          const validatedId = validateGraphQLData(id, idSchema);
          // Înregistrează vizualizarea folosind metadatele request-ului (IP și UA)
          const ip =
            context?.req?.headers?.['cf-connecting-ip']
            || context?.req?.headers?.['x-real-ip']
            || context?.req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
            || context?.req?.ip
            || context?.ip;
          const userAgent = context?.req?.headers?.['user-agent'];
          const cookieHeader = context?.req?.headers?.cookie;
          const sessionId = (() => {
            try {
              if (!cookieHeader) return undefined;
              const parts = String(cookieHeader).split(';');
              for (const p of parts) {
                const [k, v] = p.split('=');
                if (k && k.trim() === 'mo_session') return decodeURIComponent((v || '').trim());
              }
            } catch (_) {}
            return undefined;
          })() || context?.req?.headers?.['x-session-id'];
          if (ip) {
            // Nu blocăm dacă tracking-ul eșuează; returnăm totuși știrea
            try { await stiriService.trackStireView(validatedId, { ip, userAgent, sessionId }); } catch (e) {}
          }
          return await stiriService.getStireById(validatedId);
        } catch (error) {
          throw error;
        }
      },

      // Conexiuni documente pentru o știre (autentificat + abonament/trial)
      getDocumentConnectionsByNews: async (parent, args, context) => {
        try {
          // Autentificare + abonament/trial obligatoriu
          requireTrialOrSubscription(context, true);

          // Validare input
          const { newsId, relationType, limit, offset } = args;
          const validated = validateGraphQLData({
            newsId: String(newsId),
            relationType: relationType || null,
            limit: limit ?? 50,
            offset: offset ?? 0
          }, z.object({
            newsId: z.string().min(1),
            relationType: z.string().min(1).optional().nullable(),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0)
          }).strict());

          const rows = await legislativeConnectionsService.getDocumentConnectionsByNews(validated.newsId, {
            relationType: validated.relationType || undefined,
            limit: validated.limit,
            offset: validated.offset
          });

          return rows;
        } catch (error) {
          throw error;
        }
      },

      // Căutare în știri (fuzzy/full-text)
      searchStiri: async (parent, args, context) => {
        try {
          const { limit, offset, orderBy, orderDirection } = args || {};
          const normalizedArgs = {
            limit,
            offset,
            orderBy: orderBy === 'publicationDate'
              ? 'publication_date'
              : orderBy === 'createdAt'
                ? 'created_at'
                : orderBy,
            orderDirection
          };

          // Check subscription/trial status for limit > 10
          if (normalizedArgs.limit && normalizedArgs.limit > 10) {
            if (!context.user) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat', {
                extensions: { code: 'UNAUTHENTICATED' }
              });
            }

            // Check if user has active subscription or trial
            const hasAccess = await hasHighLimitAccess(context, subscriptionService, userService);
            if (!hasAccess) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ sau trial', {
                extensions: { 
                  code: 'SUBSCRIPTION_REQUIRED',
                  message: 'Această funcționalitate necesită un abonament activ sau trial. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină.'
                }
              });
            }
          }

          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          return await stiriService.searchStiri({
            query: args.query,
            ...validatedArgs
          });
        } catch (error) {
          throw error;
        }
      },

      // Știri după categorie (content.category)
      getStiriByCategory: async (parent, args, context) => {
        try {
          const { category, limit, offset, orderBy, orderDirection } = args || {};
          const normalizedArgs = {
            limit,
            offset,
            orderBy: orderBy === 'publicationDate'
              ? 'publication_date'
              : orderBy === 'createdAt'
                ? 'created_at'
                : orderBy,
            orderDirection
          };

          // Check subscription/trial status for limit > 10
          if (normalizedArgs.limit && normalizedArgs.limit > 10) {
            if (!context.user) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat', {
                extensions: { code: 'UNAUTHENTICATED' }
              });
            }

            // Check if user has active subscription or trial
            const hasAccess = await hasHighLimitAccess(context, subscriptionService, userService);
            if (!hasAccess) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ sau trial', {
                extensions: { 
                  code: 'SUBSCRIPTION_REQUIRED',
                  message: 'Această funcționalitate necesită un abonament activ sau trial. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină.'
                }
              });
            }
          }

          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          return await stiriService.getStiriByCategory({
            category,
            ...validatedArgs
          });
        } catch (error) {
          throw error;
        }
      },

      // Căutare îmbunătățită cu suport pentru fuzzy/full-text search + keywords + filtrare dată
      searchStiriByKeywords: async (parent, args, context) => {
        try {
          const { limit, offset, orderBy, orderDirection, publicationDateFrom, publicationDateTo } = args || {};
          const normalizedArgs = {
            limit,
            offset,
            orderBy: orderBy === 'publicationDate'
              ? 'publication_date'
              : orderBy === 'createdAt'
                ? 'created_at'
                : orderBy === 'viewCount'  // ADĂUGAT
                  ? 'view_count'
                  : orderBy,
            orderDirection
          };

          // Check if user is searching by date
          const isSearchingByDate = publicationDateFrom || publicationDateTo;

          // Check subscription/trial status for limit > 10
          // Allow unauthenticated users to search by date with any limit
          if (normalizedArgs.limit && normalizedArgs.limit > 10 && !isSearchingByDate) {
            if (!context.user) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, trebuie să fiți autentificat', {
                extensions: { code: 'UNAUTHENTICATED' }
              });
            }

            // Check if user has active subscription or trial
            const hasAccess = await hasHighLimitAccess(context, subscriptionService, userService);
            if (!hasAccess) {
              throw new GraphQLError('Pentru a afișa mai mult de 10 știri pe pagină, aveți nevoie de un abonament activ sau trial', {
                extensions: { 
                  code: 'SUBSCRIPTION_REQUIRED',
                  message: 'Această funcționalitate necesită un abonament activ sau trial. Vă rugăm să vă abonați pentru a accesa mai multe știri pe pagină.'
                }
              });
            }
          }

          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          const baseResponse = await stiriService.searchStiriByKeywords({
            query: args.query,
            keywords: args.keywords,
            publicationDateFrom: args.publicationDateFrom,
            publicationDateTo: args.publicationDateTo,
            ...validatedArgs
          });

          // Îmbogățește răspunsul cu isFavorite doar pentru utilizatori eligibili (autentificați + abonament/trial)
          try {
            if (context.user) {
              const canUseFavorites = await favoriteNewsService.hasAccessToFavorites(context.user.id);
              if (canUseFavorites && Array.isArray(baseResponse?.stiri) && baseResponse.stiri.length > 0) {
                const favoriteIds = await favoriteNewsService.getFavoriteNewsIds(context.user.id);
                const favoriteSet = new Set((favoriteIds || []).map(id => String(id)));
                const stiriWithFavorite = baseResponse.stiri.map(stire => ({
                  ...stire,
                  isFavorite: favoriteSet.has(String(stire.id))
                }));
                return { ...baseResponse, stiri: stiriWithFavorite };
              }
            }
          } catch (favErr) {
            // Nu blocăm funcționalitatea existentă dacă apare o eroare la favorite
            console.error('searchStiriByKeywords favorite enrichment error:', favErr);
          }

          return baseResponse;
        } catch (error) {
          throw error;
        }
      },

      // Cele mai citite știri
      getMostReadStiri: async (parent, { period, limit }, context) => {
        try {
          return await stiriService.getMostReadStiri({ period, limit });
        } catch (error) {
          throw error;
        }
      },

      // Analytics: top entități
      topEntities: async (parent, { limit }, context) => {
        try {
          return await stiriService.getTopEntities({ limit });
        } catch (error) {
          throw error;
        }
      },

      // Analytics: top topicuri
      topTopics: async (parent, { limit }, context) => {
        try {
          return await stiriService.getTopTopics({ limit });
        } catch (error) {
          throw error;
        }
      },

      // Categorii distincte pentru meniu
      getCategories: async (parent, { limit }, context) => {
        try {
          // Verifică că utilizatorul are trial activ sau abonament valid
          requireTrialOrSubscription(context, true);
          
          const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 100;
          return await stiriService.getCategories({ limit: safeLimit });
        } catch (error) {
          throw error;
        }
      },

      // Știri după slug de categorie
      getStiriByCategorySlug: async (parent, args, context) => {
        try {
          // Verifică că utilizatorul are trial activ sau abonament valid
          requireTrialOrSubscription(context, true);
          
          const { slug, limit, offset, orderBy, orderDirection } = args || {};
          const normalizedArgs = {
            limit,
            offset,
            orderBy: orderBy === 'publicationDate'
              ? 'publication_date'
              : orderBy === 'createdAt'
                ? 'created_at'
                : orderBy,
            orderDirection
          };

          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          return await stiriService.getStiriByCategorySlug({ slug, ...validatedArgs });
        } catch (error) {
          throw error;
        }
      },

      // Query-uri pentru utilizatori
      me: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }
          return context.user;
        } catch (error) {
          throw error;
        }
      },

      getUserProfile: async (parent, { userId }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează ID-ul utilizatorului
          const validatedUserId = validateGraphQLData(userId, idSchema);

          // Verifică dacă utilizatorul încearcă să acceseze propriul profil sau are permisiuni
          if (context.user.id !== validatedUserId) {
            throw new GraphQLError('Nu aveți permisiunea de a accesa acest profil', {
              extensions: { code: 'FORBIDDEN' }
            });
          }

          return await userService.getUserProfile(validatedUserId);
        } catch (error) {
          throw error;
        }
      },

      getUserPreferences: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          return await userService.getUserPreferences(context.user.id);
        } catch (error) {
          throw error;
        }
      },

      getPersonalizedFeed: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { limit, offset, orderBy, orderDirection } = args || {};
          const normalizedArgs = {
            limit,
            offset,
            orderBy: orderBy === 'publicationDate'
              ? 'publication_date'
              : orderBy === 'createdAt'
                ? 'created_at'
                : orderBy,
            orderDirection
          };
          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          
          return await userService.getPersonalizedStiri(context.user.id, validatedArgs);
        } catch (error) {
          throw error;
        }
      },

      // Query-uri pentru administrare
      getRequestHistory: async (parent, { userId, limit, offset }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează ID-ul utilizatorului și parametrii de paginare
          const validatedUserId = validateGraphQLData(userId, idSchema);
          const validatedPagination = validateGraphQLData({ limit, offset }, paginationSchema);

          // Verifică dacă utilizatorul încearcă să acceseze propriul istoric sau are permisiuni
          if (context.user.id !== validatedUserId) {
            throw new GraphQLError('Nu aveți permisiunea de a accesa acest istoric', {
              extensions: { code: 'FORBIDDEN' }
            });
          }

          const result = await userRepository.getRequestHistory(validatedUserId, validatedPagination);
          
          return {
            requests: result.requests,
            totalCount: result.totalCount,
            hasNextPage: result.hasNextPage,
            hasPreviousPage: result.hasPreviousPage
          };
        } catch (error) {
          throw error;
        }
      },

      // Query pentru informații despre rate limiting
      getRateLimitInfo: async (parent, args, context) => {
        try {
          return await getRateLimitInfo(context, userRepository);
        } catch (error) {
          throw error;
        }
      },

      // Newsletter
      getNewsletterSubscription: async (parent, { email }, context) => {
        try {
          return await newsletterService.getSubscriptionByEmail(email);
        } catch (error) {
          throw error;
        }
      },

      // Daily Syntheses
      getDailySynthesis: async (parent, { date }, context) => {
        try {
          const synthesis = await dailySynthesesService.getDetailedByDate(date);
          if (!synthesis) return null;
          return {
            id: synthesis.id,
            synthesisDate: synthesis.synthesis_date,
            title: synthesis.title,
            content: synthesis.content,
            summary: synthesis.summary,
            metadata: synthesis.metadata
          };
        } catch (error) {
          throw error;
        }
      },

      // Related Stories
      getRelatedStories: async (parent, { storyId, limit, minScore }, context) => {
        try {
          // Validează ID-ul
          const validatedId = validateGraphQLData(storyId, idSchema);
          
          // Setează valori default pentru parametrii opționali
          const queryLimit = limit && limit > 0 ? Math.min(limit, 20) : 5; // Max 20 results
          const queryMinScore = minScore !== undefined ? minScore : 1.0;
          
          const relatedStories = await stiriService.getRelatedStories({
            storyId: validatedId,
            limit: queryLimit,
            minScore: queryMinScore
          });
          
          return {
            relatedStories: relatedStories.map(story => ({
              id: story.id,
              title: story.title,
              publicationDate: story.publication_date,
              content: story.content,
              createdAt: story.created_at,
              filename: story.filename,
              viewCount: story.view_count || 0,
              category: story.category,
              relevanceScore: parseFloat(story.relevance_score),
              relevanceReasons: story.relevance_reasons
            }))
          };
        } catch (error) {
          throw error;
        }
      },

      // Analytics Dashboard
      getAnalyticsDashboard: async (parent, { startDate, endDate }, context) => {
        try {
          return await analyticsService.getDashboardData(startDate, endDate);
        } catch (error) {
          throw error;
        }
      },

      // Analiza de rețea a conexiunilor legislative
      getLegislativeGraph: async (parent, { documentId, depth }, context) => {
        try {
          // Validează ID-ul documentului
          const validatedId = validateGraphQLData(documentId, idSchema);
          
          // LIMITARE STRICTĂ DE SECURITATE: Adâncimea maximă este 3
          // Aceasta previne interogări extrem de complexe care pot bloca serviciul
          const MAX_DEPTH = 3;
          const queryDepth = depth && depth > 0 ? Math.min(depth, MAX_DEPTH) : 1;
          
          return await legislativeConnectionsService.getLegislativeGraph(validatedId, queryDepth);
        } catch (error) {
          throw error;
        }
      },

      // Statistici despre conexiunile legislative
      getLegislativeConnectionStats: async (parent, args, context) => {
        try {
          return await legislativeConnectionsService.getLegislativeConnectionStats();
        } catch (error) {
          throw error;
        }
      },

      // Statistici pentru rezoluția conexiunilor externe
      getResolutionStats: async (parent, args, context) => {
        try {
          requireTrialOrSubscription(context, true);
          const { data, error } = await supabase.rpc('get_resolution_stats');
          if (error) {
            throw new GraphQLError('Eroare la getResolutionStats', { extensions: { code: 'DATABASE_ERROR', details: error.message } });
          }
          const row = (data && data[0]) || {};
          return row;
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message || 'Eroare internă', { extensions: { code: 'INTERNAL_ERROR' } });
        }
      },

      // Conexiuni documente din view conexiuni_documente pentru o știre
      getDocumentConnectionsByNews: async (parent, { newsId, relationType, limit = 50, offset = 0 }, context) => {
        try {
          // Necesită utilizator cu trial sau abonament activ
          requireTrialOrSubscription(context, true);

          // Validează ID-ul
          const validatedNewsId = validateGraphQLData(newsId, idSchema);

          // Limite sigure
          const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
          const safeOffset = Math.max(0, Number(offset) || 0);

          // Interoghează view-ul
          let query = supabase
            .from('conexiuni_documente')
            .select('*')
            .eq('id_stire_sursa', validatedNewsId)
            .range(safeOffset, safeOffset + safeLimit - 1);

          if (relationType && relationType.trim()) {
            query = query.eq('tip_relatie', relationType);
          }

          const { data, error } = await query;
          if (error) {
            throw new GraphQLError('Eroare la interogarea conexiunilor', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }

          // Mapare câmpuri la GraphQL type
          return (data || []).map((row) => ({
            idConexiune: row.id_conexiune,
            idStireSursa: row.id_stire_sursa,
            cheieDocumentSursa: row.cheie_document_sursa,
            idStireTinta: row.id_stire_tinta,
            cheieDocumentTinta: row.cheie_document_tinta,
            tipRelatie: row.tip_relatie,
            confidenceScore: row.confidence_score,
            extractionMethod: row.extraction_method
          }));
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message || 'Eroare internă', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      // =====================================================
      // SUBSCRIPTION QUERIES
      // =====================================================

      // Get subscription tiers
      getSubscriptionTiers: async (parent, args, context) => {
        try {
          return await subscriptionService.getSubscriptionTiers();
        } catch (error) {
          throw error;
        }
      },

      // Get user's current subscription
      getMySubscription: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          return await subscriptionService.getUserSubscription(context.user.id);
        } catch (error) {
          throw error;
        }
      },

      // Get user's payment methods
      getMyPaymentMethods: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { data: paymentMethods, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('user_id', context.user.id)
            .order('created_at', { ascending: false });

          if (error) {
            throw new Error('Failed to fetch payment methods');
          }

          return paymentMethods || [];
        } catch (error) {
          throw error;
        }
      },

      // Get subscription usage
      getSubscriptionUsage: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Get user's active subscription
          const subscription = await subscriptionService.getUserSubscription(context.user.id);
          if (!subscription) {
            throw new GraphQLError('No active subscription found', {
              extensions: { code: 'SUBSCRIPTION_NOT_FOUND' }
            });
          }

          // Get usage data from rate limiter
          const rateLimitInfo = await getRateLimitInfo(context, userRepository);
          
          return {
            subscriptionId: subscription.id,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            requestsUsed: rateLimitInfo.currentRequests,
            requestsLimit: rateLimitInfo.requestLimit || 0,
            requestsRemaining: rateLimitInfo.remainingRequests || 0,
            lastResetAt: new Date().toISOString() // This should be calculated based on billing cycle
          };
        } catch (error) {
          throw error;
        }
      },

      // Get order details
      getOrder: async (parent, { orderId }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('user_id', context.user.id)
            .single();

          if (error || !order) {
            throw new GraphQLError('Order not found', {
              extensions: { code: 'ORDER_NOT_FOUND' }
            });
          }

          return order;
        } catch (error) {
          throw error;
        }
      },

      // Get user's orders
      getMyOrders: async (parent, { limit = 10, offset = 0 }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', context.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (error) {
            throw new Error('Failed to fetch orders');
          }

          return orders || [];
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // MONITORING & ADMIN DASHBOARD QUERIES
      // =====================================================

      // Get payment metrics for monitoring
      getPaymentMetrics: async (parent, { startDate, endDate }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          return await subscriptionService.getPaymentMetrics({ startDate, endDate });
        } catch (error) {
          throw error;
        }
      },

      // Get orphan payments (confirmed by Netopia but no subscription match)
      getOrphanPayments: async (parent, { limit = 50, offset = 0 }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          return await subscriptionService.getOrphanPayments({ limit, offset });
        } catch (error) {
          throw error;
        }
      },

      // Get webhook status
      getWebhookStatus: async (parent, { webhookId }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          const { data: webhook, error } = await supabase
            .from('webhook_processing')
            .select('*')
            .eq('netopia_order_id', webhookId)
            .single();

          if (error || !webhook) {
            return null;
          }

          return {
            webhookId: webhook.netopia_order_id,
            status: webhook.status,
            receivedAt: webhook.created_at,
            processedAt: webhook.processed_at,
            processingTimeMs: null, // Calculate if needed
            retryCount: 0, // Calculate from logs if needed
            errorMessage: webhook.error_message
          };
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // SAVED SEARCHES QUERIES
      // =====================================================

      // Obține căutările salvate ale utilizatorului
      getSavedSearches: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { limit, offset, orderBy, orderDirection, favoritesOnly } = args || {};
          const validatedArgs = validateGraphQLData({
            limit,
            offset,
            orderBy: orderBy === 'createdAt' ? 'created_at' : orderBy === 'updatedAt' ? 'updated_at' : orderBy,
            orderDirection,
            favoritesOnly
          }, savedSearchPaginationSchema);

          return await savedSearchService.getSavedSearches(context.user.id, validatedArgs);
        } catch (error) {
          throw error;
        }
      },

      // Obține o căutare salvată după ID
      getSavedSearchById: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedId = validateGraphQLData(id, idSchema);
          return await savedSearchService.getSavedSearchById(context.user.id, validatedId);
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // EMAIL NOTIFICATION QUERIES
      // =====================================================

      // Obține toate șabloanele de email (admin only)
      getEmailTemplates: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          return await emailTemplateService.getAllTemplates();
        } catch (error) {
          throw error;
        }
      },

      // Obține un șablon de email după ID (admin only)
      getEmailTemplateById: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          const validatedId = validateGraphQLData(id, idSchema);
          return await emailTemplateService.getTemplateById(validatedId);
        } catch (error) {
          throw error;
        }
      },

      // Obține un șablon de email după nume (admin only)
      getEmailTemplateByName: async (parent, { templateName }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          return await emailTemplateService.getTemplateByName(templateName);
        } catch (error) {
          throw error;
        }
      },

      // Obține informații despre notificările email pentru utilizatorul curent
      getEmailNotificationInfo: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          return await savedSearchService.getEmailNotificationInfo(context.user.id);
        } catch (error) {
          throw error;
        }
      },

      // Obține statistici despre notificările email
      getEmailNotificationStats: async (parent, { daysBack }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          return await emailNotificationService.getNotificationStats({ 
            daysBack: daysBack || 7,
            userId: context.user.id 
          });
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // COMMENT QUERIES
      // =====================================================

      getComments: async (parent, args, context) => {
        try {
          const { parentType, parentId, limit = 20, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = args;
          
          // Validează argumentele
          const validatedArgs = validateGraphQLData({
            parentType,
            parentId,
            limit,
            offset,
            orderBy,
            orderDirection
          }, z.object({
            parentType: commentParentTypeSchema,
            parentId: z.string().min(1),
            limit: z.number().int().min(1).max(100),
            offset: z.number().int().min(0),
            orderBy: z.enum(['created_at', 'updated_at', 'createdAt', 'updatedAt']),
            orderDirection: z.enum(['ASC', 'DESC'])
          }));

          // Transformă camelCase în snake_case pentru orderBy
          const orderByMapping = {
            'createdAt': 'created_at',
            'updatedAt': 'updated_at'
          };
          const mappedOrderBy = orderByMapping[validatedArgs.orderBy] || validatedArgs.orderBy;

          const result = await commentService.getComments(
            validatedArgs.parentType.toLowerCase(), 
            validatedArgs.parentId, 
            {
              limit: validatedArgs.limit,
              offset: validatedArgs.offset,
              orderBy: mappedOrderBy,
              orderDirection: validatedArgs.orderDirection
            }
          );

          return {
            comments: result.comments,
            pagination: {
              totalCount: result.totalCount,
              hasNextPage: result.hasNextPage,
              hasPreviousPage: result.hasPreviousPage,
              currentPage: result.currentPage,
              totalPages: result.totalPages
            }
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'COMMENT_FETCH_ERROR' }
          });
        }
      },

      getCommentById: async (parent, { id }, context) => {
        try {
          const validatedId = validateGraphQLData(id, commentIdSchema);
          return await commentService.getCommentById(validatedId);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'COMMENT_FETCH_ERROR' }
          });
        }
      },

      // =====================================================
      // FAVORITE NEWS QUERIES
      // =====================================================

      getFavoriteNews: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { limit, offset, orderBy, orderDirection } = args || {};
          const validatedArgs = validateGraphQLData({
            limit,
            offset,
            orderBy: orderBy === 'createdAt' ? 'created_at' : orderBy === 'updatedAt' ? 'updated_at' : orderBy,
            orderDirection
          }, favoriteNewsPaginationSchema);

          return await favoriteNewsService.getFavoriteNews(context.user.id, validatedArgs);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'FAVORITE_NEWS_FETCH_ERROR' }
          });
        }
      },

      isFavoriteNews: async (parent, { newsId }, context) => {
        try {
          if (!context.user) {
            return false;
          }

          const validatedNewsId = validateGraphQLData(newsId, newsIdSchema);
          return await favoriteNewsService.isFavoriteNews(context.user.id, validatedNewsId);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          console.error('Error checking if news is favorite:', error);
          return false;
        }
      },

      getFavoriteNewsStats: async (parent, args, context) => {
        try {
          if (!context.user) {
            return {
              totalFavorites: 0,
              latestFavoriteDate: null
            };
          }

          return await favoriteNewsService.getFavoriteNewsStats(context.user.id);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          console.error('Error fetching favorite news stats:', error);
          return {
            totalFavorites: 0,
            latestFavoriteDate: null
          };
        }
      },

      // Admin: statistici știri pentru dashboard
      getStiriStats: async (parent, args, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Autentificare necesară', { extensions: { code: 'UNAUTHENTICATED' } });
          }
          const isAdmin = await userService.isAdmin(context.user.id);
          if (!isAdmin) {
            throw new GraphQLError('Acces interzis: necesită rol admin', { extensions: { code: 'FORBIDDEN' } });
          }

          const validatedDay = args?.day ? validateGraphQLData(args.day, stiriStatsDayInputSchema) : null;
          const validatedWeek = args?.week ? validateGraphQLData(args.week, stiriStatsWeekInputSchema) : null;
          const validatedYear = args?.year ? validateGraphQLData(args.year, stiriStatsYearInputSchema) : null;
          const validatedMonth = args?.month ? validateGraphQLData(args.month, stiriStatsMonthInputSchema) : null;

          // Helper mappers
          const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
          const roDay = (dateStr) => {
            const d = new Date(dateStr);
            const dow = d.getUTCDay();
            const names = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
            return names[dow];
          };
          const roMonth = (m) => {
            const names = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
            return names[Math.max(1, Math.min(12, m)) - 1];
          };

          // Build RPC params
          const dayParam = validatedDay?.day ? { p_day: validatedDay.day.substring(0, 10) } : {};
          const weekParam = validatedWeek?.weekStart ? { p_week_start: validatedWeek.weekStart.substring(0, 10) } : {};
          const yearParam = validatedYear?.year ? { p_year: validatedYear.year } : {};
          const monthParam = {
            ...(validatedMonth?.year ? { p_year: validatedMonth.year } : {}),
            ...(validatedMonth?.month ? { p_month: validatedMonth.month } : {})
          };

          // Execute RPCs in parallel (counts and views)
          const [
            todayRes,
            weekRes,
            yearRes,
            monthRes,
            totalRes,
            vTodayRes,
            vWeekRes,
            vYearRes,
            vMonthRes,
            vTotalRes
          ] = await Promise.all([
            supabase.rpc('get_stiri_stats_by_day', dayParam),
            supabase.rpc('get_stiri_stats_by_week', weekParam),
            supabase.rpc('get_stiri_stats_by_year', yearParam),
            supabase.rpc('get_stiri_stats_by_month', monthParam),
            supabase.rpc('get_stiri_stats_total'),
            supabase.rpc('get_stiri_views_by_day', dayParam),
            supabase.rpc('get_stiri_views_by_week', weekParam),
            supabase.rpc('get_stiri_views_by_year', yearParam),
            supabase.rpc('get_stiri_views_by_month', monthParam),
            supabase.rpc('get_stiri_views_total')
          ]);

          const handle = (res, name) => {
            if (res.error) {
              throw new GraphQLError(`Eroare la ${name}: ${res.error.message}`, { extensions: { code: 'DATABASE_ERROR' } });
            }
            return res.data || [];
          };

          const todayData = handle(todayRes, 'get_stiri_stats_by_day').map((r) => ({
            label: `${pad2(r.hour)}:00`,
            value: Number(r.count || 0)
          }));

          const weekData = handle(weekRes, 'get_stiri_stats_by_week').map((r) => ({
            label: roDay(r.day),
            value: Number(r.count || 0)
          }));

          const yearData = handle(yearRes, 'get_stiri_stats_by_year').map((r) => ({
            label: roMonth(r.month),
            value: Number(r.count || 0)
          }));

          const monthData = handle(monthRes, 'get_stiri_stats_by_month').map((r) => ({
            label: pad2(r.day),
            value: Number(r.count || 0)
          }));

          const vTodayData = handle(vTodayRes, 'get_stiri_views_by_day').map((r) => ({
            label: `${pad2(r.hour)}:00`,
            value: Number(r.count || 0)
          }));

          const vWeekData = handle(vWeekRes, 'get_stiri_views_by_week').map((r) => ({
            label: roDay(r.day),
            value: Number(r.count || 0)
          }));

          const vYearData = handle(vYearRes, 'get_stiri_views_by_year').map((r) => ({
            label: roMonth(r.month),
            value: Number(r.count || 0)
          }));

          const vMonthData = handle(vMonthRes, 'get_stiri_views_by_month').map((r) => ({
            label: pad2(r.day),
            value: Number(r.count || 0)
          }));

          const total = (() => {
            if (totalRes.error) {
              throw new GraphQLError(`Eroare la get_stiri_stats_total: ${totalRes.error.message}`, { extensions: { code: 'DATABASE_ERROR' } });
            }
            return Number(totalRes.data || 0);
          })();

          const viewsTotal = (() => {
            if (vTotalRes.error) {
              throw new GraphQLError(`Eroare la get_stiri_views_total: ${vTotalRes.error.message}`, { extensions: { code: 'DATABASE_ERROR' } });
            }
            return Number(vTotalRes.data || 0);
          })();

          return {
            today: todayData,
            thisWeek: weekData,
            thisYear: yearData,
            thisMonth: monthData,
            total,
            viewsToday: vTodayData,
            viewsThisWeek: vWeekData,
            viewsThisYear: vYearData,
            viewsThisMonth: vMonthData,
            viewsTotal
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          console.error('Error in getStiriStats:', error);
          throw new GraphQLError('Eroare internă la preluarea statisticilor', { extensions: { code: 'INTERNAL_ERROR' } });
        }
      }
    },

    Mutation: {
      ...cronJobResolvers.Mutation,
      ...adminUsersResolvers.Mutation,
      // Mutații pentru autentificare
      signUp: async (parent, { input }, context) => {
        try {
          // Validează captcha înainte de procesare
          validateCaptchaInResolver(context, 'signUp');
          
          // Validează input-ul de înregistrare
          const validatedInput = validateGraphQLData(input, signUpInputSchema);
          return await userService.handleSignUp(validatedInput);
        } catch (error) {
          throw error;
        }
      },

      signIn: async (parent, { input }, context) => {
        try {
          // Validează captcha înainte de procesare
          validateCaptchaInResolver(context, 'signIn');
          
          // Validează input-ul de autentificare
          const validatedInput = validateGraphQLData(input, signInInputSchema);
          return await userService.handleSignIn(validatedInput);
        } catch (error) {
          throw error;
        }
      },

      // Change password for authenticated user
      changePassword: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează captcha înainte de procesare
          validateCaptchaInResolver(context, 'changePassword');

          const validatedInput = validateGraphQLData(input, changePasswordInputSchema);
          const userEmail = context.user.email;
          if (!userEmail) {
            throw new GraphQLError('Emailul utilizatorului nu este disponibil', {
              extensions: { code: 'AUTH_ERROR' }
            });
          }

          const ok = await userService.changePassword(context.user.id, userEmail, validatedInput);
          return !!ok;
        } catch (error) {
          throw error;
        }
      },

      // Mutații pentru știri
      createStire: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează input-ul pentru crearea știrii
          const validatedInput = validateGraphQLData(input, createStireInputSchema);

          // Aici se poate adăuga logica de autorizare pentru crearea știrilor
          // De exemplu, doar utilizatorii cu anumite roluri pot crea știri

          return await stiriService.createStire(validatedInput);
        } catch (error) {
          throw error;
        }
      },

      updateStire: async (parent, { id, input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează ID-ul și input-ul pentru actualizarea știrii
          const validatedId = validateGraphQLData(id, idSchema);
          const validatedInput = validateGraphQLData(input, updateStireInputSchema);

          // Aici se poate adăuga logica de autorizare pentru actualizarea știrilor

          return await stiriService.updateStire(validatedId, validatedInput);
        } catch (error) {
          throw error;
        }
      },

      deleteStire: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează ID-ul pentru ștergerea știrii
          const validatedId = validateGraphQLData(id, idSchema);

          // Aici se poate adăuga logica de autorizare pentru ștergerea știrilor

          return await stiriService.deleteStire(validatedId);
        } catch (error) {
          throw error;
        }
      },

      // Mutații pentru profile
      updateProfile: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }
          
          // Validează input-ul pentru actualizarea profilului
          const validatedInput = validateGraphQLData(input, updateProfileInputSchema);

          return await userService.updateUserProfile(context.user.id, validatedInput);
        } catch (error) {
          throw error;
        }
      },

      updateUserPreferences: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // Validează input-ul pentru actualizarea preferințelor
          const validatedInput = validateGraphQLData(input, updateUserPreferencesInputSchema);

          return await userService.updateUserPreferences(context.user.id, validatedInput);
        } catch (error) {
          throw error;
        }
      },

      // Newsletter
      subscribeNewsletter: async (parent, { input }, context) => {
        try {
          const ip = context?.req?.headers?.['cf-connecting-ip']
            || context?.req?.headers?.['x-real-ip']
            || context?.req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
            || context?.req?.ip
            || context?.ip;
          const userAgent = context?.req?.headers?.['user-agent'];
          return await newsletterService.subscribe(input, { ip, userAgent });
        } catch (error) {
          throw error;
        }
      },

      unsubscribeNewsletter: async (parent, { input }, context) => {
        try {
          const ip = context?.req?.headers?.['cf-connecting-ip']
            || context?.req?.headers?.['x-real-ip']
            || context?.req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
            || context?.req?.ip
            || context?.ip;
          const userAgent = context?.req?.headers?.['user-agent'];
          return await newsletterService.unsubscribe(input, { ip, userAgent });
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // SUBSCRIPTION MUTATIONS
      // =====================================================

      // Start checkout process
      startCheckout: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { tierId, ...options } = input;
          const result = await subscriptionService.startCheckout(context.user.id, tierId, options);
          
          return {
            orderId: result.orderId,
            checkoutUrl: result.checkoutUrl,
            expiresAt: result.expiresAt
          };
        } catch (error) {
          throw error;
        }
      },

      // Confirm payment (check order status)
      confirmPayment: async (parent, { orderId }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('user_id', context.user.id)
            .single();

          if (error || !order) {
            throw new GraphQLError('Order not found', {
              extensions: { code: 'ORDER_NOT_FOUND' }
            });
          }

          return order;
        } catch (error) {
          throw error;
        }
      },

      // Reactivate subscription
      reactivateSubscription: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { subscriptionId, paymentMethodId } = input;
          
          // Get subscription details
          const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('id', subscriptionId)
            .eq('user_id', context.user.id)
            .single();

          if (error || !subscription) {
            throw new GraphQLError('Subscription not found', {
              extensions: { code: 'SUBSCRIPTION_NOT_FOUND' }
            });
          }

          // Update subscription status
          const { data: updatedSubscription, error: updateError } = await supabase
            .from('subscriptions')
            .update({
              status: 'ACTIVE',
              cancel_at_period_end: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', subscriptionId)
            .select(`
              *,
              subscription_tiers!inner(*)
            `)
            .single();

          if (updateError) {
            throw new Error('Failed to reactivate subscription');
          }

          return updatedSubscription;
        } catch (error) {
          throw error;
        }
      },

      // Cancel subscription
      cancelSubscription: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { subscriptionId, immediate, refund, reason } = input;
          
          // Cancel subscription
          await subscriptionService.cancelSubscription(subscriptionId, immediate, reason);

          // Get updated subscription
          const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select(`
              *,
              subscription_tiers!inner(*)
            `)
            .eq('id', subscriptionId)
            .eq('user_id', context.user.id)
            .single();

          if (error || !subscription) {
            throw new GraphQLError('Subscription not found', {
              extensions: { code: 'SUBSCRIPTION_NOT_FOUND' }
            });
          }

          return subscription;
        } catch (error) {
          throw error;
        }
      },

      // Update payment method
      updatePaymentMethod: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const { paymentMethodId, isDefault } = input;

          // Update payment method
          const { data: paymentMethod, error } = await supabase
            .from('payment_methods')
            .update({
              is_default: isDefault,
              updated_at: new Date().toISOString()
            })
            .eq('id', paymentMethodId)
            .eq('user_id', context.user.id)
            .select()
            .single();

          if (error || !paymentMethod) {
            throw new GraphQLError('Payment method not found', {
              extensions: { code: 'PAYMENT_METHOD_NOT_FOUND' }
            });
          }

          return paymentMethod;
        } catch (error) {
          throw error;
        }
      },

      // Admin refund
      adminRefund: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          const { orderId, amount, reason, metadata } = input;
          
          const refund = await subscriptionService.createRefund(orderId, amount, reason, metadata);
          return refund;
        } catch (error) {
          throw error;
        }
      },

      // Admin cancel subscription
      adminCancelSubscription: async (parent, { subscriptionId, reason }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          await subscriptionService.cancelSubscription(subscriptionId, true, reason);

          const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select(`
              *,
              subscription_tiers!inner(*)
            `)
            .eq('id', subscriptionId)
            .single();

          if (error || !subscription) {
            throw new GraphQLError('Subscription not found', {
              extensions: { code: 'SUBSCRIPTION_NOT_FOUND' }
            });
          }

          return subscription;
        } catch (error) {
          throw error;
        }
      },

      // Webhook handler (internal)
      webhookNetopiaIPN: async (parent, { payload }, context) => {
        try {
          // This should be called internally with proper authentication
          const result = await subscriptionService.processWebhook(payload);
          return result.processed;
        } catch (error) {
          console.error('Webhook processing error:', error);
          return false;
        }
      },

      // Webhook-compatible: update order status
      updateOrderStatus: async (parent, args, context) => {
        const nowIso = new Date().toISOString();
        const ip = context?.req?.headers?.['cf-connecting-ip']
          || context?.req?.headers?.['x-real-ip']
          || context?.req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
          || context?.req?.ip
          || context?.ip
          || 'unknown';

        // Auth: X-Internal-API-Key check (return GraphQL payload, not HTTP 403)
        const providedKey = context?.req?.headers?.['x-internal-api-key'];
        const expectedKey = process.env.INTERNAL_API_KEY;
        if (!expectedKey || !providedKey || String(providedKey) !== String(expectedKey)) {
          return { success: false, message: 'Unauthorized', order: null };
        }

        try {
          const { orderId, status, transactionId, amount, currency, rawData } = args || {};

          // Throttling per (orderId+ip)
          try {
            const throttleKey = `${orderId}|${ip}`;
            const entry = orderStatusThrottle.get(throttleKey) || { timestamps: [] };
            const cutoff = Date.now() - ORDER_STATUS_WINDOW_MS;
            entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);
            if (entry.timestamps.length >= ORDER_STATUS_MAX_REQUESTS) {
              return { success: false, message: 'Too many requests', order: null };
            }
            entry.timestamps.push(Date.now());
            orderStatusThrottle.set(throttleKey, entry);
          } catch (_) {}

          // Map provider statuses to internal enum
          const normalizeStatus = (v) => {
            if (!v) return null;
            const s = String(v).trim().toUpperCase();
            if (s === 'CONFIRMED' || s === 'PAID') return 'SUCCEEDED';
            if (s === 'PENDING') return 'PENDING';
            if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELED';
            if (s === 'FAILED') return 'FAILED';
            if (s === 'REFUNDED') return 'REFUNDED';
            return s;
          };
          const newStatus = normalizeStatus(status);

          const allowed = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED'];
          if (!orderId || typeof orderId !== 'string') {
            return { success: false, message: 'Order not found', order: null };
          }
          if (!newStatus || !allowed.includes(newStatus)) {
            return { success: false, message: 'Invalid status', order: null };
          }

          // amount: numeric positive (if provided)
          let amountNumber = undefined;
          if (amount !== undefined && amount !== null) {
            const parsed = parseFloat(String(amount));
            if (!Number.isFinite(parsed) || parsed <= 0) {
              return { success: false, message: 'Invalid amount', order: null };
            }
            amountNumber = parsed;
          }

          // currency: ISO-4217 uppercase (if provided)
          let currencyUpper = undefined;
          if (currency !== undefined && currency !== null) {
            const c = String(currency).trim().toUpperCase();
            if (!/^[A-Z]{3}$/.test(c)) {
              return { success: false, message: 'Invalid currency', order: null };
            }
            currencyUpper = c;
          }

          // Load order
          const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();
          if (orderErr || !order) {
            return { success: false, message: 'Order not found', order: null };
          }

          const oldStatus = String(order.status).toUpperCase();
          const currentTransactionId = order?.metadata?.last_transaction_id || null;
          const currentAmount = Number(order.amount);
          const currentCurrency = order.currency;

          // Idempotency check
          const sameStatus = oldStatus === newStatus;
          const sameTxn = (transactionId ? transactionId : currentTransactionId) === currentTransactionId;
          const sameAmount = amountNumber === undefined || Number(amountNumber) === Number(currentAmount);
          const sameCurrency = currencyUpper === undefined || currencyUpper === currentCurrency;
          if (sameStatus && sameTxn && sameAmount && sameCurrency) {
            // Log event anyway for audit, but do not duplicate updates
            try {
              await supabase.from('payment_logs').insert({
                order_id: order.id,
                event_type: 'WEBHOOK_PROCESSED',
                netopia_order_id: order.netopia_order_id,
                amount: amountNumber !== undefined ? amountNumber : currentAmount,
                currency: currencyUpper || currentCurrency,
                status: newStatus,
                raw_payload: rawData || {},
                created_at: nowIso
              });
            } catch (_) {}

            return {
              success: true,
              message: 'Order updated',
              order: {
                ...order,
                amount: currentAmount,
                currency: currentCurrency,
                updated_at: order.updated_at
              }
            };
          }

          // Validate transitions
          const invalid = (msg) => ({ success: false, message: msg, order: null });
          // Terminal state
          if (oldStatus === 'REFUNDED' && newStatus !== 'REFUNDED') {
            return invalid('Invalid transition');
          }
          // From SUCCEEDED
          if (oldStatus === 'SUCCEEDED') {
            if (newStatus === 'REFUNDED') {
              // ok
            } else if (newStatus === 'FAILED' || newStatus === 'CANCELED') {
              return invalid('Invalid transition');
            }
          }
          // From FAILED/CANCELED to SUCCEEDED requires transactionId and no previous SUCCEEDED
          if ((oldStatus === 'FAILED' || oldStatus === 'CANCELED') && newStatus === 'SUCCEEDED') {
            if (!transactionId) {
              return invalid('Invalid transition');
            }
          }
          // PENDING can move to SUCCEEDED/FAILED/CANCELED
          // Other combinations generally allowed unless restricted above

          // Prepare update
          const updatedMetadata = {
            ...(order.metadata || {}),
            ...(transactionId ? { last_transaction_id: transactionId } : {})
          };
          // Add status timestamps in metadata for audit
          const statusTsKey = {
            SUCCEEDED: 'succeeded_at',
            FAILED: 'failed_at',
            CANCELED: 'canceled_at',
            REFUNDED: 'refunded_at'
          }[newStatus];
          if (statusTsKey) {
            updatedMetadata[statusTsKey] = nowIso;
          }

          const updatePayload = {
            status: newStatus,
            ...(amountNumber !== undefined ? { amount: amountNumber } : {}),
            ...(currencyUpper ? { currency: currencyUpper } : {}),
            metadata: updatedMetadata,
            updated_at: nowIso
          };

          const { data: updatedRows, error: updErr } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', order.id)
            .select('*');
          if (updErr || !updatedRows || !updatedRows[0]) {
            return { success: false, message: 'Failed to update order', order: null };
          }
          const updatedOrder = updatedRows[0];

          // On succeeded: optional activation handled elsewhere by webhook/service; here ensure txn stored
          // On refunded: optionally create refund record if model supports; skipped here to avoid side effects

          // Persist event log
          try {
            await supabase.from('payment_logs').insert({
              order_id: updatedOrder.id,
              event_type: 'WEBHOOK_PROCESSED',
              netopia_order_id: updatedOrder.netopia_order_id,
              amount: Number(updatedOrder.amount),
              currency: updatedOrder.currency,
              status: newStatus,
              raw_payload: rawData || {},
              created_at: nowIso
            });
          } catch (_) {}

          // Semantic log
          console.log(JSON.stringify({
            operation: 'updateOrderStatus',
            orderId: order.id,
            oldStatus,
            newStatus,
            transactionId: transactionId || null,
            amount: amountNumber !== undefined ? amountNumber : updatedOrder.amount,
            currency: currencyUpper || updatedOrder.currency,
            timestamp: nowIso
          }));

          return {
            success: true,
            message: 'Order updated',
            order: updatedOrder
          };
        } catch (err) {
          // Convert any error to GraphQL payload with success=false without throwing
          const msg = err?.message && typeof err.message === 'string' ? err.message : 'Internal error';
          return { success: false, message: msg, order: null };
        }
      },

      // =====================================================
      // SAVED SEARCHES MUTATIONS
      // =====================================================

      // Salvează o căutare
      saveSearch: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedInput = validateGraphQLData(input, saveSearchInputSchema);
          return await savedSearchService.saveSearch(context.user.id, validatedInput);
        } catch (error) {
          throw error;
        }
      },

      // Actualizează o căutare salvată
      updateSavedSearch: async (parent, { id, input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedId = validateGraphQLData(id, idSchema);
          const validatedInput = validateGraphQLData(input, updateSavedSearchInputSchema);
          return await savedSearchService.updateSavedSearch(context.user.id, validatedId, validatedInput);
        } catch (error) {
          throw error;
        }
      },

      // Șterge o căutare salvată
      deleteSavedSearch: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedId = validateGraphQLData(id, idSchema);
          return await savedSearchService.deleteSavedSearch(context.user.id, validatedId);
        } catch (error) {
          throw error;
        }
      },

      // Comută statusul de favorit pentru o căutare salvată
      toggleFavoriteSearch: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedId = validateGraphQLData(id, idSchema);
          return await savedSearchService.toggleFavoriteSearch(context.user.id, validatedId);
        } catch (error) {
          throw error;
        }
      },

      // Activează/dezactivează notificările email pentru o căutare salvată
      toggleEmailNotifications: async (parent, { id, enabled }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          const validatedId = validateGraphQLData(id, idSchema);
          return await savedSearchService.toggleEmailNotifications(context.user.id, validatedId, enabled);
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // EMAIL TEMPLATE MUTATIONS (ADMIN ONLY)
      // =====================================================

      createEmailTemplate: async (parent, { input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          // For now, allow any authenticated user to create templates
          return await emailTemplateService.createTemplate(input);
        } catch (error) {
          throw error;
        }
      },

      updateEmailTemplate: async (parent, { id, input }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          const validatedId = validateGraphQLData(id, idSchema);
          return await emailTemplateService.updateTemplate(validatedId, input);
        } catch (error) {
          throw error;
        }
      },

      deleteEmailTemplate: async (parent, { id }, context) => {
        try {
          if (!context.user) {
            throw new GraphQLError('Utilizator neautentificat', {
              extensions: { code: 'UNAUTHENTICATED' }
            });
          }

          // TODO: Add admin role check
          const validatedId = validateGraphQLData(id, idSchema);
          return await emailTemplateService.deleteTemplate(validatedId);
        } catch (error) {
          throw error;
        }
      },

      // =====================================================
      // COMMENT MUTATIONS
      // =====================================================

      createComment: async (parent, { input }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          // Validează captcha doar dacă middleware-ul nu a fost bypassat
          // (pentru utilizatori neautentificați sau fără abonament valid)
          const captchaInfo = getCaptchaInfo(context);
          if (captchaInfo === null) {
            // Middleware-ul a fost bypassat pentru utilizatori autentificați cu abonament valid
            console.log('✅ [CAPTCHA] Bypassed in resolver for authenticated user with valid subscription/trial');
          } else {
            // Validează captcha pentru utilizatori neautentificați sau fără abonament valid
            validateCaptchaInResolver(context, 'createComment');
          }
          
          // Validează input-ul
          const validationResult = createCommentInputSchema.safeParse(input);
          if (!validationResult.success) {
            throw new GraphQLError('Date invalide pentru comentariu', {
              extensions: { 
                code: 'VALIDATION_ERROR',
                details: validationResult.error.errors
              }
            });
          }

          const validatedInput = validationResult.data;
          
          // Convertește parentType la lowercase pentru baza de date
          const commentData = {
            ...validatedInput,
            parentType: validatedInput.parentType.toLowerCase()
          };

          return await commentService.createComment(user.id, commentData);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'COMMENT_CREATE_ERROR' }
          });
        }
      },

      updateComment: async (parent, { id, input }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          // Validează input-ul
          const validationResult = updateCommentInputSchema.safeParse(input);
          if (!validationResult.success) {
            throw new GraphQLError('Date invalide pentru actualizarea comentariului', {
              extensions: { 
                code: 'VALIDATION_ERROR',
                details: validationResult.error.errors
              }
            });
          }

          const validatedId = validateGraphQLData(id, commentIdSchema);
          const validatedInput = validationResult.data;

          return await commentService.updateComment(validatedId, user.id, validatedInput);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'COMMENT_UPDATE_ERROR' }
          });
        }
      },

      deleteComment: async (parent, { id }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          const validatedId = validateGraphQLData(id, commentIdSchema);
          return await commentService.deleteComment(validatedId, user.id);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'COMMENT_DELETE_ERROR' }
          });
        }
      },

      // =====================================================
      // FAVORITE NEWS MUTATIONS
      // =====================================================

      addFavoriteNews: async (parent, { newsId }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          const validatedNewsId = validateGraphQLData(newsId, newsIdSchema);
          return await favoriteNewsService.addFavoriteNews(user.id, validatedNewsId);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'FAVORITE_NEWS_ADD_ERROR' }
          });
        }
      },

      removeFavoriteNews: async (parent, { newsId }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          const validatedNewsId = validateGraphQLData(newsId, newsIdSchema);
          return await favoriteNewsService.removeFavoriteNews(user.id, validatedNewsId);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'FAVORITE_NEWS_REMOVE_ERROR' }
          });
        }
      },

      toggleFavoriteNews: async (parent, { newsId }, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          const validatedNewsId = validateGraphQLData(newsId, newsIdSchema);
          return await favoriteNewsService.toggleFavoriteNews(user.id, validatedNewsId);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'FAVORITE_NEWS_TOGGLE_ERROR' }
          });
        }
      },

      clearAllFavoriteNews: async (parent, args, context) => {
        try {
          const user = requireTrialOrSubscription(context);
          
          return await favoriteNewsService.clearAllFavoriteNews(user.id);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message, {
            extensions: { code: 'FAVORITE_NEWS_CLEAR_ERROR' }
          });
        }
      },

      // Rezolvare periodică pentru conexiuni externe
      runExternalResolution: async (parent, { limit = 1000 }, context) => {
        try {
          // Necesită autentificare + trial/abonament (sau poți muta pe admin-only)
          requireTrialOrSubscription(context, true);
          const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
          const { data, error } = await supabase.rpc('resolve_external_legislative_references', { p_limit: safeLimit });
          if (error) {
            throw new GraphQLError('Eroare la rezolvarea conexiunilor externe', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }
          return Number(data || 0);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message || 'Eroare internă', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      runExternalResolutionRecent: async (parent, { days = 30, limit = 2000 }, context) => {
        try {
          requireTrialOrSubscription(context, true);
          const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
          const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 2000));
          const { data, error } = await supabase.rpc('resolve_external_legislative_references_recent', { p_days: safeDays, p_limit: safeLimit });
          if (error) {
            throw new GraphQLError('Eroare la rezolvarea recentă a conexiunilor externe', { extensions: { code: 'DATABASE_ERROR', details: error.message } });
          }
          return Number(data || 0);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError(error.message || 'Eroare internă', { extensions: { code: 'INTERNAL_ERROR' } });
        }
      }
    }
  };
}

export default createResolvers;
