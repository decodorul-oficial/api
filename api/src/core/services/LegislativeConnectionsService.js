/**
 * Serviciu pentru gestionarea conexiunilor legislative și analiza de rețea
 * Implementează funcționalități pentru extragerea automată și analiza
 * relațiilor dintre acte normative
 */

import { GraphQLError } from 'graphql';

export class LegislativeConnectionsService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Generează o descriere în limbaj natural pentru o conexiune
   * @param {Object} link - Conexiunea
   * @param {Array} nodes - Lista tuturor nodurilor
   * @returns {String} Descrierea în limbaj natural
   */
  generateConnectionDescription(link, nodes) {
    const sourceNode = nodes.find(n => n.id === String(link.source));
    const targetNode = nodes.find(n => n.id === String(link.target));
    
    if (!sourceNode || !targetNode) {
      return '';
    }

    const relationshipDescriptions = {
      'modifică': 'modifică prevederile',
      'completează': 'completează prevederile',
      'abrogă': 'abrogă',
      'face referire la': 'face referire la',
      'derogă': 'derogă temporar de la',
      'suspendă': 'suspendă temporar',
      'face referire la (extern)': 'face referire la'
    };

    const verb = relationshipDescriptions[link.type] || 'face referire la';
    
    // Extrage numărul actului țintă pentru a face descrierea mai clară
    const targetNumberMatch = targetNode.title.match(/(?:nr\.?|Nr\.?|Nr)\s*(\d+)\/(\d{4})/i);
    const targetAct = targetNumberMatch 
      ? `actul ${targetNumberMatch[1]}/${targetNumberMatch[2]}`
      : 'acest act';

    return `Acest act ${verb} ${targetAct}`;
  }

  /**
   * Obține graficul de conexiuni legislative pentru un document dat
   * @param {number} documentId - ID-ul documentului sursă
   * @param {number} depth - Adâncimea de explorare (implicit 1)
   * @param {number} minConfidence - Scorul minim de încredere (implicit 0.6)
   * @param {number} maxNodes - Numărul maxim de noduri (implicit 40)
   * @param {number} maxLinks - Numărul maxim de conexiuni (implicit 20)
   * @returns {Promise<Object>} Graficul cu noduri și conexiuni
   */
  async getLegislativeGraph(documentId, depth = 1, minConfidence = 0.6, maxNodes = 40, maxLinks = 20) {
    try {
      // Validează parametrii
      if (!documentId || isNaN(Number(documentId))) {
        throw new GraphQLError('ID-ul documentului trebuie să fie un număr valid', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      // LIMITARE STRICTĂ DE SECURITATE: Adâncimea maximă este 3
      // Aceasta previne interogări extrem de complexe care pot bloca serviciul
      const MAX_DEPTH = 3;
      
      if (depth < 1 || depth > MAX_DEPTH) {
        throw new GraphQLError(`Adâncimea trebuie să fie între 1 și ${MAX_DEPTH}`, {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      // Apelează funcția din baza de date cu filtrul de încredere
      const { data, error } = await this.supabase
        .rpc('get_legislative_graph', {
          p_document_id: Number(documentId),
          p_depth: depth,
          p_min_confidence: minConfidence,
          p_max_nodes: maxNodes,
          p_max_links: maxLinks
        });

      if (error) {
        console.error('Eroare la obținerea graficului legislative:', error);
        throw new GraphQLError('Eroare la obținerea graficului legislative', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        });
      }

      if (!data || data.length === 0) {
        return {
          nodes: [],
          links: []
        };
      }

      const result = data[0];
      
      // Parsează nodurile și conexiunile din JSONB
      const nodes = result.nodes || [];
      const links = result.links || [];

      // Transformă tipurile de relații în limbaj natural
      const relationshipLabels = {
        'modifică': 'Modifică',
        'completează': 'Completează',
        'abrogă': 'Abrogă',
        'face referire la': 'Face referire la',
        'derogă': 'Derogă',
        'suspendă': 'Suspendă',
        'face referire la (extern)': 'Face referire la (act extern)'
      };

      // Transformă confidence score în indicatori vizuali
      const getConfidenceLabel = (confidence) => {
        if (confidence >= 0.9) return { label: 'Foarte probabil', level: 'high' };
        if (confidence >= 0.7) return { label: 'Probabil', level: 'medium' };
        return { label: 'Posibil', level: 'low' };
      };

      // Extrage informații relevante din titlu
      const extractDocumentInfo = (title) => {
        // Extrage numărul actului (ex: "nr. 890/2025")
        const numberMatch = title.match(/(?:nr\.?|Nr\.?|Nr)\s*(\d+)\/(\d{4})/i);
        const number = numberMatch ? `${numberMatch[1]}/${numberMatch[2]}` : null;
        
        // Extrage tipul actului (Ordin, Lege, Hotărâre, etc.)
        const typeMatch = title.match(/\b(Ordin|Lege|Hotărâre|Decret|Decizie|OUG|OG|PL)\b/i);
        const actType = typeMatch ? typeMatch[1] : null;
        
        // Creează un titlu scurt pentru afișare
        let shortTitle = title;
        if (actType && number) {
          shortTitle = `${actType} ${number}`;
          // Dacă mai sunt detalii relevante în titlu, le adăugăm
          const detailsMatch = title.match(/[|](.+)/);
          if (detailsMatch && detailsMatch[1].length < 100) {
            shortTitle += ` | ${detailsMatch[1].trim()}`;
          }
        } else if (title.length > 80) {
          shortTitle = title.substring(0, 80) + '...';
        }

        return {
          shortTitle,
          actNumber: number,
          actType: actType,
          fullTitle: title
        };
      };

      // Transformă nodurile cu informații îmbunătățite
      const enrichedNodes = nodes.map(node => {
        const docInfo = extractDocumentInfo(node.title);
        return {
          id: String(node.id),
          title: node.title,
          shortTitle: docInfo.shortTitle,
          actNumber: docInfo.actNumber,
          actType: docInfo.actType,
          publicationDate: node.publicationDate,
          type: node.type
        };
      });

      // Transformă conexiunile cu informații îmbunătățite
      const enrichedLinks = links.map(link => {
        const confidenceInfo = getConfidenceLabel(link.confidence);
        const relationshipLabel = relationshipLabels[link.type] || link.type;
        
        return {
          source: String(link.source),
          target: String(link.target),
          type: link.type,
          typeLabel: relationshipLabel,
          confidence: link.confidence,
          confidenceLabel: confidenceInfo.label,
          confidenceLevel: confidenceInfo.level,
          description: this.generateConnectionDescription(link, nodes)
        };
      });

      return {
        nodes: enrichedNodes,
        links: enrichedLinks
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      
      console.error('Eroare neașteptată în getLegislativeGraph:', error);
      throw new GraphQLError('Eroare internă la obținerea graficului legislative', {
        extensions: { code: 'INTERNAL_SERVER_ERROR' }
      });
    }
  }

  /**
   * Obține statistici despre conexiunile legislative
   * @returns {Promise<Object>} Statisticile conexiunilor
   */
  async getLegislativeConnectionStats() {
    try {
      const { data, error } = await this.supabase
        .rpc('get_legislative_connections_stats');

      if (error) {
        console.error('Eroare la obținerea statisticilor legislative:', error);
        throw new GraphQLError('Eroare la obținerea statisticilor legislative', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        });
      }

      if (!data || data.length === 0) {
        return {
          totalConnections: 0,
          connectionsByType: {},
          topSourceDocuments: [],
          topTargetDocuments: [],
          averageConfidence: 0.0
        };
      }

      const stats = data[0];
      
      return {
        totalConnections: stats.total_connections || 0,
        connectionsByType: stats.connections_by_type || {},
        topSourceDocuments: stats.top_source_documents || [],
        topTargetDocuments: stats.top_target_documents || [],
        averageConfidence: stats.average_confidence || 0.0
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      
      console.error('Eroare neașteptată în getLegislativeConnectionStats:', error);
      throw new GraphQLError('Eroare internă la obținerea statisticilor legislative', {
        extensions: { code: 'INTERNAL_SERVER_ERROR' }
      });
    }
  }

  /**
   * Procesează toate știrile existente pentru a extrage conexiunile legislative
   * @returns {Promise<number>} Numărul de știri procesate
   */
  async processExistingStiriForConnections() {
    try {
      const { data, error } = await this.supabase
        .rpc('process_existing_stiri_for_connections');

      if (error) {
        console.error('Eroare la procesarea știrilor existente:', error);
        throw new Error('Eroare la procesarea știrilor existente: ' + error.message);
      }

      return data || 0;
    } catch (error) {
      console.error('Eroare neașteptată în processExistingStiriForConnections:', error);
      throw error;
    }
  }

  /**
   * Curăță conexiunile legislative orfane
   * @returns {Promise<number>} Numărul de conexiuni șterse
   */
  async cleanupOrphanedConnections() {
    try {
      const { data, error } = await this.supabase
        .rpc('cleanup_orphaned_connections');

      if (error) {
        console.error('Eroare la curățarea conexiunilor orfane:', error);
        throw new Error('Eroare la curățarea conexiunilor orfane: ' + error.message);
      }

      return data || 0;
    } catch (error) {
      console.error('Eroare neașteptată în cleanupOrphanedConnections:', error);
      throw error;
    }
  }

  /**
   * Extrage manual conexiunile legislative pentru o știre specifică
   * @param {number} stireId - ID-ul știrii
   * @returns {Promise<boolean>} True dacă extragerea a reușit
   */
  async extractConnectionsForStire(stireId) {
    try {
      // Obține știrea cu entitățile extrase
      const { data: stire, error: stireError } = await this.supabase
        .from('stiri')
        .select('id, content, entities')
        .eq('id', stireId)
        .single();

      if (stireError || !stire) {
        throw new Error('Știrea nu a fost găsită');
      }

      if (!stire.entities || stire.entities.length === 0) {
        console.log(`Știrea ${stireId} nu are entități extrase`);
        return false;
      }

      // Apelează funcția de extragere
      const { error: extractError } = await this.supabase
        .rpc('extract_legislative_connections', {
          p_stire_id: stireId,
          p_content: JSON.stringify(stire.content),
          p_entities: stire.entities
        });

      if (extractError) {
        console.error('Eroare la extragerea conexiunilor:', extractError);
        throw new Error('Eroare la extragerea conexiunilor: ' + extractError.message);
      }

      return true;
    } catch (error) {
      console.error('Eroare neașteptată în extractConnectionsForStire:', error);
      throw error;
    }
  }

  /**
   * Obține conexiunile directe pentru un document
   * @param {number} documentId - ID-ul documentului
   * @returns {Promise<Array>} Lista conexiunilor directe
   */
  async getDirectConnections(documentId) {
    try {
      const { data, error } = await this.supabase
        .from('legislative_connections')
        .select(`
          id,
          relationship_type,
          confidence_score,
          extraction_method,
          created_at,
          source_document:source_document_id(id, title, publication_date),
          target_document:target_document_id(id, title, publication_date)
        `)
        .or(`source_document_id.eq.${documentId},target_document_id.eq.${documentId}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Eroare la obținerea conexiunilor directe:', error);
        throw new Error('Eroare la obținerea conexiunilor directe: ' + error.message);
      }

      return data || [];
    } catch (error) {
      console.error('Eroare neașteptată în getDirectConnections:', error);
      throw error;
    }
  }

  /**
   * Obține toate conexiunile legislative cu paginare
   * @param {Object} options - Opțiuni de paginare și filtrare
   * @returns {Promise<Object>} Conexiunile cu informații de paginare
   */
  async getAllConnections(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        relationshipType = null,
        minConfidence = 0.0,
        orderBy = 'created_at',
        orderDirection = 'desc'
      } = options;

      let query = this.supabase
        .from('legislative_connections')
        .select(`
          id,
          relationship_type,
          confidence_score,
          extraction_method,
          created_at,
          source_document:source_document_id(id, title, publication_date),
          target_document:target_document_id(id, title, publication_date)
        `, { count: 'exact' });

      // Aplică filtrele
      if (relationshipType) {
        query = query.eq('relationship_type', relationshipType);
      }

      if (minConfidence > 0.0) {
        query = query.gte('confidence_score', minConfidence);
      }

      // Aplică ordinea
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });

      // Aplică paginarea
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Eroare la obținerea conexiunilor:', error);
        throw new Error('Eroare la obținerea conexiunilor: ' + error.message);
      }

      const totalPages = Math.ceil((count || 0) / limit);

      return {
        connections: data || [],
        pagination: {
          currentPage: page,
          totalPages,
          totalCount: count || 0,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      };
    } catch (error) {
      console.error('Eroare neașteptată în getAllConnections:', error);
      throw error;
    }
  }

  /**
   * Obține conexiunile (din view-ul conexiuni_documente) pentru o știre
   * @param {number|string} newsId - ID-ul știrii
   * @param {Object} options - Opțiuni: relationType, limit, offset
   * @returns {Promise<Array>} Conexiuni mapate pentru GraphQL
   */
  async getDocumentConnectionsByNews(newsId, options = {}) {
    try {
      const { relationType = null, limit = 50, offset = 0 } = options;

      if (!newsId || isNaN(Number(newsId))) {
        throw new GraphQLError('ID-ul știrii trebuie să fie un număr valid', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      let query = this.supabase
        .from('conexiuni_documente')
        .select(
          `id_conexiune, id_stire_sursa, cheie_document_sursa, id_stire_tinta, cheie_document_tinta, tip_relatie, confidence_score, extraction_method`,
          { count: 'exact' }
        )
        .eq('id_stire_sursa', Number(newsId))
        .order('id_conexiune', { ascending: false });

      if (relationType) {
        query = query.eq('tip_relatie', relationType);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        console.error('Eroare la interogarea conexiunilor din view:', error);
        throw new GraphQLError('Eroare la obținerea conexiunilor documentelor', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        });
      }

      const rows = data || [];

      return rows.map((r) => ({
        idConexiune: String(r.id_conexiune),
        idStireSursa: r.id_stire_sursa != null ? String(r.id_stire_sursa) : null,
        cheieDocumentSursa: r.cheie_document_sursa || null,
        idStireTinta: r.id_stire_tinta != null ? String(r.id_stire_tinta) : null,
        cheieDocumentTinta: r.cheie_document_tinta || null,
        tipRelatie: r.tip_relatie,
        confidenceScore: r.confidence_score,
        extractionMethod: r.extraction_method
      }));
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      console.error('Eroare neașteptată în getDocumentConnectionsByNews:', error);
      throw new GraphQLError('Eroare internă la obținerea conexiunilor documentelor', {
        extensions: { code: 'INTERNAL_SERVER_ERROR' }
      });
    }
  }
}

export default LegislativeConnectionsService;
