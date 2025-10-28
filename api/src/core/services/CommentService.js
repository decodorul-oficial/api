/**
 * Serviciu pentru gestionarea comentariilor
 * Respectă principiul Single Responsibility prin focusarea doar pe logica de business pentru comentarii
 * Respectă principiul Dependency Inversion prin injectarea dependențelor
 */

import { CommentRepository } from '../../database/repositories/CommentRepository.js';

export class CommentService {
  constructor(supabaseClient, userService, subscriptionService) {
    this.supabase = supabaseClient;
    this.userService = userService;
    this.subscriptionService = subscriptionService;
    this.commentRepository = new CommentRepository(supabaseClient);
  }

  /**
   * Verifică dacă utilizatorul are permisiunea de a comenta
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă utilizatorul poate comenta
   */
  async canUserComment(userId) {
    try {
      // Verifică abonamentul activ
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      if (subscription && subscription.status === 'ACTIVE') {
        return true;
      }

      // Verifică trial-ul activ
      const trialStatus = await this.userService.checkTrialStatus(userId);
      if (trialStatus && trialStatus.isTrial) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking comment permissions:', error);
      return false;
    }
  }

  /**
   * Creează un comentariu nou
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} commentData - Datele comentariului
   * @returns {Promise<Object>} Comentariul creat
   */
  async createComment(userId, commentData) {
    // Verifică permisiunile
    const canComment = await this.canUserComment(userId);
    if (!canComment) {
      throw new Error('Nu aveți permisiunea de a comenta. Este necesar un abonament activ sau trial.');
    }

    // Validează datele
    const { content, parentType, parentId } = commentData;
    
    if (!content || content.trim().length === 0) {
      throw new Error('Conținutul comentariului nu poate fi gol');
    }

    if (content.length > 2000) {
      throw new Error('Comentariul nu poate depăși 2000 de caractere');
    }

    if (!['stire', 'synthesis'].includes(parentType)) {
      throw new Error('Tipul părinte invalid. Trebuie să fie "stire" sau "synthesis"');
    }

    if (!parentId) {
      throw new Error('ID-ul părinte este obligatoriu');
    }

    // Verifică existența părintelui
    const parentExists = await this.commentRepository.validateParentExists(parentType, parentId);
    if (!parentExists) {
      throw new Error(`${parentType === 'stire' ? 'Știrea' : 'Sinteza'} specificată nu există`);
    }

    // Creează comentariul
    const commentDataToInsert = {
      user_id: userId,
      content: content.trim(),
      parent_type: parentType,
      parent_id: parentId
    };

    try {
      const comment = await this.commentRepository.createComment(commentDataToInsert);
      
      // Log pentru audit
      console.log(`Comentariu creat: ${comment.id} de către utilizatorul ${userId} pentru ${parentType} ${parentId}`);
      
      return comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw new Error(`Eroare la crearea comentariului: ${error.message}`);
    }
  }

  /**
   * Obține comentariile pentru o știre sau sinteză
   * @param {string} parentType - Tipul părintelui
   * @param {string} parentId - ID-ul părintelui
   * @param {Object} options - Opțiuni de paginare și sortare
   * @returns {Promise<Object>} Comentariile cu paginare
   */
  async getComments(parentType, parentId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    // Validează tipul părintelui
    if (!['stire', 'synthesis'].includes(parentType)) {
      throw new Error('Tipul părintelui invalid. Trebuie să fie "stire" sau "synthesis"');
    }

    // Validează parametrii de paginare
    if (limit < 1 || limit > 100) {
      throw new Error('Limita trebuie să fie între 1 și 100');
    }

    if (offset < 0) {
      throw new Error('Offset-ul trebuie să fie pozitiv');
    }

    try {
      const result = await this.commentRepository.getComments(parentType, parentId, {
        limit,
        offset,
        orderBy,
        orderDirection
      });

      return {
        comments: result.comments,
        totalCount: result.totalCount,
        hasNextPage: (offset + limit) < result.totalCount,
        hasPreviousPage: offset > 0,
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(result.totalCount / limit)
      };
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw new Error(`Eroare la obținerea comentariilor: ${error.message}`);
    }
  }

  /**
   * Actualizează un comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} updateData - Datele de actualizare
   * @returns {Promise<Object>} Comentariul actualizat
   */
  async updateComment(commentId, userId, updateData) {
    // Verifică dacă comentariul aparține utilizatorului
    const isOwner = await this.commentRepository.isCommentOwner(commentId, userId);
    if (!isOwner) {
      throw new Error('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l edita');
    }

    // Validează conținutul nou
    const { content } = updateData;
    if (!content || content.trim().length === 0) {
      throw new Error('Conținutul comentariului nu poate fi gol');
    }

    if (content.length > 2000) {
      throw new Error('Comentariul nu poate depăși 2000 de caractere');
    }

    try {
      const updatedComment = await this.commentRepository.updateComment(commentId, userId, {
        content: content.trim()
      });

      // Log pentru audit
      console.log(`Comentariu actualizat: ${commentId} de către utilizatorul ${userId}`);

      return updatedComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw new Error(`Eroare la actualizarea comentariului: ${error.message}`);
    }
  }

  /**
   * Șterge un comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă ștergerea a reușit
   */
  async deleteComment(commentId, userId) {
    // Verifică dacă comentariul aparține utilizatorului
    const isOwner = await this.commentRepository.isCommentOwner(commentId, userId);
    if (!isOwner) {
      throw new Error('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l șterge');
    }

    try {
      const result = await this.commentRepository.deleteComment(commentId, userId);

      // Log pentru audit
      console.log(`Comentariu șters: ${commentId} de către utilizatorul ${userId}`);

      return result;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw new Error(`Eroare la ștergerea comentariului: ${error.message}`);
    }
  }

  /**
   * Obține un comentariu după ID
   * @param {string} commentId - ID-ul comentariului
   * @returns {Promise<Object>} Comentariul cu informații complete
   */
  async getCommentById(commentId) {
    try {
      return await this.commentRepository.getCommentById(commentId);
    } catch (error) {
      console.error('Error fetching comment by ID:', error);
      throw new Error(`Eroare la obținerea comentariului: ${error.message}`);
    }
  }

  /**
   * Obține comentariile unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare
   * @returns {Promise<Object>} Comentariile utilizatorului
   */
  async getUserComments(userId, options = {}) {
    try {
      const result = await this.commentRepository.getUserComments(userId, options);

      return {
        comments: result.comments,
        totalCount: result.totalCount,
        hasNextPage: (options.offset + options.limit) < result.totalCount,
        hasPreviousPage: options.offset > 0,
        currentPage: Math.floor(options.offset / options.limit) + 1,
        totalPages: Math.ceil(result.totalCount / options.limit)
      };
    } catch (error) {
      console.error('Error fetching user comments:', error);
      throw new Error(`Eroare la obținerea comentariilor utilizatorului: ${error.message}`);
    }
  }

  /**
   * Obține statistici despre comentariile unui părinte
   * @param {string} parentType - Tipul părintelui
   * @param {string} parentId - ID-ul părintelui
   * @returns {Promise<Object>} Statistici despre comentarii
   */
  async getCommentStats(parentType, parentId) {
    try {
      return await this.commentRepository.getCommentStats(parentType, parentId);
    } catch (error) {
      console.error('Error fetching comment stats:', error);
      throw new Error(`Eroare la obținerea statisticilor: ${error.message}`);
    }
  }

  /**
   * Verifică dacă un utilizator poate edita un comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă utilizatorul poate edita comentariul
   */
  async canUserEditComment(commentId, userId) {
    try {
      return await this.commentRepository.isCommentOwner(commentId, userId);
    } catch (error) {
      console.error('Error checking comment ownership:', error);
      return false;
    }
  }

  /**
   * Obține istoricul editărilor unui comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<Array>} Istoricul editărilor
   */
  async getCommentEditHistory(commentId, userId) {
    // Verifică dacă utilizatorul poate accesa comentariul
    const canAccess = await this.canUserEditComment(commentId, userId);
    if (!canAccess) {
      throw new Error('Nu aveți permisiunea de a accesa istoricul acestui comentariu');
    }

    try {
      const comment = await this.commentRepository.getCommentById(commentId);
      return comment.editHistory || [];
    } catch (error) {
      console.error('Error fetching comment edit history:', error);
      throw new Error(`Eroare la obținerea istoricului editărilor: ${error.message}`);
    }
  }
}

export default CommentService;
