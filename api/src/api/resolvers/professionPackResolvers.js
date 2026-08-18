/**
 * GraphQL resolvers for profession packs.
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { validateGraphQLData } from '../../middleware/security.js';

const packIdSchema = z.string().min(1).max(50);

const selectionSchema = z.object({
  keywords: z.array(z.string().min(1).max(100)).optional().nullable(),
  anchors: z.array(z.string().min(1).max(200)).optional().nullable(),
  includeCategories: z.boolean().optional().nullable(),
  deliveryMode: z.enum(['off', 'digest', 'instant']).optional().nullable(),
}).strict().optional().nullable();

async function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('Utilizator neautentificat', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.user;
}

export function createProfessionPackResolvers({ professionPackService }) {
  return {
    Query: {
      getProfessionPacks: async (_parent, _args, context) => {
        await requireAuth(context);
        return professionPackService.getProfessionPacks();
      },
    },

    Mutation: {
      applyProfessionPack: async (_parent, { packId, selection }, context) => {
        const user = await requireAuth(context);
        const validatedId = validateGraphQLData(packId, packIdSchema);
        const validatedSelection = selection
          ? validateGraphQLData(selection, selectionSchema)
          : {};
        return professionPackService.applyProfessionPack(
          user.id,
          validatedId,
          validatedSelection || {}
        );
      },
    },
  };
}

export default createProfessionPackResolvers;
