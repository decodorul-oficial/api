/**
 * Exemplu de utilizare pentru analiza de rețea a conexiunilor legislative
 * Demonstrează cum să folosești noile query-uri GraphQL pentru a obține
 * harta conexiunilor dintre acte normative
 */

import { createClient } from '@supabase/supabase-js';

// Configurare Supabase (înlocuiește cu credențialele tale)
const supabaseUrl = process.env.SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Exemplu 1: Obținerea graficului de conexiuni legislative pentru un document
 */
async function getLegislativeGraphExample() {
  console.log('🔍 Exemplu: Obținerea graficului de conexiuni legislative\n');

  try {
    // Query GraphQL pentru obținerea graficului
    const query = `
      query GetLegislativeGraph($documentId: ID!, $depth: Int) {
        getLegislativeGraph(documentId: $documentId, depth: $depth) {
          nodes {
            id
            title
            publicationDate
            type
          }
          links {
            source
            target
            type
            confidence
          }
        }
      }
    `;

    // Variabile pentru query (înlocuiește cu ID-ul real al unui document)
    const variables = {
      documentId: "123", // ID-ul documentului pentru care vrei să vezi conexiunile
      depth: 2 // Adâncimea de explorare (1 = conexiuni directe, 2 = conexiuni indirecte, MAXIM 3)
    };

    console.log('📋 Parametrii query-ului:');
    console.log(`   Document ID: ${variables.documentId}`);
    console.log(`   Adâncime: ${variables.depth}`);
    console.log('');

    // Simulează un request GraphQL (în practică, acesta ar fi făcut prin API-ul tău)
    console.log('📊 Rezultatul așteptat:');
    console.log('   - Un grafic cu noduri reprezentând acte normative');
    console.log('   - Conexiuni între noduri cu tipul relației (modifică, completează, etc.)');
    console.log('   - Scor de încredere pentru fiecare conexiune');
    console.log('   - Adâncimea limitată la maxim 3 pentru securitate');
    console.log('');

    // Exemplu de rezultat așteptat
    const expectedResult = {
      nodes: [
        {
          id: "123",
          title: "Ordonanța de urgență nr. 15/2024",
          publicationDate: "2024-01-15",
          type: "legislation"
        },
        {
          id: "456",
          title: "Legea nr. 123/2020",
          publicationDate: "2020-06-20",
          type: "legislation"
        }
      ],
      links: [
        {
          source: "123",
          target: "456",
          type: "modifică",
          confidence: 0.85
        }
      ]
    };

    console.log('📈 Exemplu de rezultat:');
    console.log(JSON.stringify(expectedResult, null, 2));
    console.log('');

  } catch (error) {
    console.error('❌ Eroare la obținerea graficului legislative:', error);
  }
}

/**
 * Exemplu 2: Obținerea statisticilor despre conexiunile legislative
 */
async function getLegislativeStatsExample() {
  console.log('📊 Exemplu: Obținerea statisticilor despre conexiunile legislative\n');

  try {
    // Query GraphQL pentru statistici
    const query = `
      query GetLegislativeConnectionStats {
        getLegislativeConnectionStats {
          totalConnections
          connectionsByType
          topSourceDocuments
          topTargetDocuments
          averageConfidence
        }
      }
    `;

    console.log('📋 Query-ul pentru statistici:');
    console.log(query);
    console.log('');

    // Exemplu de rezultat așteptat
    const expectedStats = {
      totalConnections: 1250,
      connectionsByType: {
        "modifică": 450,
        "completează": 300,
        "abrogă": 200,
        "face referire la": 300
      },
      topSourceDocuments: [
        {
          document_id: 123,
          title: "Ordonanța de urgență nr. 15/2024",
          connections_count: 25
        }
      ],
      topTargetDocuments: [
        {
          document_id: 456,
          title: "Legea nr. 123/2020",
          connections_count: 18
        }
      ],
      averageConfidence: 0.78
    };

    console.log('📈 Exemplu de statistici:');
    console.log(JSON.stringify(expectedStats, null, 2));
    console.log('');

  } catch (error) {
    console.error('❌ Eroare la obținerea statisticilor:', error);
  }
}

/**
 * Exemplu 3: Utilizarea directă a funcțiilor din baza de date
 */
async function directDatabaseUsageExample() {
  console.log('🗄️ Exemplu: Utilizarea directă a funcțiilor din baza de date\n');

  try {
    // Exemplu 1: Obținerea graficului de conexiuni
    console.log('1️⃣ Obținerea graficului de conexiuni:');
    const { data: graphData, error: graphError } = await supabase
      .rpc('get_legislative_graph', {
        p_document_id: 123,
        p_depth: 2
      });

    if (graphError) {
      console.log('   ❌ Eroare:', graphError.message);
    } else {
      console.log('   ✅ Succes - Graficul a fost obținut');
      console.log(`   📊 Noduri: ${graphData?.[0]?.nodes?.length || 0}`);
      console.log(`   🔗 Conexiuni: ${graphData?.[0]?.links?.length || 0}`);
    }
    console.log('');

    // Exemplu 2: Obținerea statisticilor
    console.log('2️⃣ Obținerea statisticilor:');
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_legislative_connections_stats');

    if (statsError) {
      console.log('   ❌ Eroare:', statsError.message);
    } else {
      console.log('   ✅ Succes - Statisticile au fost obținute');
      console.log(`   📊 Total conexiuni: ${statsData?.[0]?.total_connections || 0}`);
    }
    console.log('');

    // Exemplu 3: Procesarea știrilor existente
    console.log('3️⃣ Procesarea știrilor existente pentru conexiuni:');
    const { data: processData, error: processError } = await supabase
      .rpc('process_existing_stiri_for_connections');

    if (processError) {
      console.log('   ❌ Eroare:', processError.message);
    } else {
      console.log('   ✅ Succes - Procesarea a fost finalizată');
      console.log(`   📝 Știri procesate: ${processData || 0}`);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Eroare la utilizarea directă a bazei de date:', error);
  }
}

/**
 * Exemplu 4: Analiza unui document specific
 */
async function analyzeSpecificDocumentExample() {
  console.log('🔍 Exemplu: Analiza unui document specific\n');

  try {
    // Pasul 1: Găsește un document cu entități extrase
    console.log('1️⃣ Căutarea unui document cu entități extrase:');
    const { data: stiri, error: stiriError } = await supabase
      .from('stiri')
      .select('id, title, entities')
      .not('entities', 'is', null)
      .limit(1);

    if (stiriError || !stiri || stiri.length === 0) {
      console.log('   ❌ Nu s-au găsit știri cu entități extrase');
      return;
    }

    const stire = stiri[0];
    console.log(`   ✅ Document găsit: ${stire.title}`);
    console.log(`   📄 ID: ${stire.id}`);
    console.log(`   🏷️ Entități: ${stire.entities?.length || 0}`);
    console.log('');

    // Pasul 2: Obține conexiunile directe pentru acest document
    console.log('2️⃣ Obținerea conexiunilor directe:');
    const { data: connections, error: connectionsError } = await supabase
      .from('legislative_connections')
      .select(`
        id,
        relationship_type,
        confidence_score,
        source_document:source_document_id(id, title),
        target_document:target_document_id(id, title)
      `)
      .or(`source_document_id.eq.${stire.id},target_document_id.eq.${stire.id}`);

    if (connectionsError) {
      console.log('   ❌ Eroare la obținerea conexiunilor:', connectionsError.message);
    } else {
      console.log(`   ✅ Conexiuni găsite: ${connections?.length || 0}`);
      
      if (connections && connections.length > 0) {
        console.log('   📊 Detalii conexiuni:');
        connections.forEach((conn, index) => {
          console.log(`      ${index + 1}. ${conn.relationship_type} (${conn.confidence_score})`);
          if (conn.source_document) {
            console.log(`         Sursă: ${conn.source_document.title}`);
          }
          if (conn.target_document) {
            console.log(`         Țintă: ${conn.target_document.title}`);
          }
        });
      }
    }
    console.log('');

  } catch (error) {
    console.error('❌ Eroare la analiza documentului:', error);
  }
}

/**
 * Funcția principală care rulează toate exemplele
 */
async function runAllExamples() {
  console.log('🚀 PORNIREA EXEMPLELOR PENTRU ANALIZA DE REȚEA LEGISLATIVĂ\n');
  console.log('=' .repeat(70));
  console.log('');

  await getLegislativeGraphExample();
  console.log('-' .repeat(70));
  console.log('');

  await getLegislativeStatsExample();
  console.log('-' .repeat(70));
  console.log('');

  await directDatabaseUsageExample();
  console.log('-' .repeat(70));
  console.log('');

  await analyzeSpecificDocumentExample();
  console.log('-' .repeat(70));
  console.log('');

  console.log('✅ Toate exemplele au fost rulate cu succes!');
  console.log('');
  console.log('💡 Pentru a utiliza aceste funcționalități în aplicația ta:');
  console.log('   1. Asigură-te că ai rulat migrațiile 024 și 025');
  console.log('   2. Folosește query-urile GraphQL din exemple');
  console.log('   3. Sau apelează direct funcțiile din baza de date');
  console.log('');
  console.log('🔗 Documentație: consultă schema GraphQL pentru detalii complete');
}

// Rulează exemplele dacă fișierul este executat direct
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

export {
  getLegislativeGraphExample,
  getLegislativeStatsExample,
  directDatabaseUsageExample,
  analyzeSpecificDocumentExample,
  runAllExamples
};
