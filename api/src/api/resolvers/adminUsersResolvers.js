/**
 * Resolver-i GraphQL pentru gestionarea utilizatorilor de către administratori
 * Toate operațiunile necesită verificarea rolului de administrator
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { validateGraphQLData } from '../../middleware/security.js';

// Schema de validare pentru input-uri admin
const adminUserFiltersSchema = z.object({
  status: z.object({
    eq: z.boolean().optional()
  }).optional(),
  subscriptionType: z.object({
    eq: z.enum(['FREE', 'PRO_MONTHLY', 'PRO_YEARLY', 'ENTERPRISE_MONTHLY', 'ENTERPRISE_YEARLY']).optional()
  }).optional(),
  subscriptionStatus: z.object({
    eq: z.enum(['ACTIVE', 'CANCELED', 'PAST_DUE', 'UNPAID', 'TRIALING', 'PENDING', 'INCOMPLETE', 'INCOMPLETE_EXPIRED']).optional()
  }).optional(),
  isAdmin: z.object({
    eq: z.boolean().optional()
  }).optional()
}).optional();

const adminUsersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortField: z.enum(['NAME', 'EMAIL', 'CREATED_AT', 'LAST_LOGIN_AT', 'IS_ACTIVE', 'SUBSCRIPTION_TYPE', 'SUBSCRIPTION_STATUS']).optional(),
  sortDirection: z.enum(['ASC', 'DESC']).default('ASC'),
  filters: adminUserFiltersSchema
});

/**
 * Verifică dacă utilizatorul curent este administrator
 * @param {Object} context - Contextul GraphQL
 * @param {Object} userService - Serviciul de utilizatori
 * @throws {GraphQLError} Dacă utilizatorul nu este administrator
 */
async function requireAdmin(context, userService) {
  if (!context.user) {
    throw new GraphQLError('Autentificare necesară', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }

  const isAdmin = await userService.isAdmin(context.user.id);
  if (!isAdmin) {
    throw new GraphQLError('Acces interzis: necesită rol admin', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
}

/**
 * Mapează tipurile de subscripție din baza de date la enum-urile GraphQL
 */
function mapSubscriptionType(tierName) {
  const mapping = {
    'free': 'FREE',
    'pro': 'PRO_MONTHLY', // În baza de date avem doar 'pro', îl mapăm la PRO_MONTHLY
    'pro-monthly': 'PRO_MONTHLY',
    'pro-yearly': 'PRO_YEARLY',
    'enterprise': 'ENTERPRISE_MONTHLY', // În baza de date avem doar 'enterprise', îl mapăm la ENTERPRISE_MONTHLY
    'enterprise-monthly': 'ENTERPRISE_MONTHLY',
    'enterprise-yearly': 'ENTERPRISE_YEARLY'
  };
  return mapping[tierName?.toLowerCase()] || 'FREE';
}

/**
 * Mapează statusurile de subscripție din baza de date la enum-urile GraphQL
 */
function mapSubscriptionStatus(status) {
  const mapping = {
    'ACTIVE': 'ACTIVE',
    'CANCELED': 'CANCELED',
    'PAST_DUE': 'PAST_DUE',
    'UNPAID': 'UNPAID',
    'TRIALING': 'TRIALING',
    'PENDING': 'PENDING',
    'INCOMPLETE': 'INCOMPLETE',
    'INCOMPLETE_EXPIRED': 'INCOMPLETE_EXPIRED'
  };
  return mapping[status] || 'PENDING';
}

/**
 * Mapează statusurile de plată din baza de date la enum-urile GraphQL
 */
function mapPaymentStatus(status) {
  const mapping = {
    'SUCCEEDED': 'SUCCESS',
    'SUCCESS': 'SUCCESS',
    'FAILED': 'FAILED',
    'PENDING': 'PENDING',
    'PROCESSING': 'PENDING',
    'REFUNDED': 'REFUNDED',
    'PARTIALLY_REFUNDED': 'REFUNDED',
    'CANCELED': 'FAILED'
  };
  return mapping[status] || 'PENDING';
}

/**
 * Mapează metodele de plată din baza de date la enum-urile GraphQL
 */
function mapPaymentMethod(brand) {
  const mapping = {
    'visa': 'CARD',
    'mastercard': 'CARD',
    'amex': 'CARD',
    'discover': 'CARD',
    'diners': 'CARD',
    'jcb': 'CARD',
    'unionpay': 'CARD',
    'paypal': 'PAYPAL',
    'bank_transfer': 'BANK_TRANSFER'
  };
  return mapping[brand?.toLowerCase()] || 'CARD';
}

/**
 * Generează label-uri în română pentru tipurile de subscripție
 */
function getSubscriptionTypeLabel(type) {
  const labels = {
    'FREE': 'Gratuit',
    'PRO_MONTHLY': 'Pro', // Pentru 'pro' din baza de date
    'PRO_YEARLY': 'Pro Anual',
    'ENTERPRISE_MONTHLY': 'Enterprise', // Pentru 'enterprise' din baza de date
    'ENTERPRISE_YEARLY': 'Enterprise Anual'
  };
  return labels[type] || 'Necunoscut';
}

/**
 * Generează label-uri în română pentru statusurile de subscripție
 */
function getSubscriptionStatusLabel(status) {
  const labels = {
    'ACTIVE': 'Activă',
    'CANCELED': 'Anulată',
    'PAST_DUE': 'Restantă',
    'UNPAID': 'Neplătită',
    'TRIALING': 'Trial',
    'PENDING': 'În așteptare',
    'INCOMPLETE': 'Incompletă',
    'INCOMPLETE_EXPIRED': 'Trial expirat'
  };
  return labels[status] || 'Necunoscut';
}

/**
 * Generează label-uri în română pentru statusurile de plată
 */
function getPaymentStatusLabel(status) {
  const labels = {
    'SUCCESS': 'Succes',
    'FAILED': 'Eșuată',
    'PENDING': 'În așteptare',
    'REFUNDED': 'Rambursată'
  };
  return labels[status] || 'Necunoscut';
}

/**
 * Generează label-uri în română pentru metodele de plată
 */
function getPaymentMethodLabel(method) {
  const labels = {
    'CARD': 'Card',
    'PAYPAL': 'PayPal',
    'BANK_TRANSFER': 'Transfer bancar'
  };
  return labels[method] || 'Necunoscut';
}

/**
 * Generează label-uri pentru statusul utilizatorului
 */
function getUserStatusLabel(isActive) {
  return isActive ? 'Activ' : 'Inactiv';
}

/**
 * Factory pentru crearea resolver-ilor admin users
 * @param {Object} services - Serviciile injectate
 * @returns {Object} Resolver-ii GraphQL pentru admin users
 */
export function createAdminUsersResolvers(services) {
  const { userService, supabaseClient, newsletterRepository } = services;

  return {
    // Resolver-i pentru tipuri admin
    AdminUser: {
      id: (parent) => parent.id,
      name: (parent) => parent.display_name || parent.email?.split('@')[0] || 'Utilizator',
      email: (parent) => parent.email,
      avatar: (parent) => parent.avatar_url,
      createdAt: (parent) => parent.created_at,
      lastLoginAt: (parent) => parent.last_sign_in_at,
      isActive: (parent) => parent.is_active !== false, // Default true dacă nu e setat
      isAdmin: async (parent, args, context) => {
        try {
          return await userService.isAdmin(parent.id);
        } catch (error) {
          console.error('Error checking admin status:', error);
          return false;
        }
      },
      statusLabel: (parent) => getUserStatusLabel(parent.is_active !== false),
      subscription: async (parent) => {
        try {
          const { data: subscription, error } = await supabaseClient
            .from('subscriptions')
            .select(`
              *,
              subscription_tiers!inner(*)
            `)
            .eq('user_id', parent.id)
            .eq('status', 'ACTIVE')
            .single();

          if (error || !subscription) {
            return null;
          }

          return {
            id: subscription.id,
            type: mapSubscriptionType(subscription.subscription_tiers?.name),
            status: mapSubscriptionStatus(subscription.status),
            startDate: subscription.current_period_start,
            endDate: subscription.current_period_end,
            autoRenew: subscription.auto_renew || false,
            price: subscription.subscription_tiers?.price || 0,
            currency: subscription.subscription_tiers?.currency || 'RON',
            typeLabel: getSubscriptionTypeLabel(mapSubscriptionType(subscription.subscription_tiers?.name)),
            statusLabel: getSubscriptionStatusLabel(mapSubscriptionStatus(subscription.status))
          };
        } catch (error) {
          console.error('Error fetching subscription:', error);
          return null;
        }
      },
      favoriteNews: async (parent) => {
        try {
          const { data: favorites, error } = await supabaseClient
            .from('favorite_news')
            .select(`
              *,
              stiri!inner(id, title, publication_date, content)
            `)
            .eq('user_id', parent.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (error || !favorites) {
            return [];
          }

          return favorites.map(fav => ({
            id: fav.id,
            title: fav.stiri?.title || 'Știre necunoscută',
            url: `/stiri/${fav.news_id}`,
            addedAt: fav.created_at,
            category: fav.stiri?.content?.category || 'General'
          }));
        } catch (error) {
          console.error('Error fetching favorite news:', error);
          return [];
        }
      },
      savedSearches: async (parent) => {
        try {
          const { data: searches, error } = await supabaseClient
            .from('saved_searches')
            .select('*')
            .eq('user_id', parent.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (error || !searches) {
            return [];
          }

          return searches.map(search => ({
            id: search.id,
            query: search.search_params?.query || '',
            filters: {
              categories: search.search_params?.categories || [],
              dateRange: search.search_params?.dateRange ? {
                start: search.search_params.dateRange.start,
                end: search.search_params.dateRange.end
              } : null
            },
            createdAt: search.created_at,
            lastUsed: search.updated_at
          }));
        } catch (error) {
          console.error('Error fetching saved searches:', error);
          return [];
        }
      },
      preferences: async (parent) => {
        try {
          const { data: preferences, error } = await supabaseClient
            .from('user_preferences')
            .select('*')
            .eq('id', parent.id)
            .single();

          if (error || !preferences) {
            return {
              categories: [],
              notifications: {
                email: false,
                push: false,
                newsletter: false
              },
              language: 'ro',
              theme: 'LIGHT'
            };
          }

          return {
            categories: preferences.preferred_categories || [],
            notifications: {
              email: preferences.notification_settings?.email || false,
              push: preferences.notification_settings?.push || false,
              newsletter: preferences.notification_settings?.newsletter || false
            },
            language: preferences.notification_settings?.language || 'ro',
            theme: preferences.notification_settings?.theme || 'LIGHT'
          };
        } catch (error) {
          console.error('Error fetching preferences:', error);
          return {
            categories: [],
            notifications: {
              email: false,
              push: false,
              newsletter: false
            },
            language: 'ro',
            theme: 'LIGHT'
          };
        }
      },
      paymentHistory: async (parent) => {
        try {
          const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('user_id', parent.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (error || !orders) {
            return [];
          }

          return orders.map(order => ({
            id: order.id,
            amount: order.amount || 0,
            currency: order.currency || 'RON',
            status: mapPaymentStatus(order.status),
            method: 'CARD', // Default, ar trebui să vină din payment_methods
            transactionId: order.netopia_order_id || order.id,
            createdAt: order.created_at,
            description: `Plată subscripție`,
            statusLabel: getPaymentStatusLabel(mapPaymentStatus(order.status)),
            methodLabel: getPaymentMethodLabel('CARD')
          }));
        } catch (error) {
          console.error('Error fetching payment history:', error);
          return [];
        }
      }
    },

    // Resolver-i pentru tipuri admin newsletter subscribers
    AdminNewsletterSubscriber: {
      id: (parent) => String(parent.id),
      email: (parent) => parent.email,
      status: (parent) => {
        const statusMap = {
          'subscribed': 'SUBSCRIBED',
          'unsubscribed': 'UNSUBSCRIBED',
          'bounced': 'BOUNCED',
          'complained': 'COMPLAINED'
        };
        return statusMap[parent.status?.toLowerCase()] || 'SUBSCRIBED';
      },
      statusLabel: (parent) => {
        const labelMap = {
          'subscribed': 'Abonat',
          'unsubscribed': 'Dezabonat',
          'bounced': 'Respins',
          'complained': 'Plângere'
        };
        return labelMap[parent.status?.toLowerCase()] || 'Abonat';
      },
      locale: (parent) => parent.locale || 'ro-RO',
      tags: (parent) => parent.tags || [],
      source: (parent) => parent.source,
      createdAt: (parent) => parent.created_at,
      updatedAt: (parent) => parent.updated_at,
      subscribedAt: (parent) => parent.subscribed_at,
      unsubscribedAt: (parent) => parent.unsubscribed_at,
      unsubscribeReason: (parent) => parent.unsubscribe_reason,
      lastIp: (parent) => parent.last_ip,
      lastUserAgent: (parent) => parent.last_user_agent,
      consentVersion: (parent) => parent.consent_version,
      consentAt: (parent) => parent.consent_at,
      metadata: (parent) => parent.metadata || {}
    },

    // Resolver-i pentru query-uri admin
    Query: {
      adminNewsletterSubscribers: async (parent, args, context) => {
        try {
          // Verifică dacă utilizatorul este administrator
          await requireAdmin(context, userService);

          if (!newsletterRepository) {
            throw new GraphQLError('NewsletterRepository nu este disponibil', {
              extensions: { code: 'INTERNAL_ERROR' }
            });
          }

          const { page = 1, limit = 10, sortField = 'CREATED_AT', sortDirection = 'DESC', filters = {} } = args;

          // Validează argumentele
          if (page < 1 || limit < 1 || limit > 100) {
            throw new GraphQLError('Parametri invalizi pentru paginare', {
              extensions: { code: 'BAD_REQUEST' }
            });
          }

          // Obține abonații
          const result = await newsletterRepository.getAllSubscribers({
            page,
            limit,
            sortField,
            sortDirection,
            filters: filters || {}
          });

          // Calculează informațiile de paginare
          const totalCount = result.totalCount || 0;
          const totalPages = Math.ceil(totalCount / limit);
          const hasNextPage = page < totalPages;
          const hasPreviousPage = page > 1;

          return {
            subscribers: result.data || [],
            pagination: {
              totalCount,
              totalPages,
              currentPage: page,
              hasNextPage,
              hasPreviousPage
            }
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare internă la preluarea abonaților newsletter', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminNewsletterSubscriberStatuses: async (parent, args, context) => {
        try {
          // Verifică dacă utilizatorul este administrator
          await requireAdmin(context, userService);

          // Returnează toate statusurile disponibile cu label-urile în română
          return [
            {
              value: 'SUBSCRIBED',
              label: 'Abonat',
              description: 'Utilizatorul este abonat la newsletter'
            },
            {
              value: 'UNSUBSCRIBED',
              label: 'Dezabonat',
              description: 'Utilizatorul s-a dezabonat de la newsletter'
            },
            {
              value: 'BOUNCED',
              label: 'Respins',
              description: 'Email-ul a fost respins (bounce)'
            },
            {
              value: 'COMPLAINED',
              label: 'Plângere',
              description: 'Utilizatorul a raportat email-ul ca spam'
            }
          ];
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare internă la preluarea statusurilor', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsers: async (parent, args, context) => {
        try {
          // Verifică dacă utilizatorul este administrator
          await requireAdmin(context, userService);

          // Validează argumentele
          const validatedArgs = validateGraphQLData(args, adminUsersQuerySchema);

          const { page, limit, search, sortField, sortDirection, filters } = validatedArgs;
          const offset = (page - 1) * limit;

          // Obține utilizatorii folosind funcția RPC
          const { data: users, error } = await supabaseClient.rpc('get_all_users_with_profiles', {
            page_number: page,
            page_size: limit,
            search_term: search || null,
            sort_field: sortField || 'created_at',
            sort_direction: sortDirection || 'DESC'
          });

          // Obține numărul total de utilizatori
          const { data: totalCount, error: countError } = await supabaseClient.rpc('count_all_users_with_profiles', {
            search_term: search || null
          });

          if (error || countError) {
            throw new GraphQLError('Eroare la preluarea utilizatorilor', {
              extensions: { code: 'DATABASE_ERROR', details: error?.message || countError?.message }
            });
          }

          // Calculează informațiile de paginare
          const totalUsers = totalCount || 0;
          const totalPages = Math.ceil(totalUsers / limit);
          const hasNextPage = page < totalPages;
          const hasPreviousPage = page > 1;

          return {
            users: users || [],
            pagination: {
              totalCount: totalUsers,
              totalPages,
              currentPage: page,
              hasNextPage,
              hasPreviousPage
            }
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare internă la preluarea utilizatorilor', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUserStats: async (parent, args, context) => {
        try {
          // Verifică dacă utilizatorul este administrator
          await requireAdmin(context, userService);

          // Obține statisticile utilizatorilor folosind funcția RPC
          const { data: stats, error } = await supabaseClient.rpc('get_user_stats');

          if (error) {
            throw new GraphQLError('Eroare la preluarea statisticilor', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }

          const statsData = stats?.[0] || {
            total_users: 0,
            active_users: 0,
            free_users: 0,
            pro_users: 0,
            enterprise_users: 0
          };

          return {
            totalUsers: statsData.total_users,
            activeUsers: statsData.active_users,
            freeUsers: statsData.free_users,
            proUsers: statsData.pro_users,
            enterpriseUsers: statsData.enterprise_users
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare internă la preluarea statisticilor', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      }
    },

    // Resolver-i pentru mutations admin
    Mutation: {
      adminUsersCancelSubscription: async (parent, { userId, subscriptionId }, context) => {
        try {
          await requireAdmin(context, userService);

          // TODO: Implementează anularea subscripției
          // Pentru moment returnează un răspuns de succes
          return {
            success: true,
            message: 'Subscripția a fost anulată cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la anularea subscripției', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersReactivateSubscription: async (parent, { userId, subscriptionId }, context) => {
        try {
          await requireAdmin(context, userService);

          // TODO: Implementează reactivarea subscripției
          return {
            success: true,
            message: 'Subscripția a fost reactivată cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la reactivarea subscripției', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersSuspendUser: async (parent, { userId }, context) => {
        try {
          await requireAdmin(context, userService);

          // Actualizează statusul utilizatorului
          // Pentru moment, vom folosi un câmp în user_metadata pentru a marca utilizatorul ca suspendat
          const { error } = await supabaseClient.auth.admin.updateUserById(userId, {
            user_metadata: { is_suspended: true }
          });

          if (error) {
            throw new GraphQLError('Eroare la suspendarea utilizatorului', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }

          return {
            success: true,
            message: 'Utilizatorul a fost suspendat cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la suspendarea utilizatorului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersActivateUser: async (parent, { userId }, context) => {
        try {
          await requireAdmin(context, userService);

          // Actualizează statusul utilizatorului
          const { error } = await supabaseClient.auth.admin.updateUserById(userId, {
            user_metadata: { is_suspended: false }
          });

          if (error) {
            throw new GraphQLError('Eroare la activarea utilizatorului', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }

          return {
            success: true,
            message: 'Utilizatorul a fost activat cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la activarea utilizatorului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersDeleteUser: async (parent, { userId }, context) => {
        try {
          await requireAdmin(context, userService);

          // Șterge utilizatorul din Supabase Auth (operațiune ireversibilă)
          const { error } = await supabaseClient.auth.admin.deleteUser(userId);

          if (error) {
            throw new GraphQLError('Eroare la ștergerea utilizatorului', {
              extensions: { code: 'DATABASE_ERROR', details: error.message }
            });
          }

          // FKs către auth.users au ON DELETE CASCADE, deci datele corelate sunt curățate automat
          return {
            success: true,
            message: 'Utilizatorul a fost șters cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la ștergerea utilizatorului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersPromoteToAdmin: async (parent, { userId }, context) => {
        try {
          await requireAdmin(context, userService);

          // TODO: Implementează promovarea la administrator
          return {
            success: true,
            message: 'Utilizatorul a fost promovat la administrator cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la promovarea utilizatorului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminUsersDemoteFromAdmin: async (parent, { userId }, context) => {
        try {
          await requireAdmin(context, userService);

          // TODO: Implementează demotarea de la administrator
          return {
            success: true,
            message: 'Utilizatorul a fost demotat de la administrator cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la demotarea utilizatorului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      // =====================================================
      // ADMIN NEWSLETTER SUBSCRIBERS MUTATIONS
      // =====================================================

      adminNewsletterSubscribersDelete: async (parent, { subscriberId }, context) => {
        try {
          await requireAdmin(context, userService);

          if (!newsletterRepository) {
            throw new GraphQLError('NewsletterRepository nu este disponibil', {
              extensions: { code: 'INTERNAL_ERROR' }
            });
          }

          await newsletterRepository.deleteSubscriber(parseInt(subscriberId));

          return {
            success: true,
            message: 'Abonatul a fost șters cu succes'
          };
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la ștergerea abonatului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      },

      adminNewsletterSubscribersUpdateStatus: async (parent, { input }, context) => {
        try {
          await requireAdmin(context, userService);

          if (!newsletterRepository) {
            throw new GraphQLError('NewsletterRepository nu este disponibil', {
              extensions: { code: 'INTERNAL_ERROR' }
            });
          }

          const { subscriberId, status } = input;

          const updatedSubscriber = await newsletterRepository.updateSubscriberStatus(
            parseInt(subscriberId),
            status
          );

          return updatedSubscriber;
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          throw new GraphQLError('Eroare la actualizarea statusului abonatului', {
            extensions: { code: 'INTERNAL_ERROR' }
          });
        }
      }
    }
  };
}

export default createAdminUsersResolvers;
