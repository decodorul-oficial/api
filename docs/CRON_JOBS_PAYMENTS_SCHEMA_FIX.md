# 🔧 Cron Jobs Payments Schema Fix

## 📋 Problemă Identificată

Cron job-urile care gestionează plățile și abonamentele se uitau la tabelele din schema `public` în loc de schema `payments`, unde sunt de fapt stocate toate datele de plăți.

## 🎯 Tabelele Afectate

Toate tabelele de plăți au fost mutate în schema `payments` prin migration `052_move_payment_tables_to_payments_schema.sql`:

- `payments.subscriptions` (în loc de `public.subscriptions`)
- `payments.subscription_tiers` (în loc de `public.subscription_tiers`)
- `payments.payment_logs` (în loc de `public.payment_logs`)
- `payments.orders`
- `payments.payment_methods`
- `payments.refunds`
- `payments.webhook_processing`

## ✅ Modificări Făcute

### 1. **Cron Handlers în `api/src/api/cron/index.js`**

**`recurringBillingHandler`:**
```javascript
// ÎNAINTE
.from('subscriptions')
.select(`
  *,
  subscription_tiers!inner(*)
`)

// DUPĂ
.from('payments.subscriptions')
.select(`
  *,
  subscription_tiers:payments.subscription_tiers!inner(*)
`)
```

**`trialProcessingHandler`:**
```javascript
// ÎNAINTE
.from('subscriptions')
.select(`
  *,
  subscription_tiers!inner(*)
`)

// DUPĂ
.from('payments.subscriptions')
.select(`
  *,
  subscription_tiers:payments.subscription_tiers!inner(*)
`)
```

**`paymentRetriesHandler`:**
```javascript
// ÎNAINTE
.from('payment_logs')

// DUPĂ
.from('payments.payment_logs')
```

### 2. **GraphQL Resolver în `api/src/api/resolvers/cronJobResolvers.js`**

Toate cazurile din `runCronJob` mutation au fost actualizate:

- `recurring_billing` → `payments.subscriptions`
- `trial_processing` → `payments.subscriptions`
- `payment_retries` → `payments.payment_logs`

## 🔍 Impact

### ✅ **Beneficii**
- Cron job-urile acum accesează datele corecte din schema `payments`
- Nu mai există erori de "table not found"
- Datele de plăți sunt gestionate centralizat

### ⚠️ **Atenție**
- Alte servicii (`SubscriptionService`, `UserService`) încă folosesc schema `public`
- Acestea ar trebui actualizate separat pentru consistență

## 🧪 Testare

### 1. **Testează Cron Job-urile**
```bash
# Rulează manual un job
curl -X POST https://your-api.vercel.app/api/src/api/cron/recurring-billing \
  -H "Authorization: Bearer YOUR_VERCEL_CRON_KEY"
```

### 2. **Verifică în Baza de Date**
```sql
-- Verifică că job-urile accesează datele corecte
SELECT 
  job_name,
  status,
  last_run,
  metadata->'results' as results
FROM cron_jobs.job_status
WHERE job_name IN ('recurring_billing', 'trial_processing', 'payment_retries');
```

### 3. **Verifică Log-urile**
```sql
-- Verifică log-urile pentru erori
SELECT 
  job_name,
  start_time,
  status,
  error,
  metadata
FROM cron_jobs.job_logs
WHERE job_name IN ('recurring_billing', 'trial_processing', 'payment_retries')
ORDER BY created_at DESC
LIMIT 10;
```

## 📊 Monitorizare

### 1. **Metrici de Succes**
- Job-urile nu mai arată erori de "table not found"
- `subscriptionsCount`, `trialSubscriptionsCount`, `failedPaymentsCount` sunt > 0
- Log-urile arată execuții reușite

### 2. **Alerting**
- Monitorizează erorile de conectare la baza de date
- Verifică că job-urile găsesc datele corecte
- Urmărește performanța job-urilor

## 🔄 Următorii Pași

### 1. **Actualizează Alte Servicii**
```javascript
// SubscriptionService.js
.from('subscription_tiers') → .from('payments.subscription_tiers')
.from('subscriptions') → .from('payments.subscriptions')
.from('payment_logs') → .from('payments.payment_logs')
```

### 2. **Actualizează Resolver-ele GraphQL**
```javascript
// resolvers.js
.from('subscriptions') → .from('payments.subscriptions')
```

### 3. **Testează Complet**
- Testează toate funcționalitățile de plăți
- Verifică că datele sunt accesate corect
- Monitorizează performanța

## 📝 Note Importante

1. **Schema `payments`** este expusă API-ului prin RLS policies
2. **Service role key** are acces complet la schema `payments`
3. **Cron job-urile** folosesc service role key pentru acces
4. **Datele** sunt migrate automat prin migration-uri

## 🚨 Troubleshooting

### Job Nu Găsește Date
```sql
-- Verifică că există date în schema payments
SELECT COUNT(*) FROM payments.subscriptions;
SELECT COUNT(*) FROM payments.subscription_tiers;
SELECT COUNT(*) FROM payments.payment_logs;
```

### Erori de Permisiuni
```sql
-- Verifică permisiunile pentru service role
SELECT * FROM information_schema.table_privileges 
WHERE grantee = 'service_role' 
AND table_schema = 'payments';
```

### Date Duplicate
```sql
-- Verifică dacă există date în ambele scheme
SELECT 'public' as schema, COUNT(*) as count FROM public.subscriptions
UNION ALL
SELECT 'payments' as schema, COUNT(*) as count FROM payments.subscriptions;
```
