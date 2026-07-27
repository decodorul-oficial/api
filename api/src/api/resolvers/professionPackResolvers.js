/**
 * GraphQL resolvers for profession packs.
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { validateGraphQLData } from '../../middleware/security.js';

const packIdSchema = z.string().min(1).max(50);

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
      applyProfessionPack: async (_parent, { packId }, context) => {
        const user = await requireAuth(context);
        const validatedId = validateGraphQLData(packId, packIdSchema);
        return professionPackService.applyProfessionPack(user.id, validatedId);
      },
    },
  };
}

export default createProfessionPackResolvers;
