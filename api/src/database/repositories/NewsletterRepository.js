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


