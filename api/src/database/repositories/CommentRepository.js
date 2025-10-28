/**
 * Repository pentru operațiuni cu comentarii
 * Respectă principiul Single Responsibility prin focusarea doar pe operațiuni de date
 * Respectă principiul Dependency Inversion prin injectarea clientului Supabase
 */

export class CommentRepository {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Creează un comentariu nou
   * @param {Object} commentData - Datele comentariului
   * @returns {Promise<Object>} Comentariul creat cu informații despre utilizator
   */
  async createComment(commentData) {
    const { data, error } = await this.supabase
      .from('comments')
      .insert(commentData)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Eroare la crearea comentariului: ${error.message}`);
    }
    return data;
  }

  /**
   * Obține comentariile pentru o știre sau sinteză
   * @param {string} parentType - Tipul părintelui ('stire' sau 'synthesis')
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

    // Folosește o subquery pentru a evita problemele cu join-urile Supabase
    const { data, error, count } = await this.supabase
      .from('comments')
      .select(`
        *,
        editHistory:comment_edits (
          id,
          previous_content,
          edited_at
        )
      `, { count: 'exact' })
      .eq('parent_type', parentType)
      .eq('parent_id', parentId)
      .order(orderBy, { ascending: orderDirection === 'ASC' })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Eroare la obținerea comentariilor: ${error.message}`);
    }

    return {
      comments: data || [],
      totalCount: count || 0
    };
  }

  /**
   * Actualizează un comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} updateData - Datele de actualizare
   * @returns {Promise<Object>} Comentariul actualizat
   */
  async updateComment(commentId, userId, updateData) {
    // Salvează conținutul anterior în istoric
    const { data: currentComment, error: fetchError } = await this.supabase
      .from('comments')
      .select('content')
      .eq('id', commentId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(`Eroare la obținerea comentariului: ${fetchError.message}`);
    }

    if (!currentComment) {
      throw new Error('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l edita');
    }

    // Salvează conținutul anterior în istoric
    const { error: historyError } = await this.supabase
      .from('comment_edits')
      .insert({
        comment_id: commentId,
        previous_content: currentComment.content
      });

    if (historyError) {
      console.warn('Eroare la salvarea istoricului editării:', historyError.message);
      // Nu aruncăm eroarea aici pentru a nu bloca actualizarea
    }

    // Actualizează comentariul
    const { data, error } = await this.supabase
      .from('comments')
      .update({
        ...updateData,
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('user_id', userId)
      .select(`
        *,
        editHistory:comment_edits (
          id,
          previous_content,
          edited_at
        )
      `)
      .single();

    if (error) {
      throw new Error(`Eroare la actualizarea comentariului: ${error.message}`);
    }
    return data;
  }

  /**
   * Șterge un comentariu
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă ștergerea a reușit
   */
  async deleteComment(commentId, userId) {
    // Verifică dacă comentariul aparține utilizatorului
    const { data: existingComment, error: fetchError } = await this.supabase
      .from('comments')
      .select('id')
      .eq('id', commentId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(`Eroare la obținerea comentariului: ${fetchError.message}`);
    }

    if (!existingComment) {
      throw new Error('Comentariul nu a fost găsit sau nu aveți permisiunea de a-l șterge');
    }

    const { error } = await this.supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Eroare la ștergerea comentariului: ${error.message}`);
    }
    return true;
  }

  /**
   * Obține un comentariu după ID
   * @param {string} commentId - ID-ul comentariului
   * @returns {Promise<Object>} Comentariul cu informații complete
   */
  async getCommentById(commentId) {
    const { data, error } = await this.supabase
      .from('comments')
      .select(`
        *,
        profiles!comments_user_id_fkey (
          id,
          displayName,
          avatarUrl,
          subscriptionTier
        ),
        editHistory:comment_edits (
          id,
          previous_content,
          edited_at
        )
      `)
      .eq('id', commentId)
      .single();

    if (error) {
      throw new Error(`Eroare la obținerea comentariului: ${error.message}`);
    }
    return data;
  }

  /**
   * Verifică dacă un comentariu aparține unui utilizator
   * @param {string} commentId - ID-ul comentariului
   * @param {string} userId - ID-ul utilizatorului
   * @returns {Promise<boolean>} True dacă comentariul aparține utilizatorului
   */
  async isCommentOwner(commentId, userId) {
    const { data, error } = await this.supabase
      .from('comments')
      .select('id')
      .eq('id', commentId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return false;
    }
    return !!data;
  }

  /**
   * Obține statistici despre comentariile unui părinte
   * @param {string} parentType - Tipul părintelui
   * @param {string} parentId - ID-ul părintelui
   * @returns {Promise<Object>} Statistici despre comentarii
   */
  async getCommentStats(parentType, parentId) {
    const { data, error } = await this.supabase
      .rpc('get_comment_stats', {
        p_parent_type: parentType,
        p_parent_id: parentId
      });

    if (error) {
      throw new Error(`Eroare la obținerea statisticilor: ${error.message}`);
    }

    return data?.[0] || {
      total_comments: 0,
      unique_users: 0,
      edited_comments: 0,
      latest_comment: null
    };
  }

  /**
   * Validează existența părintelui comentariului
   * @param {string} parentType - Tipul părintelui
   * @param {string} parentId - ID-ul părintelui
   * @returns {Promise<boolean>} True dacă părintele există
   */
  async validateParentExists(parentType, parentId) {
    const { data, error } = await this.supabase
      .rpc('validate_comment_parent', {
        p_parent_type: parentType,
        p_parent_id: parentId
      });

    if (error) {
      throw new Error(`Eroare la validarea părintelui: ${error.message}`);
    }

    return data;
  }

  /**
   * Obține comentariile unui utilizator
   * @param {string} userId - ID-ul utilizatorului
   * @param {Object} options - Opțiuni de paginare
   * @returns {Promise<Object>} Comentariile utilizatorului
   */
  async getUserComments(userId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    const { data, error, count } = await this.supabase
      .from('comments')
      .select(`
        *,
        profiles!comments_user_id_fkey (
          id,
          displayName,
          avatarUrl,
          subscriptionTier
        ),
        editHistory:comment_edits (
          id,
          previous_content,
          edited_at
        )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order(orderBy, { ascending: orderDirection === 'ASC' })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Eroare la obținerea comentariilor utilizatorului: ${error.message}`);
    }

    return {
      comments: data || [],
      totalCount: count || 0
    };
  }
}

export default CommentRepository;
