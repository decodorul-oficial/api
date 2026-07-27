/**
 * GraphQL resolvers for in-app notifications inbox.
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { validateGraphQLData } from '../../middleware/security.js';
import { idSchema } from '../../config/validation.js';

const ratingSchema = z.number().int().min(1).max(5);

async function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('Utilizator neautentificat', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.user;
}

export function createNotificationResolvers({ notificationService }) {
  return {
    Query: {
      getMyNotifications: async (_parent, { limit, offset }, context) => {
        const user = await requireAuth(context);
        return notificationService.getMyNotifications(user.id, { limit, offset });
      },

      unreadNotificationCount: async (_parent, _args, context) => {
        const user = await requireAuth(context);
        return notificationService.unreadNotificationCount(user.id);
      },
    },

    Mutation: {
      markNotificationRead: async (_parent, { id }, context) => {
        const user = await requireAuth(context);
        const validatedId = validateGraphQLData(id, idSchema);
        return notificationService.markNotificationRead(user.id, validatedId);
      },

      markAllNotificationsRead: async (_parent, _args, context) => {
        const user = await requireAuth(context);
        return notificationService.markAllNotificationsRead(user.id);
      },

      rateAlert: async (_parent, { notificationId, rating }, context) => {
        const user = await requireAuth(context);
        const validatedId = validateGraphQLData(notificationId, idSchema);
        const validatedRating = validateGraphQLData(rating, ratingSchema);
        return notificationService.rateAlert(user.id, validatedId, validatedRating);
      },
    },
  };
}

export default createNotificationResolvers;
