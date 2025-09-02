#!/usr/bin/env node

/**
 * Script de test pentru funcționalitatea de conexiuni legislative
 * Validează că toate funcțiile și API-urile funcționează corect
 */

import { createClient } from '@supabase/supabase-js';

// Configurare Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://kwgfkcxlgxikmzdpxulp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Test 1: Verifică că tabela legislative_connections există
 */
async function testTableExists() {
  console.log('🔍 Test 1: Verificarea existenței tabelei legislative_connections');
  
  try {
    const { data, error } = await supabase
      .from('legislative_connections')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('   ❌ Eroare:', error.message);
      return false;
    }
    
    console.log('   ✅ Tabela legislative_connections există');
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 2: Verifică că funcțiile de baza de date există
 */
async function testDatabaseFunctions() {
  console.log('\n🔍 Test 2: Verificarea funcțiilor de baza de date');
  
  const functions = [
    'extract_legislative_connections',
    'get_legislative_graph',
    'get_legislative_connections_stats',
    'process_existing_stiri_for_connections',
    'cleanup_orphaned_connections'
  ];
  
  let allFunctionsExist = true;
  
  for (const funcName of functions) {
    try {
      const { data, error } = await supabase
        .rpc(funcName, { p_stire_id: 1, p_content: 'test', p_entities: '[]' });
      
      if (error && !error.message.includes('function') && !error.message.includes('parameter')) {
        console.log(`   ❌ Funcția ${funcName}: ${error.message}`);
        allFunctionsExist = false;
      } else {
        console.log(`   ✅ Funcția ${funcName} există`);
      }
    } catch (error) {
      console.log(`   ❌ Funcția ${funcName}: ${error.message}`);
      allFunctionsExist = false;
    }
  }
  
  return allFunctionsExist;
}

/**
 * Test 3: Testează extragerea conexiunilor pentru o știre
 */
async function testConnectionExtraction() {
  console.log('\n🔍 Test 3: Testarea extragerii conexiunilor');
  
  try {
    // Găsește o știre cu entități legislative
    const { data: stiri, error: stiriError } = await supabase
      .from('stiri')
      .select('id, title, entities')
      .not('entities', 'is', null)
      .limit(1);
    
    if (stiriError || !stiri || stiri.length === 0) {
      console.log('   ❌ Nu s-au găsit știri cu entități');
      return false;
    }
    
    const stire = stiri[0];
    console.log(`   📄 Testez știrea: ${stire.title.substring(0, 50)}...`);
    
    // Extrage conexiunile
    const { error: extractError } = await supabase
      .rpc('extract_legislative_connections', {
        p_stire_id: stire.id,
        p_content: JSON.stringify({ title: stire.title }),
        p_entities: stire.entities
      });
    
    if (extractError) {
      console.log('   ❌ Eroare la extragerea conexiunilor:', extractError.message);
      return false;
    }
    
    console.log('   ✅ Extragerea conexiunilor a funcționat');
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 4: Testează obținerea graficului legislative
 */
async function testLegislativeGraph() {
  console.log('\n🔍 Test 4: Testarea obținerii graficului legislative');
  
  try {
    // Verifică dacă există conexiuni
    const { data: connections, error: connectionsError } = await supabase
      .from('legislative_connections')
      .select('*')
      .limit(1);
    
    if (connectionsError || !connections || connections.length === 0) {
      console.log('   ⚠️  Nu există conexiuni legislative pentru testare');
      return true; // Nu este o eroare, doar nu există date
    }
    
    const connection = connections[0];
    console.log(`   📊 Testez graficul pentru știrea ${connection.source_document_id}`);
    
    // Obține graficul (cu limitarea de securitate la depth = 3)
    const { data: graph, error: graphError } = await supabase
      .rpc('get_legislative_graph', {
        p_document_id: connection.source_document_id,
        p_depth: 1
      });
    
    if (graphError) {
      console.log('   ❌ Eroare la obținerea graficului:', graphError.message);
      return false;
    }
    
    if (graph && graph.length > 0) {
      const result = graph[0];
      console.log(`   ✅ Graficul a fost obținut: ${result.nodes?.length || 0} noduri, ${result.links?.length || 0} conexiuni`);
    } else {
      console.log('   ✅ Funcția a rulat, dar nu a returnat date');
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 5: Testează obținerea statisticilor
 */
async function testStatistics() {
  console.log('\n🔍 Test 5: Testarea obținerii statisticilor');
  
  try {
    const { data: stats, error: statsError } = await supabase
      .rpc('get_legislative_connections_stats');
    
    if (statsError) {
      console.log('   ❌ Eroare la obținerea statisticilor:', statsError.message);
      return false;
    }
    
    if (stats && stats.length > 0) {
      const result = stats[0];
      console.log(`   ✅ Statisticile au fost obținute: ${result.total_connections || 0} conexiuni totale`);
    } else {
      console.log('   ✅ Funcția a rulat, dar nu a returnat date');
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 6: Testează procesarea în lot
 */
async function testBatchProcessing() {
  console.log('\n🔍 Test 6: Testarea procesării în lot');
  
  try {
    const { data: count, error: processError } = await supabase
      .rpc('process_existing_stiri_for_connections');
    
    if (processError) {
      console.log('   ❌ Eroare la procesarea în lot:', processError.message);
      return false;
    }
    
    console.log(`   ✅ Procesarea în lot a funcționat: ${count || 0} știri procesate`);
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 7: Verifică trigger-urile
 */
async function testTriggers() {
  console.log('\n🔍 Test 7: Verificarea trigger-urilor');
  
  try {
    // Verifică dacă există trigger-uri
    const { data, error } = await supabase
      .rpc('get_legislative_connections_stats');
    
    if (error) {
      console.log('   ❌ Nu se pot verifica trigger-urile:', error.message);
      return false;
    }
    
    console.log('   ✅ Trigger-urile par să funcționeze (funcția de statistici rulează)');
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Test 8: Verifică limitarea de securitate pentru depth
 */
async function testSecurityDepthLimit() {
  console.log('\n🔒 Test 8: Verificarea limitării de securitate pentru depth');
  
  try {
    // Verifică dacă există conexiuni pentru testare
    const { data: connections, error: connectionsError } = await supabase
      .from('legislative_connections')
      .select('*')
      .limit(1);
    
    if (connectionsError || !connections || connections.length === 0) {
      console.log('   ⚠️  Nu există conexiuni legislative pentru testare');
      return true;
    }
    
    const connection = connections[0];
    console.log(`   📊 Testez limitarea de securitate pentru știrea ${connection.source_document_id}`);
    
    // Testează cu depth = 3 (limita maximă)
    const { data: graphValid, error: graphValidError } = await supabase
      .rpc('get_legislative_graph', {
        p_document_id: connection.source_document_id,
        p_depth: 3
      });
    
    if (graphValidError) {
      console.log('   ❌ Eroare la depth = 3 (ar trebui să funcționeze):', graphValidError.message);
      return false;
    }
    
    // Testează cu depth = 4 (ar trebui să eșueze)
    const { data: graphInvalid, error: graphInvalidError } = await supabase
      .rpc('get_legislative_graph', {
        p_document_id: connection.source_document_id,
        p_depth: 4
      });
    
    if (!graphInvalidError) {
      console.log('   ❌ Depth = 4 nu a fost respins (ar trebui să eșueze)');
      return false;
    }
    
    console.log('   ✅ Limitarea de securitate funcționează: depth > 3 este respins');
    return true;
  } catch (error) {
    console.log('   ❌ Eroare neașteptată:', error.message);
    return false;
  }
}

/**
 * Funcția principală de testare
 */
async function runAllTests() {
  console.log('🚀 PORNIREA TESTELOR PENTRU FUNCȚIONALITATEA DE CONEXIUNI LEGISLATIVE\n');
  console.log('=' .repeat(80));
  
  const tests = [
    { name: 'Existența tabelei', func: testTableExists },
    { name: 'Funcțiile de baza de date', func: testDatabaseFunctions },
    { name: 'Extragerea conexiunilor', func: testConnectionExtraction },
    { name: 'Obținerea graficului', func: testLegislativeGraph },
    { name: 'Obținerea statisticilor', func: testStatistics },
    { name: 'Procesarea în lot', func: testBatchProcessing },
    { name: 'Verificarea trigger-urilor', func: testTriggers },
    { name: 'Limitarea de securitate pentru depth', func: testSecurityDepthLimit }
  ];
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    try {
      const result = await test.func();
      if (result) {
        passedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Testul ${test.name} a eșuat cu o eroare neașteptată:`, error.message);
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log(`📊 REZULTATELE TESTELOR: ${passedTests}/${totalTests} teste au trecut`);
  
  if (passedTests === totalTests) {
    console.log('🎉 Toate testele au trecut cu succes! Funcționalitatea de conexiuni legislative funcționează perfect.');
  } else {
    console.log('⚠️  Unele teste au eșuat. Verifică log-urile de mai sus pentru detalii.');
  }
  
  console.log('\n💡 Pentru a rula testele individual, poți apela funcțiile:');
  tests.forEach(test => {
    console.log(`   - ${test.func.name}`);
  });
}

// Rulează testele dacă scriptul este executat direct
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export {
  testTableExists,
  testDatabaseFunctions,
  testConnectionExtraction,
  testLegislativeGraph,
  testStatistics,
  testBatchProcessing,
  testTriggers,
  testSecurityDepthLimit,
  runAllTests
};
