-- =====================================================
-- MIGRAȚIE 002: DATE DE TEST
-- =====================================================

-- Inserarea unor știri de test pentru dezvoltare
INSERT INTO stiri (title, publication_date, content) VALUES
(
    'Monitorul Oficial publică hotărârea de guvern nr. 123/2024',
    '2024-01-15',
    '{
        "summary": "Guvernul României a aprobat o nouă hotărâre privind modernizarea infrastructurii digitale",
        "body": "În ședința de astăzi, Guvernul României a aprobat Hotărârea nr. 123/2024 privind aprobarea Strategiei naționale pentru digitalizarea administrației publice pentru perioada 2024-2027. Documentul prevede investiții de peste 2 miliarde de euro în modernizarea sistemelor informatice ale administrației publice.",
        "keywords": ["digitalizare", "administrație publică", "tehnologie"],
        "author": "Ministerul pentru Digitizarea României",
        "category": "administrație publică"
    }'
),
(
    'Ordonanță de urgență privind modificarea Codului fiscal',
    '2024-01-14',
    '{
        "summary": "Se modifică anumite prevederi ale Codului fiscal pentru stimularea investițiilor",
        "body": "Prin Ordonanța de urgență nr. 45/2024 se modifică și completează Codul fiscal, aprobat prin Legea nr. 227/2015, precum și alte acte normative în domeniul fiscal. Modificările vizează în principal stimularea investițiilor în tehnologii verzi și digitalizare.",
        "keywords": ["cod fiscal", "investiții", "tehnologii verzi"],
        "author": "Ministerul Finanțelor",
        "category": "fiscalitate"
    }'
),
(
    'Lege pentru aprobarea OUG privind protecția consumatorilor',
    '2024-01-13',
    '{
        "summary": "Parlamentul a aprobat legea pentru protecția consumatorilor în comerțul electronic",
        "body": "Camera Deputaților a aprobat definitiv Legea pentru aprobarea Ordonanței de urgență a Guvernului nr. 34/2024 privind protecția consumatorilor în comerțul electronic. Legea introduce măsuri suplimentare de protecție pentru cumpărătorii online.",
        "keywords": ["consumatori", "comerț electronic", "protecție"],
        "author": "Camera Deputaților",
        "category": "legislație"
    }'
),
(
    'Hotărâre privind aprobarea Programului național de dezvoltare rurală',
    '2024-01-12',
    '{
        "summary": "Se aprobă programul de dezvoltare rurală pentru perioada 2024-2030",
        "body": "Guvernul a aprobat Hotărârea nr. 89/2024 privind aprobarea Programului național de dezvoltare rurală pentru perioada 2024-2030. Programul prevede alocarea a 8,5 miliarde de euro pentru modernizarea agriculturii și dezvoltarea comunităților rurale.",
        "keywords": ["dezvoltare rurală", "agricultură", "fonduri europene"],
        "author": "Ministerul Agriculturii și Dezvoltării Rurale",
        "category": "agricultură"
    }'
),
(
    'Ordonanță de urgență privind modificarea Legii educației naționale',
    '2024-01-11',
    '{
        "summary": "Se modifică anumite prevederi ale Legii educației naționale",
        "body": "Prin Ordonanța de urgență nr. 67/2024 se modifică și completează Legea educației naționale nr. 1/2011. Modificările vizează în principal introducerea unor măsuri pentru îmbunătățirea calității educației și modernizarea sistemului de învățământ.",
        "keywords": ["educație", "învățământ", "calitate"],
        "author": "Ministerul Educației",
        "category": "educație"
    }'
),
(
    'Hotărâre privind aprobarea Strategiei naționale pentru sănătate',
    '2024-01-10',
    '{
        "summary": "Se aprobă strategia națională pentru sănătate 2024-2030",
        "body": "Guvernul a aprobat Hotărârea nr. 156/2024 privind aprobarea Strategiei naționale pentru sănătate pentru perioada 2024-2030. Strategia prevede investiții majore în modernizarea sistemului de sănătate și îmbunătățirea accesului la serviciile medicale.",
        "keywords": ["sănătate", "sistem medical", "strategie națională"],
        "author": "Ministerul Sănătății",
        "category": "sănătate"
    }'
),
(
    'Lege pentru aprobarea OUG privind protecția mediului',
    '2024-01-09',
    '{
        "summary": "Parlamentul a aprobat legea pentru protecția mediului și economia circulară",
        "body": "Senatul a aprobat definitiv Legea pentru aprobarea Ordonanței de urgență a Guvernului nr. 23/2024 privind protecția mediului și economia circulară. Legea introduce măsuri pentru reducerea deșeurilor și promovarea reciclării.",
        "keywords": ["mediu", "economie circulară", "reciclare"],
        "author": "Senatul României",
        "category": "mediu"
    }'
),
(
    'Hotărâre privind aprobarea Programului național de transport',
    '2024-01-08',
    '{
        "summary": "Se aprobă programul național de transport pentru perioada 2024-2030",
        "body": "Guvernul a aprobat Hotărârea nr. 234/2024 privind aprobarea Programului național de transport pentru perioada 2024-2030. Programul prevede investiții de 15 miliarde de euro în modernizarea infrastructurii de transport.",
        "keywords": ["transport", "infrastructură", "investiții"],
        "author": "Ministerul Transporturilor",
        "category": "transport"
    }'
),
(
    'Ordonanță de urgență privind modificarea Codului de procedură civilă',
    '2024-01-07',
    '{
        "summary": "Se modifică anumite prevederi ale Codului de procedură civilă",
        "body": "Prin Ordonanța de urgență nr. 78/2024 se modifică și completează Codul de procedură civilă. Modificările vizează în principal accelerarea procedurilor judiciare și modernizarea sistemului de justiție.",
        "keywords": ["procedură civilă", "justiție", "proceduri judiciare"],
        "author": "Ministerul Justiției",
        "category": "justiție"
    }'
),
(
    'Hotărâre privind aprobarea Strategiei naționale pentru energie',
    '2024-01-06',
    '{
        "summary": "Se aprobă strategia națională pentru energie și schimbările climatice",
        "body": "Guvernul a aprobat Hotărârea nr. 345/2024 privind aprobarea Strategiei naționale pentru energie și schimbările climatice pentru perioada 2024-2030. Strategia prevede tranziția către energii regenerabile și reducerea emisiilor de CO2.",
        "keywords": ["energie", "schimbări climatice", "energii regenerabile"],
        "author": "Ministerul Energiei",
        "category": "energie"
    }'
);

-- Verificarea inserării datelor
SELECT 
    'Date de test inserate cu succes' as status,
    COUNT(*) as numar_stiri
FROM stiri;
