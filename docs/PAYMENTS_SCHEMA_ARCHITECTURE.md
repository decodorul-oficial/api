# Payments Schema Architecture

## Prezentare Generală

Sistemul de plăți al Monitorul Oficial a fost reorganizat într-o schemă separată `payments` pentru a îmbunătăți securitatea, scalabilitatea și mentenanța aplicației.

## Structura Schemelor

### Schema `public` (Business Data)
- **stiri** - Știrile și conținutul
- **profiles** - Profilele utilizatorilor
- **usage_logs** - Log-uri de utilizare API
- **news_views** - Vizualizări de știri
- **user_preferences** - Preferințele utilizatorilor
- **daily_syntheses** - Sinteze zilnice
- **legislative_connections** - Conexiuni legislative
- **newsletter_subscribers** - Abonații la newsletter

### Schema `payments` (Financial Data)
- **subscription_tiers** - Tier-urile de abonament
- **subscriptions** - Abonamentele utilizatorilor
- **payment_methods** - Metodele de plată tokenizate
- **orders** - Comenzile de plată
- **refunds** - Rambursările
- **payment_logs** - Log-urile de plăți
- **webhook_processing** - Procesarea webhook-urilor

## Beneficii ale Separării

### 1. Securitate Îmbunătățită
- **Permisiuni granulare** pentru fiecare schemă
- **Izolarea datelor sensibile** financiar
- **RLS policies** separate pentru business vs. payments
- **Audit trail** independent pentru operațiunile financiare

### 2. Scalabilitate și Performanță
- **Indexuri optimizate** pentru fiecare domeniu
- **Backup-uri separate** pentru datele financiare
- **Monitorizare independentă** a performanței
- **Potențial pentru microservicii** în viitor

### 3. Mentenanță și Compliance
- **Separarea responsabilităților** clare
- **GDPR compliance** mai ușor de implementat
- **PCI DSS compliance** pentru datele de plăți
- **Raportare financiară** independentă

## Backward Compatibility

Pentru a asigura compatibilitatea cu codul existent, au fost create **views** în schema `public` care referențiază tabelele din schema `payments`:

```sql
-- Views pentru backward compatibility
CREATE VIEW public.subscription_tiers AS SELECT * FROM payments.subscription_tiers;
CREATE VIEW public.subscriptions AS SELECT * FROM payments.subscriptions;
CREATE VIEW public.payment_methods AS SELECT * FROM payments.payment_methods;
CREATE VIEW public.orders AS SELECT * FROM payments.orders;
CREATE VIEW public.refunds AS SELECT * FROM payments.refunds;
CREATE VIEW public.payment_logs AS SELECT * FROM payments.payment_logs;
CREATE VIEW public.webhook_processing AS SELECT * FROM payments.webhook_processing;
```

## Configurarea Client-ului Supabase

### Pentru Operațiuni de Business
```javascript
// Pentru datele de business (știri, utilizatori, etc.)
const supabaseBusiness = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'public'
    }
  }
);
```

### Pentru Operațiuni de Plăți
```javascript
// Pentru datele de plăți (abonamente, comenzi, etc.)
const supabasePayments = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'payments'
    }
  }
);
```

## RLS Policies

### Schema `public`
- Utilizatorii pot accesa propriile date
- Service role are acces complet
- Politici granulare pentru fiecare tabel

### Schema `payments`
- **subscription_tiers**: Citire pentru toți, modificare doar service role
- **subscriptions**: Utilizatorii văd doar propriile abonamente
- **payment_methods**: Utilizatorii văd doar propriile metode de plată
- **orders**: Utilizatorii văd doar propriile comenzi
- **refunds**: Utilizatorii văd doar rambursările pentru propriile comenzi
- **payment_logs**: Doar service role
- **webhook_processing**: Doar service role

## Funcții SQL

Toate funcțiile legate de plăți au fost mutate în schema `payments`:

- `payments.activate_subscription()`
- `payments.cancel_subscription()`
- `payments.process_webhook_idempotent()`

## Indexuri Optimizate

### Schema `payments`
- **subscription_tiers**: name, is_active, interval
- **subscriptions**: user_id, tier_id, status, netopia_order_id, current_period_end, trial_end
- **payment_methods**: user_id, netopia_token, is_default
- **orders**: user_id, subscription_id, netopia_order_id, status, created_at
- **refunds**: order_id, netopia_refund_id, status
- **payment_logs**: order_id, subscription_id, event_type, netopia_order_id, created_at
- **webhook_processing**: netopia_order_id, event_type, status

## Migrarea Datelor

Migrația a fost realizată cu:
1. **Copierea datelor** din schema `public` în schema `payments`
2. **Crearea view-urilor** pentru backward compatibility
3. **Actualizarea referințelor** din tabela `profiles`
4. **Cleanup-ul tabelelor** vechi din schema `public`

## Verificarea Migrației

Pentru a verifica că migrația a fost realizată cu succes:

```sql
-- Rulează scriptul de verificare
\i scripts/verify_payments_schema_migration.sql
```

## Impactul asupra Codului

### Codul Existent
- **Nu necesită modificări** datorită view-urilor de backward compatibility
- **Toate query-urile** continuă să funcționeze normal
- **Performance** poate fi îmbunătățită prin indexurile optimizate

### Codul Nou
- **Folosește schema `payments`** direct pentru operațiunile de plăți
- **Beneficiază de securitatea** îmbunătățită
- **Poate folosi funcțiile** din schema `payments`

## Monitorizare și Alerting

### Metriici Separate
- **Business metrics**: Vizualizări, utilizatori, știri
- **Payment metrics**: Abonamente, plăți, conversii

### Log-uri Separate
- **Business logs**: Acces la știri, căutări, utilizare API
- **Payment logs**: Plăți, webhook-uri, erori de plată

## Backup și Recovery

### Strategii Separate
- **Business data**: Backup zilnic, retention 1 an
- **Payment data**: Backup zilnic, retention 7 ani (compliance)

### Puncte de Restore
- **Business data**: Poate fi restaurat independent
- **Payment data**: Restaurat cu atenție la consistența datelor

## Securitate și Compliance

### PCI DSS
- Datele de plăți sunt izolate în schema `payments`
- Accesul este restricționat prin RLS
- Audit trail complet pentru toate operațiunile

### GDPR
- **Right to be forgotten**: Implementat separat pentru fiecare schemă
- **Data portability**: Export separat pentru datele financiare
- **Consent management**: Gestionat independent

## Viitorul Arhitecturii

### Microservicii
Schema `payments` poate deveni un microserviciu separat:
- **Payments Service**: Gestionarea abonamentelor și plăților
- **Business Service**: Gestionarea știrilor și utilizatorilor

### Scaling
- **Database sharding**: Posibil pe baza schemelor
- **Caching**: Strategii separate pentru fiecare domeniu
- **CDN**: Pentru conținut vs. API-uri de plăți

## Concluzie

Separarea în schema `payments` oferă:
- ✅ **Securitate îmbunătățită**
- ✅ **Scalabilitate mai bună**
- ✅ **Mentenanță mai ușoară**
- ✅ **Compliance îmbunătățit**
- ✅ **Backward compatibility**
- ✅ **Pregătire pentru viitor**

Această arhitectură pregătește aplicația pentru creșterea viitoare și asigură o separare clară între datele de business și cele financiare.
