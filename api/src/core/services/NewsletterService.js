/**
 * Serviciu pentru gestionarea abonărilor la newsletter
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';

const subscribeInputSchema = z.object({
  email: z.string().email('Email invalid').max(255),
  locale: z.string().min(2).max(20).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  source: z.string().max(100).optional(),
  consentVersion: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional()
}).strict();

const unsubscribeInputSchema = z.object({
  email: z.string().email('Email invalid').max(255),
  reason: z.string().max(500).optional()
}).strict();

export class NewsletterService {
  /**
   * @param {NewsletterRepository} newsletterRepository
   */
  constructor(newsletterRepository) {
    this.newsletterRepository = newsletterRepository;
  }

  async subscribe(input, context = {}) {
    try {
      const validated = subscribeInputSchema.parse(input);
      const ip = context?.ip;
      const userAgent = context?.userAgent;
      const record = await this.newsletterRepository.upsertSubscribe({
        email: validated.email.trim().toLowerCase(),
        locale: validated.locale || 'ro-RO',
        tags: validated.tags || [],
        source: validated.source || 'web',
        consentVersion: validated.consentVersion,
        meta: validated.metadata || {},
        ip,
        userAgent
      });
      return this.transformSubscriberForGraphQL(record);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0]?.message || 'invalid input'}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la abonarea newsletter', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  async unsubscribe(input, context = {}) {
    try {
      const validated = unsubscribeInputSchema.parse(input);
      const ip = context?.ip;
      const userAgent = context?.userAgent;
      const record = await this.newsletterRepository.setUnsubscribed({
        email: validated.email.trim().toLowerCase(),
        reason: validated.reason,
        ip,
        userAgent
      });
      if (!record) {
        // Idempotent: returnăm un obiect minimal cu status "unsubscribed"
        return {
          id: null,
          email: validated.email.trim().toLowerCase(),
          status: 'unsubscribed',
          locale: 'ro-RO',
          tags: [],
          createdAt: null,
          updatedAt: null,
          subscribedAt: null,
          unsubscribedAt: new Date().toISOString(),
          unsubscribeReason: validated.reason || null
        };
      }
      return this.transformSubscriberForGraphQL(record);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0]?.message || 'invalid input'}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la dezabonarea newsletter', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  async getSubscriptionByEmail(email) {
    try {
      if (!email || typeof email !== 'string') {
        throw new GraphQLError('Email invalid', { extensions: { code: 'VALIDATION_ERROR' } });
      }
      const record = await this.newsletterRepository.getByEmail(email.trim().toLowerCase());
      if (!record) return null;
      return this.transformSubscriberForGraphQL(record);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la interogarea abonării', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  transformSubscriberForGraphQL(row) {
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      locale: row.locale,
      tags: row.tags || [],
      source: row.source || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      subscribedAt: row.subscribed_at || null,
      unsubscribedAt: row.unsubscribed_at || null,
      unsubscribeReason: row.unsubscribe_reason || null,
      metadata: row.metadata || {}
    };
  }
}

export default NewsletterService;


