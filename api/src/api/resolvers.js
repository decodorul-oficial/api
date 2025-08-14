/**
 * Resolver-i GraphQL pentru API-ul Monitorul Oficial
 * Respectă principiul Single Responsibility - resolver-ii sunt "subțiri" și apelează serviciile
 * Respectă principiul Dependency Inversion prin injectarea serviciilor
 */

import { GraphQLError } from 'graphql';
import { getRateLimitInfo } from '../middleware/rateLimiter.js';
import { validateGraphQLData } from '../middleware/security.js';
import {
  signUpInputSchema,
  signInInputSchema,
  createStireInputSchema,
  updateStireInputSchema,
  updateProfileInputSchema,
  paginationSchema,
  idSchema
} from '../config/validation.js';

/**
 * Resolver-i pentru tipuri scalare
 */
const scalarResolvers = {
  JSON: {
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => ast.value
  }
};

/**
 * Resolver-i pentru tipuri
 */
const typeResolvers = {
  User: {
    profile: (parent, args, context) => {
      return parent.profile;
    }
  },

  Profile: {
    id: (parent) => parent.id,
    subscriptionTier: (parent) => parent.subscriptionTier,
    createdAt: (parent) => parent.createdAt,
    updatedAt: (parent) => parent.updatedAt
  },

  Stire: {
    id: (parent) => parent.id,
    title: (parent) => parent.title,
    publicationDate: (parent) => parent.publicationDate,
    content: (parent) => parent.content,
    createdAt: (parent) => parent.createdAt,
    updatedAt: (parent) => parent.updatedAt
  },

  RequestLog: {
    id: (parent) => parent.id,
    userId: (parent) => parent.user_id,
    requestTimestamp: (parent) => parent.request_timestamp
  }
};

/**
 * Factory pentru crearea resolver-ilor cu dependențe injectate
 * @param {Object} services - Serviciile injectate
 * @returns {Object} Resolver-ii GraphQL
 */
export function createResolvers(services) {
  const { userService, stiriService, userRepository } = services;

  return {
    ...scalarResolvers,
    ...typeResolvers,

    Query: {
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
          return await stiriService.getStireById(validatedId);
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
          const validatedArgs = validateGraphQLData(normalizedArgs, paginationSchema);
          return await stiriService.searchStiri({
            query: args.query,
            ...validatedArgs
          });
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
      }
    },

    Mutation: {
      // Mutații pentru autentificare
      signUp: async (parent, { input }, context) => {
        try {
          // Validează input-ul de înregistrare
          const validatedInput = validateGraphQLData(input, signUpInputSchema);
          return await userService.handleSignUp(validatedInput);
        } catch (error) {
          throw error;
        }
      },

      signIn: async (parent, { input }, context) => {
        try {
          // Validează input-ul de autentificare
          const validatedInput = validateGraphQLData(input, signInInputSchema);
          return await userService.handleSignIn(validatedInput);
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
      }
    }
  };
}

export default createResolvers;
