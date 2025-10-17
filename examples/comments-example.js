/**
 * Exemplu de utilizare a sistemului de comentarii
 * Demonstrează cum să folosești API-ul GraphQL pentru comentarii
 */

// =====================================================
// EXEMPLE DE QUERY-URI
// =====================================================

// Obține comentariile pentru o știre
const getCommentsQuery = `
  query GetComments($parentType: CommentParentType!, $parentId: ID!) {
    getComments(parentType: $parentType, parentId: $parentId) {
      comments {
        id
        content
        createdAt
        isEdited
        editedAt
        user {
          id
          profile {
            displayName
            avatarUrl
            subscriptionTier
          }
        }
        editHistory {
          id
          previousContent
          editedAt
        }
      }
      pagination {
        totalCount
        hasNextPage
        hasPreviousPage
        currentPage
        totalPages
      }
    }
  }
`;

// Obține un comentariu specific
const getCommentByIdQuery = `
  query GetCommentById($id: ID!) {
    getCommentById(id: $id) {
      id
      content
      parentType
      parentId
      isEdited
      createdAt
      updatedAt
      user {
        profile {
          displayName
        }
      }
      editHistory {
        previousContent
        editedAt
      }
    }
  }
`;

// =====================================================
// EXEMPLE DE MUTAȚII
// =====================================================

// Creează un comentariu nou
const createCommentMutation = `
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      parentType
      parentId
      createdAt
      user {
        id
        profile {
          displayName
          subscriptionTier
        }
      }
    }
  }
`;

// Actualizează un comentariu
const updateCommentMutation = `
  mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
    updateComment(id: $id, input: $input) {
      id
      content
      isEdited
      editedAt
      updatedAt
      editHistory {
        id
        previousContent
        editedAt
      }
    }
  }
`;

// Șterge un comentariu
const deleteCommentMutation = `
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;

// =====================================================
// EXEMPLE DE UTILIZARE
// =====================================================

// Exemplu 1: Adaugă comentariu la o știre
async function addCommentToStire(stireId, content) {
  const variables = {
    input: {
      content: content,
      parentType: "STIRE",
      parentId: stireId
    }
  };

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        query: createCommentMutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.createComment;
  } catch (error) {
    console.error('Eroare la adăugarea comentariului:', error);
    throw error;
  }
}

// Exemplu 2: Adaugă comentariu la o sinteză
async function addCommentToSynthesis(synthesisId, content) {
  const variables = {
    input: {
      content: content,
      parentType: "SYNTHESIS",
      parentId: synthesisId
    }
  };

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        query: createCommentMutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.createComment;
  } catch (error) {
    console.error('Eroare la adăugarea comentariului:', error);
    throw error;
  }
}

// Exemplu 3: Obține comentariile pentru o știre cu paginare
async function getStireComments(stireId, page = 1, limit = 20) {
  const variables = {
    parentType: "STIRE",
    parentId: stireId,
    limit: limit,
    offset: (page - 1) * limit,
    orderBy: "created_at",
    orderDirection: "DESC"
  };

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        query: getCommentsQuery,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.getComments;
  } catch (error) {
    console.error('Eroare la obținerea comentariilor:', error);
    throw error;
  }
}

// Exemplu 4: Actualizează un comentariu
async function updateComment(commentId, newContent) {
  const variables = {
    id: commentId,
    input: {
      content: newContent
    }
  };

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        query: updateCommentMutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.updateComment;
  } catch (error) {
    console.error('Eroare la actualizarea comentariului:', error);
    throw error;
  }
}

// Exemplu 5: Șterge un comentariu
async function deleteComment(commentId) {
  const variables = {
    id: commentId
  };

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        query: deleteCommentMutation,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data.deleteComment;
  } catch (error) {
    console.error('Eroare la ștergerea comentariului:', error);
    throw error;
  }
}

// =====================================================
// EXEMPLE DE GESTIONARE A ERORILOR
// =====================================================

// Exemplu de gestionare a erorilor
async function handleCommentError(error) {
  if (error.message.includes('SUBSCRIPTION_REQUIRED')) {
    console.log('❌ Este necesar un abonament activ sau trial pentru a comenta');
    // Redirect la pagina de abonament
    window.location.href = '/subscription';
  } else if (error.message.includes('VALIDATION_ERROR')) {
    console.log('❌ Date invalide pentru comentariu');
    // Afișează erorile de validare
  } else if (error.message.includes('FORBIDDEN')) {
    console.log('❌ Nu aveți permisiunea de a efectua această operațiune');
  } else {
    console.log('❌ Eroare neașteptată:', error.message);
  }
}

// =====================================================
// EXEMPLE DE INTERFAȚĂ UTILIZATOR
// =====================================================

// Exemplu de componentă React pentru comentarii
const CommentsComponent = ({ parentType, parentId }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [pagination, setPagination] = useState({});

  // Încarcă comentariile
  const loadComments = async (page = 1) => {
    setLoading(true);
    try {
      const result = await getStireComments(parentId, page);
      setComments(result.comments);
      setPagination(result.pagination);
    } catch (error) {
      handleCommentError(error);
    } finally {
      setLoading(false);
    }
  };

  // Adaugă comentariu nou
  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      const comment = await addCommentToStire(parentId, newComment);
      setComments([comment, ...comments]);
      setNewComment('');
    } catch (error) {
      handleCommentError(error);
    }
  };

  // Actualizează comentariu
  const handleUpdateComment = async (commentId, newContent) => {
    try {
      const updatedComment = await updateComment(commentId, newContent);
      setComments(comments.map(c => 
        c.id === commentId ? updatedComment : c
      ));
    } catch (error) {
      handleCommentError(error);
    }
  };

  // Șterge comentariu
  const handleDeleteComment = async (commentId) => {
    if (!confirm('Sigur doriți să ștergeți acest comentariu?')) return;

    try {
      await deleteComment(commentId);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      handleCommentError(error);
    }
  };

  useEffect(() => {
    loadComments();
  }, [parentId]);

  return (
    <div className="comments-section">
      <h3>Comentarii ({pagination.totalCount || 0})</h3>
      
      {/* Formular pentru comentariu nou */}
      <div className="add-comment">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Adăugați un comentariu..."
          maxLength={2000}
        />
        <button onClick={handleAddComment} disabled={loading}>
          Adaugă Comentariu
        </button>
      </div>

      {/* Lista de comentarii */}
      <div className="comments-list">
        {loading ? (
          <div>Se încarcă comentariile...</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="author">{comment.user.profile.displayName}</span>
                <span className="date">{new Date(comment.createdAt).toLocaleString()}</span>
                {comment.isEdited && (
                  <span className="edited">(editat)</span>
                )}
              </div>
              <div className="comment-content">{comment.content}</div>
              
              {/* Istoricul editărilor */}
              {comment.editHistory.length > 0 && (
                <details className="edit-history">
                  <summary>Istoricul editărilor</summary>
                  {comment.editHistory.map(edit => (
                    <div key={edit.id} className="edit-item">
                      <div className="edit-content">{edit.previousContent}</div>
                      <div className="edit-date">{new Date(edit.editedAt).toLocaleString()}</div>
                    </div>
                  ))}
                </details>
              )}

              {/* Acțiuni pentru comentariul propriu */}
              <div className="comment-actions">
                <button onClick={() => handleUpdateComment(comment.id, prompt('Noul conținut:', comment.content))}>
                  Editează
                </button>
                <button onClick={() => handleDeleteComment(comment.id)}>
                  Șterge
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginare */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button 
            disabled={!pagination.hasPreviousPage}
            onClick={() => loadComments(pagination.currentPage - 1)}
          >
            Anterior
          </button>
          <span>Pagina {pagination.currentPage} din {pagination.totalPages}</span>
          <button 
            disabled={!pagination.hasNextPage}
            onClick={() => loadComments(pagination.currentPage + 1)}
          >
            Următor
          </button>
        </div>
      )}
    </div>
  );
};

// =====================================================
// FUNCȚII UTILITARE
// =====================================================

// Obține token-ul de autentificare
function getAuthToken() {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
}

// Validează conținutul comentariului
function validateCommentContent(content) {
  if (!content || content.trim().length === 0) {
    return 'Conținutul comentariului nu poate fi gol';
  }
  
  if (content.length > 2000) {
    return 'Comentariul nu poate depăși 2000 de caractere';
  }
  
  return null;
}

// Formatează data pentru afișare
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('ro-RO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Export pentru utilizare în alte module
export {
  addCommentToStire,
  addCommentToSynthesis,
  getStireComments,
  updateComment,
  deleteComment,
  handleCommentError,
  CommentsComponent,
  validateCommentContent,
  formatDate
};
