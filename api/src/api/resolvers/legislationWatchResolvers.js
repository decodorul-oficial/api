/**
 * GraphQL resolvers for legislation watches and email ops.
 */

import { GraphQLError } from 'graphql';
import { validateGraphQLData } from '../../middleware/security.js';
import { idSchema } from '../../config/validation.js';
import { z } from 'zod';

const addLegislationWatchInputSchema = z.object({
  label: z.string().min(1).max(200),
  targetType: z.enum(['STIRI', 'EXTERNAL', 'NORMALIZED_REF']),
  targetStiriId: z.string().optional().nullable(),
  targetExternalId: z.string().optional().nullable(),
  identifierText: z.string().optional().nullable(),
  alertIntensity: z.enum(['IMPORTANT', 'CRITICAL', 'MENTIONS']).optional(),
  emailEnabled: z.boolean().optional(),
}).strict();

const alertIntensitySchema = z.enum(['IMPORTANT', 'CRITICAL', 'MENTIONS']);

async function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('Utilizator neautentificat', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.user;
}

async function requireAdmin(context, userService) {
  await requireAuth(context);
  const isAdmin = await userService.isAdmin(context.user.id);
  if (!isAdmin) {
    throw new GraphQLError('Acces interzis', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
}

export function createLegislationWatchResolvers({ legislationWatchService, dailyDigestService, userService }) {
  return {
    Query: {
      getLegislationWatches: async (_parent, _args, context) => {
        await requireAuth(context);
        return legislationWatchService.list(context.user.id);
      },

      getLegislationWatchLimitInfo: async (_parent, _args, context) => {
        await requireAuth(context);
        return legislationWatchService.getLimitInfo(context.user.id);
      },

      getAlertStatus: async (_parent, _args, context) => {
        await requireAuth(context);
        return legislationWatchService.getAlertStatus(context.user.id);
      },

      getEmailOpsSummary: async (_parent, _args, context) => {
        await requireAdmin(context, userService);
        return dailyDigestService.getEmailOpsSummary();
      },
    },

    Mutation: {
      addLegislationWatch: async (_parent, { input }, context) => {
        await requireAuth(context);
        const validated = validateGraphQLData(input, addLegislationWatchInputSchema);
        return legislationWatchService.add(context.user.id, validated);
      },

      updateLegislationWatch: async (_parent, { id, alertIntensity, label }, context) => {
        await requireAuth(context);
        const validatedId = validateGraphQLData(id, idSchema);
        const payload = {};
        if (alertIntensity != null) {
          payload.alertIntensity = validateGraphQLData(alertIntensity, alertIntensitySchema);
        }
        if (label != null) payload.label = label;
        return legislationWatchService.update(context.user.id, validatedId, payload);
      },

      removeLegislationWatch: async (_parent, { id }, context) => {
        await requireAuth(context);
        const validatedId = validateGraphQLData(id, idSchema);
        return legislationWatchService.remove(context.user.id, validatedId);
      },

      toggleWatchEmail: async (_parent, { id, enabled }, context) => {
        await requireAuth(context);
        const validatedId = validateGraphQLData(id, idSchema);
        return legislationWatchService.toggleEmail(context.user.id, validatedId, enabled);
      },

      toggleWatchInstant: async (_parent, { id, enabled }, context) => {
        await requireAuth(context);
        const validatedId = validateGraphQLData(id, idSchema);
        return legislationWatchService.toggleInstant(context.user.id, validatedId, enabled);
      },

      bulkSetWatchEmail: async (_parent, { enabled }, context) => {
        await requireAuth(context);
        return legislationWatchService.bulkSetWatchEmail(context.user.id, enabled);
      },

      updateAlertMasterSettings: async (_parent, args, context) => {
        await requireAuth(context);
        return legislationWatchService.updateAlertMasterSettings(context.user.id, {
          digestEmailEnabled: args.digestEmailEnabled,
          instantMasterEnabled: args.instantMasterEnabled,
          categoryEmailEnabled: args.categoryEmailEnabled,
        });
      },

      disableAllEmailAlerts: async (_parent, _args, context) => {
        await requireAuth(context);
        return legislationWatchService.disableAllEmailAlerts(context.user.id);
      },

      sendTestAlertEmail: async (_parent, _args, context) => {
        await requireAuth(context);
        return dailyDigestService.sendTestAlertEmail(context.user.id);
      },
    },
  };
}

export default createLegislationWatchResolvers;
