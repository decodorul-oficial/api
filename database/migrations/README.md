# Migrații pentru Analiza de Rețea a Conexiunilor Legislative

Acest director conține toate migrațiile SQL necesare pentru implementarea funcționalității de analiză de rețea a conexiunilor legislative.

## Ordinea Migrațiilor

### 1. **024_legislative_connections.sql**
- Creează tabela principală `legislative_connections`
- Implementează funcția de extragere automată `extract_legislative_connections`
- Implementează funcția de obținere a graficului `get_legislative_graph`
- Implementează funcția de statistici `get_legislative_connections_stats`
- Activează RLS (Row Level Security)

### 2. **025_legislative_connections_trigger.sql**
- Creează trigger-urile automate pentru extragerea conexiunilor
- Implementează funcția de procesare în lot `process_existing_stiri_for_connections`
- Implementează funcția de curățare `cleanup_orphaned_connections`
- Implementează funcția de verificare a integrității `verify_connections_integrity`

### 3. **026_fix_legislative_graph_function.sql**
- Corectează eroarea din funcția `get_legislative_graph` (v_nodes vs v_links)

### 4. **027_fix_entity_field_reference.sql**
- Corectează referința la câmpul entity (folosește 'label' în loc de 'type')

### 5. **028_security_depth_limit.sql**
- Implementează limitarea de securitate pentru adâncimea graficului (MAX 3)

### 6. **029_robust_legislative_identifier_resolution.sql**
- Implementează sistemul robust de rezolvare a identificatorilor legislative
- Funcția `normalize_legislative_identifier` pentru parsing-ul identificatorilor
- Funcția `resolve_legislative_identifier` pentru potrivirea precisă

### 7. **030_fix_legislative_patterns.sql**
- Corectează regex-urile pentru hotărâre și decret

### 8. **031_simplify_legislative_patterns.sql**
- Simplifică pattern-urile pentru a evita problemele cu diacriticele

### 9. **032_normalize_diacritics.sql**
- Adaugă normalizarea diacriticelor pentru pattern-uri mai robuste

### 10. **033_fix_pattern_endings.sql**
- Corectează pattern-urile pentru a include terminările corecte

### 11. **035_external_documents_and_error_handling.sql**
- Implementează gestionarea documentelor externe (inexistente în baza de date)
- Implementează idempotența procesului de extragere
- Implementează gestionarea erorilor cu try-catch la nivel de entitate
- Creează tabela `external_legislative_documents`

### 12. **036_fix_external_document_function.sql**
- Corectează funcția `update_external_document_mention`

### 13. **037_fix_main_extraction_function.sql**
- Corectează funcția principală `extract_legislative_connections`

### 14. **039_allow_null_target_documents.sql**
- Permite `target_document_id = NULL` pentru documente externe și erori

### 15. **040_fix_all_constraints.sql**
- Corectează toate constrângerile pentru a permite documente externe și erori
- Implementează foreign key condițional prin trigger

### 16. **041_fix_external_stats_function.sql**
- Corectează funcția de statistici pentru documentele externe

### 17. **042_fix_external_stats_function_v2.sql**
- Corectează definitiv funcția de statistici

### 18. **043_fix_external_stats_function_v3.sql**
- Corectează final funcția de statistici

## Funcționalități Implementate

### 🔗 **Conexiuni Legislative**
- Extragerea automată din conținutul știrilor
- Identificarea tipurilor de relații (modifică, completează, abrogă, etc.)
- Scor de încredere pentru fiecare conexiune
- Metadate complete despre procesul de extragere

### 🌐 **Analiza de Rețea**
- Graficul de conexiuni cu adâncime configurată (MAX 3 pentru securitate)
- Statistici complete despre conexiuni
- Verificarea integrității conexiunilor

### 🛡️ **Securitate și Robustețe**
- RLS (Row Level Security) activat
- Limitarea strictă a adâncimii graficului
- Gestionarea erorilor cu try-catch
- Idempotența procesului de extragere

### 📚 **Documente Externe**
- Tracking-ul documentelor inexistente în baza de date
- Statistici despre referințele externe
- Conexiuni cu documente externe pentru analiza completă

### 🔧 **Mentenanță**
- Curățarea conexiunilor orfane
- Curățarea conexiunilor de eroare vechi
- Verificarea integrității datelor

## Utilizare

### Aplicarea Migrațiilor
```bash
# Aplică migrațiile în ordine cronologică
psql -d your_database -f 024_legislative_connections.sql
psql -d your_database -f 025_legislative_connections_trigger.sql
# ... și așa mai departe
```

### Testarea Funcționalității
```sql
-- Testează extragerea conexiunilor
SELECT public.extract_legislative_connections(417, 'conținut test', '[{"label": "WORK_OF_ART", "text": "Codul fiscal"}]'::jsonb);

-- Obține graficul de conexiuni
SELECT * FROM public.get_legislative_graph(417, 2);

-- Obține statistici
SELECT * FROM public.get_legislative_connections_stats();
SELECT * FROM public.get_external_documents_stats();
```

## Note Importante

1. **Ordinea migrațiilor** trebuie respectată strict
2. **Backup-ul bazei de date** înainte de aplicarea migrațiilor
3. **Testarea** pe un mediu de dezvoltare înainte de producție
4. **Monitorizarea** performanței după aplicarea migrațiilor

## Suport

Pentru probleme sau întrebări legate de migrații, consultă documentația completă din `docs/LEGISLATIVE_NETWORK_ANALYSIS.md`.
