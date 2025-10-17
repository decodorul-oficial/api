/**
 * Serviciu pentru gestionarea digest-urilor zilnice de email
 */

import { GraphQLError } from 'graphql';

export class DailyDigestService {
  constructor(supabaseClient, emailTemplateService, newsletterRepository) {
    this.supabase = supabaseClient;
    this.emailTemplateService = emailTemplateService;
    this.newsletterRepository = newsletterRepository;
  }

  /**
   * Procesează digest-ul zilnic pentru toți utilizatorii cu notificări active
   * @param {Date} digestDate - Data pentru care se procesează digest-ul (implicit azi)
   * @returns {Promise<Object>} Rezultatul procesării
   */
  async processDailyDigest(digestDate = new Date()) {
    try {
      console.log(`Starting daily digest processing for ${digestDate.toISOString().split('T')[0]}`);

      // Obține toți utilizatorii cu notificări active
      let users = [];
      try {
        const { data: usersData, error: usersError } = await this.supabase.rpc('get_users_with_active_email_notifications');

        if (usersError) {
          // If the function returns a structure mismatch error, it might be because tables don't exist yet
          if (usersError.message.includes('structure of query does not match function result type')) {
            console.log('Database tables may not exist yet. Please run the migrations first.');
            return {
              processed: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              error: 'Database tables not found - please run migrations'
            };
          }
          throw new Error(`Error fetching users with active notifications: ${usersError.message}`);
        }

        users = usersData || [];
      } catch (error) {
        console.log('Error accessing users function:', error.message);
        return {
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          error: error.message
        };
      }

      if (!users || users.length === 0) {
        console.log('No users with active email notifications found');
        return {
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: 0
        };
      }

      console.log(`Found ${users.length} users with active email notifications`);

      const results = {
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0
      };

      // Procesează fiecare utilizator
      for (const user of users) {
        try {
          results.processed++;
          const userResult = await this.processUserDigest(user, digestDate);
          
          if (userResult.status === 'sent') {
            results.sent++;
          } else if (userResult.status === 'failed') {
            results.failed++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          console.error(`Error processing digest for user ${user.user_id}:`, error);
          results.failed++;
        }
      }

      console.log('Daily digest processing completed:', results);
      return results;

    } catch (error) {
      console.error('Error in processDailyDigest:', error);
      throw error;
    }
  }

  /**
   * Procesează digest-ul pentru un utilizator specific
   * @param {Object} user - Datele utilizatorului
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Object>} Rezultatul procesării
   */
  async processUserDigest(user, digestDate) {
    try {
      const dateStr = digestDate.toISOString().split('T')[0];

      // Verifică dacă digest-ul a fost deja procesat pentru această dată
      const { data: existingLog } = await this.supabase
        .from('payments.email_digest_logs')
        .select('id, status')
        .eq('user_id', user.user_id)
        .eq('digest_date', dateStr)
        .single();

      if (existingLog) {
        console.log(`Digest already processed for user ${user.user_id} on ${dateStr} with status: ${existingLog.status}`);
        return { status: 'skipped', reason: 'already_processed' };
      }

      // Găsește articole noi pentru căutările salvate ale utilizatorului
      const articles = await this.findNewArticlesForUser(user, digestDate);

      if (articles.length === 0) {
        console.log(`No new articles found for user ${user.user_id} on ${dateStr}`);
        
        // Creează log pentru "no articles"
        await this.createDigestLog(user.user_id, dateStr, 0, [], 'SKIPPED', null);
        return { status: 'skipped', reason: 'no_articles' };
      }

      // Generează și trimite email-ul
      const emailResult = await this.sendDigestEmail(user, articles, digestDate);

      if (emailResult.success) {
        // Creează log pentru email trimis cu succes
        const searchIds = user.saved_searches.map(search => search.id);
        await this.createDigestLog(
          user.user_id, 
          dateStr, 
          articles.length, 
          searchIds, 
          'SENT', 
          null
        );
        
        console.log(`Digest email sent successfully to user ${user.user_id} with ${articles.length} articles`);
        return { status: 'sent', articlesCount: articles.length };
      } else {
        // Creează log pentru email eșuat
        await this.createDigestLog(
          user.user_id, 
          dateStr, 
          articles.length, 
          [], 
          'FAILED', 
          emailResult.error
        );
        
        console.error(`Failed to send digest email to user ${user.user_id}:`, emailResult.error);
        return { status: 'failed', error: emailResult.error };
      }

    } catch (error) {
      console.error(`Error processing user digest for ${user.user_id}:`, error);
      throw error;
    }
  }

  /**
   * Găsește articole noi pentru căutările salvate ale unui utilizator
   * @param {Object} user - Datele utilizatorului
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Array>} Lista de articole noi
   */
  async findNewArticlesForUser(user, digestDate) {
    try {
      const startDate = new Date(digestDate);
      startDate.setDate(startDate.getDate() - 1); // Ultimele 24 de ore
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(digestDate);
      endDate.setHours(23, 59, 59, 999);

      const allArticles = [];

      // Procesează fiecare căutare salvată
      for (const search of user.saved_searches) {
        try {
          const searchArticles = await this.findArticlesForSearch(search, startDate, endDate);
          
          // Adaugă numele căutării la fiecare articol
          const articlesWithSearchName = searchArticles.map(article => ({
            ...article,
            searchName: search.name
          }));

          allArticles.push(...articlesWithSearchName);
        } catch (error) {
          console.error(`Error finding articles for search ${search.id}:`, error);
          // Continuă cu următoarea căutare
        }
      }

      // Elimină duplicatele (același articol poate să se potrivească cu mai multe căutări)
      const uniqueArticles = this.removeDuplicateArticles(allArticles);

      return uniqueArticles;

    } catch (error) {
      console.error('Error finding new articles for user:', error);
      return [];
    }
  }

  /**
   * Găsește articole pentru o căutare specifică
   * @param {Object} search - Căutarea salvată
   * @param {Date} startDate - Data de început
   * @param {Date} endDate - Data de sfârșit
   * @returns {Promise<Array>} Lista de articole
   */
  async findArticlesForSearch(search, startDate, endDate) {
    try {
      const { data: articles, error } = await this.supabase
        .from('stiri')
        .select(`
          id,
          title,
          content,
          link,
          published_at,
          source,
          category,
          tags
        `)
        .gte('published_at', startDate.toISOString())
        .lte('published_at', endDate.toISOString())
        .order('published_at', { ascending: false })
        .limit(50); // Limitează pentru performanță

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!articles || articles.length === 0) {
        return [];
      }

      // Aplică filtrele de căutare (simplificat - poate fi extins)
      const filteredArticles = this.applySearchFilters(articles, search.search_params);

      // Formatează articolele pentru email
      return filteredArticles.map(article => ({
        id: article.id,
        title: article.title,
        link: article.link || `https://monitoruloficial.ro/stiri/${article.id}`,
        excerpt: this.generateExcerpt(article.content),
        publishedAt: new Date(article.published_at).toLocaleDateString('ro-RO'),
        source: article.source,
        category: article.category
      }));

    } catch (error) {
      console.error('Error finding articles for search:', error);
      return [];
    }
  }

  /**
   * Aplică filtrele de căutare la articole
   * @param {Array} articles - Lista de articole
   * @param {Object} searchParams - Parametrii de căutare
   * @returns {Array} Articolele filtrate
   */
  applySearchFilters(articles, searchParams) {
    if (!searchParams || typeof searchParams !== 'object') {
      return articles;
    }

    return articles.filter(article => {
      // Filtru după cuvinte cheie
      if (searchParams.keywords && searchParams.keywords.length > 0) {
        const keywords = searchParams.keywords.toLowerCase();
        const titleMatch = article.title.toLowerCase().includes(keywords);
        const contentMatch = article.content.toLowerCase().includes(keywords);
        
        if (!titleMatch && !contentMatch) {
          return false;
        }
      }

      // Filtru după categorie
      if (searchParams.category && searchParams.category !== 'all') {
        if (article.category !== searchParams.category) {
          return false;
        }
      }

      // Filtru după sursă
      if (searchParams.source && searchParams.source !== 'all') {
        if (article.source !== searchParams.source) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Generează un excerpt din conținutul articolului
   * @param {string} content - Conținutul articolului
   * @param {number} maxLength - Lungimea maximă (implicit 200)
   * @returns {string} Excerpt-ul generat
   */
  generateExcerpt(content, maxLength = 200) {
    if (!content) return '';
    
    // Elimină HTML tags
    const textContent = content.replace(/<[^>]*>/g, '');
    
    if (textContent.length <= maxLength) {
      return textContent;
    }
    
    return textContent.substring(0, maxLength).trim() + '...';
  }

  /**
   * Elimină articolele duplicate
   * @param {Array} articles - Lista de articole
   * @returns {Array} Articolele unice
   */
  removeDuplicateArticles(articles) {
    const seen = new Set();
    return articles.filter(article => {
      if (seen.has(article.id)) {
        return false;
      }
      seen.add(article.id);
      return true;
    });
  }

  /**
   * Trimite email-ul de digest
   * @param {Object} user - Datele utilizatorului
   * @param {Array} articles - Lista de articole
   * @param {Date} digestDate - Data digest-ului
   * @returns {Promise<Object>} Rezultatul trimiterii
   */
  async sendDigestEmail(user, articles, digestDate) {
    try {
      // Obține template-ul de digest
      const template = await this.emailTemplateService.getTemplateByName('daily_article_digest');
      
      if (!template) {
        throw new Error('Daily digest template not found');
      }

      // Pregătește variabilele pentru template
      const variables = {
        userName: user.user_name,
        currentDate: digestDate.toLocaleDateString('ro-RO'),
        totalArticleCount: articles.length,
        articleList: articles
      };

      // Procesează template-ul
      const processedTemplate = await this.emailTemplateService.processTemplate('daily_article_digest', variables);

      // Trimite email-ul
      const emailData = {
        to: user.user_email,
        subject: processedTemplate.subject,
        html: processedTemplate.bodyHtml,
        templateId: template.id
      };

      const result = await this.newsletterRepository.sendEmail(emailData);

      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error('Error sending digest email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Creează un log pentru digest-ul procesat
   * @param {string} userId - ID-ul utilizatorului
   * @param {string} digestDate - Data digest-ului
   * @param {number} articlesCount - Numărul de articole
   * @param {Array} searchIds - ID-urile căutărilor
   * @param {string} status - Statusul digest-ului
   * @param {string} errorMessage - Mesajul de eroare (dacă există)
   */
  async createDigestLog(userId, digestDate, articlesCount, searchIds, status, errorMessage) {
    try {
      // Obține template-ul pentru a lua ID-ul
      const template = await this.emailTemplateService.getTemplateByName('daily_article_digest');
      
      const logData = {
        user_id: userId,
        digest_date: digestDate,
        articles_sent_count: articlesCount,
        saved_searches_triggered: searchIds,
        template_id: template?.id,
        status: status,
        error_message: errorMessage,
        sent_at: status === 'SENT' ? new Date().toISOString() : null
      };

      await this.supabase
        .from('payments.email_digest_logs')
        .insert(logData);

    } catch (error) {
      console.error('Error creating digest log:', error);
      // Nu aruncăm eroarea aici pentru a nu întrerupe procesul principal
    }
  }

  /**
   * Obține statisticile digest-urilor pentru o perioadă
   * @param {Date} startDate - Data de început
   * @param {Date} endDate - Data de sfârșit
   * @returns {Promise<Object>} Statisticile
   */
  async getDigestStats(startDate, endDate) {
    try {
      const { data: stats, error } = await this.supabase
        .from('payments.email_digest_logs')
        .select('status, articles_sent_count')
        .gte('digest_date', startDate.toISOString().split('T')[0])
        .lte('digest_date', endDate.toISOString().split('T')[0]);

      if (error) {
        throw new Error(`Error fetching digest stats: ${error.message}`);
      }

      const result = {
        total: stats.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        totalArticles: 0
      };

      stats.forEach(stat => {
        result[stat.status.toLowerCase()]++;
        result.totalArticles += stat.articles_sent_count || 0;
      });

      return result;

    } catch (error) {
      console.error('Error getting digest stats:', error);
      throw error;
    }
  }
}

export default DailyDigestService;
