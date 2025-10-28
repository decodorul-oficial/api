/**
 * Repository pentru gestionarea șabloanelor de email
 */

import { GraphQLError } from 'graphql';

export class EmailTemplateRepository {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Obține toate șabloanele de email
   * @returns {Promise<Array>} Lista de șabloane
   */
  async getAllTemplates() {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new GraphQLError(`Eroare la obținerea șabloanelor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data || [];
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea șabloanelor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține un șablon după nume
   * @param {string} templateName - Numele șablonului
   * @returns {Promise<Object|null>} Șablonul sau null
   */
  async getTemplateByName(templateName) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .select('*')
        .eq('template_name', templateName)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Template not found
        }
        throw new GraphQLError(`Eroare la obținerea șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține un șablon după ID
   * @param {string} templateId - ID-ul șablonului
   * @returns {Promise<Object|null>} Șablonul sau null
   */
  async getTemplateById(templateId) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Template not found
        }
        throw new GraphQLError(`Eroare la obținerea șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Creează un nou șablon de email
   * @param {Object} templateData - Datele șablonului
   * @returns {Promise<Object>} Șablonul creat
   */
  async createTemplate(templateData) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .insert([templateData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          throw new GraphQLError('Există deja un șablon cu acest nume', {
            extensions: { code: 'DUPLICATE_TEMPLATE_NAME' }
          });
        }
        throw new GraphQLError(`Eroare la crearea șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la crearea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează un șablon de email
   * @param {string} templateId - ID-ul șablonului
   * @param {Object} updateData - Datele de actualizare
   * @returns {Promise<Object>} Șablonul actualizat
   */
  async updateTemplate(templateId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .update(updateData)
        .eq('id', templateId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new GraphQLError('Șablonul nu a fost găsit', {
            extensions: { code: 'TEMPLATE_NOT_FOUND' }
          });
        }
        if (error.code === '23505') { // Unique constraint violation
          throw new GraphQLError('Există deja un șablon cu acest nume', {
            extensions: { code: 'DUPLICATE_TEMPLATE_NAME' }
          });
        }
        throw new GraphQLError(`Eroare la actualizarea șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la actualizarea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Șterge un șablon de email
   * @param {string} templateId - ID-ul șablonului
   * @returns {Promise<boolean>} True dacă a fost șters
   */
  async deleteTemplate(templateId) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_templates')
        .delete()
        .eq('id', templateId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new GraphQLError('Șablonul nu a fost găsit', {
            extensions: { code: 'TEMPLATE_NOT_FOUND' }
          });
        }
        throw new GraphQLError(`Eroare la ștergerea șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la ștergerea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Verifică dacă un șablon este folosit în logurile de notificări
   * @param {string} templateId - ID-ul șablonului
   * @returns {Promise<boolean>} True dacă este folosit
   */
  async isTemplateInUse(templateId) {
    try {
      const { data, error } = await this.supabase
        .from('payments.email_notification_logs')
        .select('id')
        .eq('template_id', templateId)
        .limit(1);

      if (error) {
        throw new GraphQLError(`Eroare la verificarea utilizării șablonului: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      return data && data.length > 0;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la verificarea utilizării șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}

export default EmailTemplateRepository;
