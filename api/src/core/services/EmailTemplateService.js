/**
 * Serviciu pentru gestionarea șabloanelor de email
 */

import { GraphQLError } from 'graphql';
import { z } from 'zod';

// Schema pentru validarea input-ului de creare șablon
const createTemplateInputSchema = z.object({
  templateName: z.string().min(1).max(100).regex(/^[a-z_]+$/, 'Numele șablonului poate conține doar litere mici și underscore'),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1)
}).strict();

// Schema pentru validarea input-ului de actualizare șablon
const updateTemplateInputSchema = z.object({
  templateName: z.string().min(1).max(100).regex(/^[a-z_]+$/, 'Numele șablonului poate conține doar litere mici și underscore').optional(),
  subject: z.string().min(1).max(255).optional(),
  bodyHtml: z.string().min(1).optional()
}).strict().refine(data => Object.keys(data).length > 0, 'Trebuie să furnizezi cel puțin un câmp pentru actualizare');

export class EmailTemplateService {
  constructor(emailTemplateRepository) {
    this.emailTemplateRepository = emailTemplateRepository;
  }

  /**
   * Obține toate șabloanele de email
   * @returns {Promise<Array>} Lista de șabloane
   */
  async getAllTemplates() {
    try {
      const templates = await this.emailTemplateRepository.getAllTemplates();
      
      return templates.map(template => this.transformTemplateForGraphQL(template));
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
      const template = await this.emailTemplateRepository.getTemplateByName(templateName);
      
      if (!template) {
        return null;
      }

      return this.transformTemplateForGraphQL(template);
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
      const template = await this.emailTemplateRepository.getTemplateById(templateId);
      
      if (!template) {
        return null;
      }

      return this.transformTemplateForGraphQL(template);
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
   * @param {Object} input - Datele șablonului
   * @returns {Promise<Object>} Șablonul creat
   */
  async createTemplate(input) {
    try {
      // Validează input-ul
      const validatedInput = createTemplateInputSchema.parse(input);

      // Pregătește datele pentru salvare
      const templateData = {
        template_name: validatedInput.templateName,
        subject: validatedInput.subject,
        body_html: validatedInput.bodyHtml
      };

      // Creează șablonul
      const createdTemplate = await this.emailTemplateRepository.createTemplate(templateData);

      return this.transformTemplateForGraphQL(createdTemplate);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0]?.message || 'input invalid'}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
      }
      throw new GraphQLError('Eroare internă la crearea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Actualizează un șablon de email
   * @param {string} templateId - ID-ul șablonului
   * @param {Object} input - Datele de actualizare
   * @returns {Promise<Object>} Șablonul actualizat
   */
  async updateTemplate(templateId, input) {
    try {
      // Validează input-ul
      const validatedInput = updateTemplateInputSchema.parse(input);

      // Pregătește datele pentru actualizare
      const updateData = {};
      if (validatedInput.templateName !== undefined) {
        updateData.template_name = validatedInput.templateName;
      }
      if (validatedInput.subject !== undefined) {
        updateData.subject = validatedInput.subject;
      }
      if (validatedInput.bodyHtml !== undefined) {
        updateData.body_html = validatedInput.bodyHtml;
      }

      // Actualizează șablonul
      const updatedTemplate = await this.emailTemplateRepository.updateTemplate(templateId, updateData);

      return this.transformTemplateForGraphQL(updatedTemplate);
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new GraphQLError(`Eroare de validare: ${error.errors[0]?.message || 'input invalid'}`, {
          extensions: { code: 'VALIDATION_ERROR' }
        });
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
      // Verifică dacă șablonul este folosit
      const isInUse = await this.emailTemplateRepository.isTemplateInUse(templateId);
      
      if (isInUse) {
        throw new GraphQLError('Nu poți șterge un șablon care este folosit în notificări', {
          extensions: { code: 'TEMPLATE_IN_USE' }
        });
      }

      // Șterge șablonul
      await this.emailTemplateRepository.deleteTemplate(templateId);

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
   * Procesează un șablon cu variabile (inclusiv liste de articole)
   * @param {string} templateName - Numele șablonului
   * @param {Object} variables - Variabilele pentru înlocuire
   * @returns {Promise<Object>} Șablonul procesat cu subject și body
   */
  async processTemplate(templateName, variables = {}) {
    try {
      const template = await this.emailTemplateRepository.getTemplateByName(templateName);
      
      if (!template) {
        throw new GraphQLError(`Șablonul '${templateName}' nu a fost găsit`, {
          extensions: { code: 'TEMPLATE_NOT_FOUND' }
        });
      }

      // Procesează subject-ul
      let processedSubject = template.subject;
      for (const [key, value] of Object.entries(variables)) {
        if (key === 'articleList') continue; // Skip articleList, will be processed separately
        
        const placeholder = `{${key}}`;
        const stringValue = String(value || '');
        processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), stringValue);
      }

      // Procesează body-ul HTML
      let processedBody = template.body_html;
      for (const [key, value] of Object.entries(variables)) {
        if (key === 'articleList') continue; // Skip articleList, will be processed separately
        
        const placeholder = `{${key}}`;
        const stringValue = String(value || '');
        processedBody = processedBody.replace(new RegExp(placeholder, 'g'), stringValue);
      }

      // Procesează lista de articole dacă există
      if (variables.articleList && variables.articleList.length > 0) {
        const articleListHtml = this.generateArticleListHtml(variables.articleList);
        processedBody = processedBody.replace('{articleList}', articleListHtml);
      } else {
        // Dacă nu există articole, înlocuiește cu mesaj
        const noArticlesHtml = '<p><em>Nu au fost găsite articole noi pentru căutările tale salvate.</em></p>';
        processedBody = processedBody.replace('{articleList}', noArticlesHtml);
      }

      return {
        subject: processedSubject,
        bodyHtml: processedBody,
        templateName: template.template_name
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la procesarea șablonului', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Generează HTML pentru lista de articole
   * @param {Array} articles - Lista de articole
   * @returns {string} HTML generat
   */
  generateArticleListHtml(articles) {
    return articles.map(article => `
      <div class="article">
        <div class="search-name">${article.searchName}</div>
        <div class="article-title">
          <a href="${article.link}" target="_blank">${article.title}</a>
        </div>
        <div class="article-excerpt">${article.excerpt || ''}</div>
        <div class="article-meta">
          Publicat pe: ${article.publishedAt} | Sursa: ${article.source || 'Monitorul Oficial'}
        </div>
      </div>
    `).join('');
  }

  /**
   * Transformă un șablon din formatul bazei de date în formatul GraphQL
   * @param {Object} template - Șablonul din baza de date
   * @returns {Object} Șablonul în format GraphQL
   */
  transformTemplateForGraphQL(template) {
    return {
      id: template.id,
      templateName: template.template_name,
      subject: template.subject,
      bodyHtml: template.body_html,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    };
  }
}

export default EmailTemplateService;
