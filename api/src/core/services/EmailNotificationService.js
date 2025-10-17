/**
 * Serviciu pentru gestionarea notificărilor email pentru căutările salvate
 */

import { GraphQLError } from 'graphql';

export class EmailNotificationService {
  constructor(
    savedSearchRepository,
    emailTemplateService,
    stiriRepository,
    newsletterRepository
  ) {
    this.savedSearchRepository = savedSearchRepository;
    this.emailTemplateService = emailTemplateService;
    this.stiriRepository = stiriRepository;
    this.newsletterRepository = newsletterRepository;
  }

  /**
   * Procesează notificările pentru articole noi
   * Această funcție ar trebui să fie apelată periodic (de ex. prin cron job)
   * @param {Object} options - Opțiuni pentru procesare
   * @returns {Promise<Object>} Rezultatul procesării
   */
  async processNewArticleNotifications(options = {}) {
    try {
      const {
        hoursBack = 24, // Verifică articolele din ultimele 24 de ore
        batchSize = 50, // Procesează maximum 50 de căutări per batch
        dryRun = false // Dacă este true, nu trimite emailuri reale
      } = options;

      console.log(`Starting email notification processing for articles from last ${hoursBack} hours`);

      // Obține toate căutările salvate cu notificări activate
      const savedSearchesWithNotifications = await this.savedSearchRepository.getSavedSearchesWithEmailNotifications();
      
      if (savedSearchesWithNotifications.length === 0) {
        console.log('No saved searches with email notifications enabled');
        return {
          processed: 0,
          notificationsSent: 0,
          errors: 0
        };
      }

      console.log(`Found ${savedSearchesWithNotifications.length} saved searches with notifications enabled`);

      // Obține articolele noi din perioada specificată
      const newArticles = await this.getNewArticles(hoursBack);
      
      if (newArticles.length === 0) {
        console.log('No new articles found in the specified period');
        return {
          processed: 0,
          notificationsSent: 0,
          errors: 0
        };
      }

      console.log(`Found ${newArticles.length} new articles`);

      let processed = 0;
      let notificationsSent = 0;
      let errors = 0;

      // Procesează căutările în batch-uri
      for (let i = 0; i < savedSearchesWithNotifications.length; i += batchSize) {
        const batch = savedSearchesWithNotifications.slice(i, i + batchSize);
        
        for (const savedSearch of batch) {
          try {
            const matches = await this.findMatchingArticles(savedSearch, newArticles);
            
            if (matches.length > 0) {
              console.log(`Found ${matches.length} matching articles for search "${savedSearch.name}"`);
              
              for (const article of matches) {
                if (!dryRun) {
                  await this.sendNotificationEmail(savedSearch, article);
                }
                notificationsSent++;
              }
            }
            
            processed++;
          } catch (error) {
            console.error(`Error processing saved search ${savedSearch.id}:`, error);
            errors++;
          }
        }
      }

      console.log(`Email notification processing completed. Processed: ${processed}, Sent: ${notificationsSent}, Errors: ${errors}`);

      return {
        processed,
        notificationsSent,
        errors
      };
    } catch (error) {
      console.error('Error in processNewArticleNotifications:', error);
      throw new GraphQLError('Eroare la procesarea notificărilor email', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }

  /**
   * Obține articolele noi din perioada specificată
   * @param {number} hoursBack - Numărul de ore înapoi
   * @returns {Promise<Array>} Lista de articole noi
   */
  async getNewArticles(hoursBack) {
    try {
      const since = new Date();
      since.setHours(since.getHours() - hoursBack);

      // Folosește repository-ul pentru știri pentru a obține articolele noi
      const result = await this.stiriRepository.getStiri({
        limit: 1000, // Limitează pentru performanță
        offset: 0,
        orderBy: 'publication_date',
        orderDirection: 'desc',
        publicationDateFrom: since.toISOString().split('T')[0]
      });

      return result.stiri || [];
    } catch (error) {
      console.error('Error getting new articles:', error);
      return [];
    }
  }

  /**
   * Găsește articolele care se potrivesc cu o căutare salvată
   * @param {Object} savedSearch - Căutarea salvată
   * @param {Array} articles - Lista de articole de verificat
   * @returns {Promise<Array>} Articolele care se potrivesc
   */
  async findMatchingArticles(savedSearch, articles) {
    try {
      const searchParams = savedSearch.search_params;
      const matches = [];

      for (const article of articles) {
        if (await this.articleMatchesSearch(article, searchParams)) {
          matches.push(article);
        }
      }

      return matches;
    } catch (error) {
      console.error('Error finding matching articles:', error);
      return [];
    }
  }

  /**
   * Verifică dacă un articol se potrivește cu parametrii de căutare
   * @param {Object} article - Articolul de verificat
   * @param {Object} searchParams - Parametrii de căutare
   * @returns {Promise<boolean>} True dacă se potrivește
   */
  async articleMatchesSearch(article, searchParams) {
    try {
      // Verifică query-ul principal
      if (searchParams.query) {
        const query = searchParams.query.toLowerCase();
        const title = (article.title || '').toLowerCase();
        const content = (article.content || '').toLowerCase();
        
        if (!title.includes(query) && !content.includes(query)) {
          return false;
        }
      }

      // Verifică cuvintele cheie
      if (searchParams.keywords && searchParams.keywords.length > 0) {
        const articleText = `${article.title || ''} ${article.content || ''}`.toLowerCase();
        const hasKeyword = searchParams.keywords.some(keyword => 
          articleText.includes(keyword.toLowerCase())
        );
        
        if (!hasKeyword) {
          return false;
        }
      }

      // Verifică categoria
      if (searchParams.category) {
        if (article.category !== searchParams.category) {
          return false;
        }
      }

      // Verifică data publicării
      if (searchParams.publicationDateFrom) {
        const articleDate = new Date(article.publication_date);
        const fromDate = new Date(searchParams.publicationDateFrom);
        
        if (articleDate < fromDate) {
          return false;
        }
      }

      if (searchParams.publicationDateTo) {
        const articleDate = new Date(article.publication_date);
        const toDate = new Date(searchParams.publicationDateTo);
        
        if (articleDate > toDate) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking article match:', error);
      return false;
    }
  }

  /**
   * Trimite email de notificare pentru un articol
   * @param {Object} savedSearch - Căutarea salvată
   * @param {Object} article - Articolul pentru care se trimite notificarea
   * @returns {Promise<boolean>} True dacă email-ul a fost trimis cu succes
   */
  async sendNotificationEmail(savedSearch, article) {
    try {
      // Verifică dacă notificarea a fost deja trimisă
      const alreadySent = await this.checkIfNotificationAlreadySent(savedSearch.id, article.id);
      if (alreadySent) {
        console.log(`Notification already sent for article ${article.id} and search ${savedSearch.id}`);
        return false;
      }

      // Procesează șablonul de email
      const template = await this.emailTemplateService.processTemplate('new_article_notification', {
        userName: savedSearch.profiles?.display_name || 'Utilizator',
        searchName: savedSearch.name,
        searchDescription: savedSearch.description || '',
        articleTitle: article.title || 'Fără titlu',
        articlePublicationDate: new Date(article.publication_date).toLocaleDateString('ro-RO'),
        articleAuthor: article.author || 'Autor necunoscut',
        articleExcerpt: this.generateArticleExcerpt(article),
        articleLink: `${process.env.FRONTEND_URL || 'https://monitoruloficial.ro'}/stiri/${article.id}`
      });

      // Trimite email-ul folosind newsletter repository
      const emailSent = await this.newsletterRepository.sendEmail({
        to: savedSearch.profiles?.email,
        subject: template.subject,
        html: template.bodyHtml,
        from: process.env.FROM_EMAIL || 'noreply@monitoruloficial.ro'
      });

      // Loghează notificarea
      await this.logNotificationSent(savedSearch.id, article.id, template.templateName, emailSent);

      if (emailSent) {
        console.log(`Email notification sent successfully for article ${article.id} to ${savedSearch.profiles?.email}`);
      } else {
        console.error(`Failed to send email notification for article ${article.id}`);
      }

      return emailSent;
    } catch (error) {
      console.error('Error sending notification email:', error);
      
      // Loghează eroarea
      await this.logNotificationSent(savedSearch.id, article.id, 'new_article_notification', false, error.message);
      
      return false;
    }
  }

  /**
   * Verifică dacă notificarea a fost deja trimisă
   * @param {string} savedSearchId - ID-ul căutării salvate
   * @param {string} articleId - ID-ul articolului
   * @returns {Promise<boolean>} True dacă a fost deja trimisă
   */
  async checkIfNotificationAlreadySent(savedSearchId, articleId) {
    try {
      const { data, error } = await this.savedSearchRepository.supabase
        .from('payments.email_notification_logs')
        .select('id')
        .eq('saved_search_id', savedSearchId)
        .eq('article_id', articleId)
        .eq('email_sent', true)
        .limit(1);

      if (error) {
        console.error('Error checking if notification already sent:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking if notification already sent:', error);
      return false;
    }
  }

  /**
   * Loghează notificarea trimisă
   * @param {string} savedSearchId - ID-ul căutării salvate
   * @param {string} articleId - ID-ul articolului
   * @param {string} templateName - Numele șablonului
   * @param {boolean} emailSent - Dacă email-ul a fost trimis cu succes
   * @param {string} errorMessage - Mesajul de eroare (opțional)
   */
  async logNotificationSent(savedSearchId, articleId, templateName, emailSent, errorMessage = null) {
    try {
      // Obține ID-ul șablonului
      const template = await this.emailTemplateService.getTemplateByName(templateName);
      if (!template) {
        console.error(`Template ${templateName} not found`);
        return;
      }

      const logData = {
        saved_search_id: savedSearchId,
        article_id: articleId,
        template_id: template.id,
        email_sent: emailSent,
        email_sent_at: emailSent ? new Date().toISOString() : null,
        error_message: errorMessage
      };

      const { error } = await this.savedSearchRepository.supabase
        .from('payments.email_notification_logs')
        .insert([logData]);

      if (error) {
        console.error('Error logging notification:', error);
      }
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * Generează un excerpt pentru articol
   * @param {Object} article - Articolul
   * @returns {string} Excerpt-ul generat
   */
  generateArticleExcerpt(article) {
    const content = article.content || '';
    const maxLength = 200;
    
    if (content.length <= maxLength) {
      return content;
    }
    
    return content.substring(0, maxLength) + '...';
  }

  /**
   * Obține statistici despre notificările trimise
   * @param {Object} options - Opțiuni pentru statistici
   * @returns {Promise<Object>} Statisticile
   */
  async getNotificationStats(options = {}) {
    try {
      const {
        daysBack = 7,
        userId = null
      } = options;

      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      let query = this.savedSearchRepository.supabase
        .from('payments.email_notification_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', since.toISOString());

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new GraphQLError(`Eroare la obținerea statisticilor: ${error.message}`, {
          extensions: { code: 'DATABASE_ERROR' }
        });
      }

      const totalSent = data?.filter(log => log.email_sent).length || 0;
      const totalFailed = data?.filter(log => !log.email_sent).length || 0;

      return {
        totalNotifications: count || 0,
        totalSent,
        totalFailed,
        successRate: count > 0 ? (totalSent / count) * 100 : 0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new GraphQLError('Eroare internă la obținerea statisticilor', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  }
}

export default EmailNotificationService;
