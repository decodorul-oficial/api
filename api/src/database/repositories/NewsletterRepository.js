/**
 * Repository pentru operațiunile cu abonații newsletter-ului
 * Respectă SRP și Dependency Inversion
 */

import { GraphQLError } from 'graphql';

export class NewsletterRepository {
  /**
   * @param {Object} supabaseClient - Clientul Supabase injectat (service role)
   */
  constructor(supabaseClient) {
    this.supabase = typeof supabaseClient.schema === 'function'
      ? supabaseClient.schema('public')
      : supabaseClient;
    this.tableName = 'newsletter_subscribers';
  }

  /**
   * Creează sau actualizează un abonat la status "subscribed"
   */
  async upsertSubscribe({
    email,
    locale = 'ro-RO',
    tags = [],
    source,
    consentVersion,
    meta = {},
    ip,
    userAgent
  }) {
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        email,
        status: 'subscribed',
        locale,
        tags,
        source: source || 'web',
        subscribed_at: nowIso,
        unsubscribed_at: null,
        unsubscribe_reason: null,
        last_ip: ip || null,
        last_user_agent: userAgent || null,
        consent_version: consentVersion || null,
        consent_at: consentVersion ? nowIso : null,
        metadata: meta
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(payload, { onConflict: 'email' })
        .select()
        .single();

      if (error) {
        throw new GraphQLError(`Eroare la abonare newsletter: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      return data;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la abonare newsletter', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Setează status "unsubscribed" pentru un email
   */
  async setUnsubscribed({ email, reason, ip, userAgent }) {
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          status: 'unsubscribed',
          unsubscribed_at: nowIso,
          unsubscribe_reason: reason || null,
          last_ip: ip || null,
          last_user_agent: userAgent || null
        })
        .eq('email', email)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // not found
        }
        throw new GraphQLError(`Eroare la dezabonare newsletter: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      return data;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la dezabonare newsletter', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține un abonat după email
   */
  async getByEmail(email) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('email', email)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new GraphQLError(`Eroare la interogarea abonatului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }
      return data;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la interogarea abonatului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține toți abonații cu filtrare, sortare și paginare
   * @param {Object} options - Opțiuni de filtrare și paginare
   * @returns {Promise<Object>} Rezultat cu abonați și informații de paginare
   */
  async getAllSubscribers(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortField = 'created_at',
        sortDirection = 'DESC',
        filters = {}
      } = options;

      const offset = (page - 1) * limit;

      // Construiește query-ul
      let query = this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact' });

      // Aplică filtre
      if (filters.status?.eq) {
        // Acceptă atât enum values (SUBSCRIBED) cât și lowercase strings (subscribed)
        const statusValue = filters.status.eq;
        const statusMap = {
          'SUBSCRIBED': 'subscribed',
          'UNSUBSCRIBED': 'unsubscribed',
          'BOUNCED': 'bounced',
          'COMPLAINED': 'complained'
        };
        const dbStatus = statusMap[statusValue] || statusValue.toLowerCase();
        query = query.eq('status', dbStatus);
      }

      if (filters.search) {
        query = query.ilike('email', `%${filters.search}%`);
      }

      // Filtrare după email cu contains
      if (filters.email?.contains) {
        query = query.ilike('email', `%${filters.email.contains}%`);
      }

      // Filtrare după locale
      if (filters.locale?.eq) {
        query = query.eq('locale', filters.locale.eq);
      }

      // Filtrare după source
      if (filters.source?.eq) {
        query = query.eq('source', filters.source.eq);
      }

      // Aplică sortarea
      const sortFieldMap = {
        'EMAIL': 'email',
        'STATUS': 'status',
        'CREATED_AT': 'created_at',
        'SUBSCRIBED_AT': 'subscribed_at',
        'UPDATED_AT': 'updated_at'
      };
      const dbSortField = sortFieldMap[sortField] || sortField.toLowerCase();
      query = query.order(dbSortField, { ascending: sortDirection === 'ASC' });

      // Aplică paginarea
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new GraphQLError(`Eroare la preluarea abonaților: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return {
        data: data || [],
        totalCount: count || 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la preluarea abonaților', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Șterge un abonat după ID
   * @param {number} id - ID-ul abonatului
   * @returns {Promise<boolean>} True dacă ștergerea a reușit
   */
  async deleteSubscriber(id) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === 'PGRST116') {
          throw new GraphQLError('Abonatul nu a fost găsit', {
            extensions: { code: 'NOT_FOUND' }
          });
        }
        throw new GraphQLError(`Eroare la ștergerea abonatului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la ștergerea abonatului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează statusul unui abonat
   * @param {number} id - ID-ul abonatului
   * @param {string} status - Noul status
   * @returns {Promise<Object>} Abonatul actualizat
   */
  async updateSubscriberStatus(id, status) {
    try {
      const statusMap = {
        'SUBSCRIBED': 'subscribed',
        'UNSUBSCRIBED': 'unsubscribed',
        'BOUNCED': 'bounced',
        'COMPLAINED': 'complained'
      };
      const dbStatus = statusMap[status] || status.toLowerCase();

      const nowIso = new Date().toISOString();
      const updateData = {
        status: dbStatus,
        updated_at: nowIso
      };

      // Dacă statusul este unsubscribed, setăm unsubscribed_at
      if (dbStatus === 'unsubscribed') {
        updateData.unsubscribed_at = nowIso;
      } else if (dbStatus === 'subscribed') {
        updateData.subscribed_at = nowIso;
        updateData.unsubscribed_at = null;
        updateData.unsubscribe_reason = null;
      }

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new GraphQLError('Abonatul nu a fost găsit', {
            extensions: { code: 'NOT_FOUND' }
          });
        }
        throw new GraphQLError(`Eroare la actualizarea statusului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Eroare internă la actualizarea statusului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Trimite un email folosind serviciul de email
   * @param {Object} emailData - Datele email-ului
   * @returns {Promise<boolean>} True dacă email-ul a fost trimis cu succes
   */
  async sendEmail(emailData) {
    try {
      // Pentru moment, simulăm trimiterea email-ului
      // În implementarea reală, aici ar trebui să integrezi cu un serviciu de email
      // precum SendGrid, Mailgun, sau AWS SES
      
      console.log('Sending email:', {
        to: emailData.to,
        subject: emailData.subject,
        from: emailData.from
      });

      // Simulare - în producție, înlocuiește cu apelul real la serviciul de email
      // Exemplu pentru SendGrid:
      /*
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      
      const msg = {
        to: emailData.to,
        from: emailData.from,
        subject: emailData.subject,
        html: emailData.html,
      };
      
      await sgMail.send(msg);
      */

      // Pentru testare, returnează true
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

export default NewsletterRepository;


