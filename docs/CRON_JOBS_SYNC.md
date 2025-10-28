# 🔄 Cron Jobs Synchronization Guide

## 📋 Overview

Acum toate cron job-urile sunt sincronizate automat între Vercel și baza de date Supabase. Fiecare job se actualizează automat cu următoarea execuție programată.

## 🏗️ Arhitectura Sincronizării

### 1. **Vercel Configuration (`vercel.json`)**
```json
{
  "crons": [
    {
      "path": "/api/src/api/cron/full-cleanup",
      "schedule": "0 2 * * *"  // Daily at 2 AM
    },
    {
      "path": "/api/src/api/cron/monitoring", 
      "schedule": "*/15 * * * *"  // Every 15 minutes
    }
  ]
}
```

### 2. **Database Synchronization**
Fiecare cron handler sincronizează automat cu `cron_jobs.job_status`:

```javascript
// Calculate next run time
const nextRun = calculateNextRun();

// Sync with database
await supabase
  .from('cron_jobs.job_status')
  .upsert({
    job_name: 'job_name',
    next_run: nextRun,
    status: 'IDLE',
    is_enabled: true,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'job_name'
  });
```

## ⏰ Schedule Mapping

| Job Name | Vercel Schedule | Database Next Run | Description | Status |
|----------|----------------|-------------------|-------------|--------|
| `recurring_billing` | `0 3 * * *` | Daily at 3:00 AM | Procesează facturarea | ✅ ACTIVE |
| `trial_processing` | `0 4 * * *` | Daily at 4:00 AM | Procesează trial-uri | ✅ ACTIVE |
| `full_cleanup` | `0 2 * * *` | Daily at 2:00 AM | Curăță log-uri vechi | ❌ DISABLED |
| `payment_retries` | `0 5 * * *` | Daily at 5:00 AM | Reîncearcă plăți | ❌ DISABLED |
| `monitoring` | `0 6 * * *` | Daily at 6:00 AM | Monitorizează sistemul | ❌ DISABLED |

> **Note**: Doar 2 cron job-uri sunt active din cauza limitărilor planului Vercel Hobby. Pentru a activa toate job-urile, upgrade la Pro plan.

## 🔄 Fluxul de Sincronizare

### 1. **Vercel Execută Job-ul**
- Vercel face HTTP request la endpoint-ul cron
- Headers: `x-vercel-cron` pentru autentificare

### 2. **Handler Sincronizează**
- Calculează următoarea execuție
- Actualizează `cron_jobs.job_status`
- Loghează sincronizarea

### 3. **Execută Logica Job-ului**
- Rulează handler-ul specific
- Actualizează statusul în baza de date
- Loghează rezultatul

## 📊 Beneficii

### ✅ **Sincronizare Automată**
- Nu mai trebuie să configurezi manual job-urile în baza de date
- Următoarea execuție se calculează automat
- Statusul se actualizează în timp real

### ✅ **Vizibilitate Completă**
- Poți vedea toate job-urile în Vercel Dashboard
- Statusul și metricile în baza de date
- Log-uri detaliate pentru debugging

### ✅ **Gestionare Centralizată**
- Un singur loc pentru configurarea job-urilor (`vercel.json`)
- Baza de date pentru status și metrici
- GraphQL API pentru management

## 🛠️ Cum să Verifici Sincronizarea

### 1. **Verifică în Vercel Dashboard**
- Functions → Cron Jobs
- Vezi job-urile active
- Status: Active/Inactive

### 2. **Verifică în Baza de Date**
```sql
-- Verifică toate job-urile și următoarea execuție
SELECT 
  job_name,
  status,
  is_enabled,
  last_run,
  next_run,
  total_runs
FROM cron_jobs.job_status
ORDER BY next_run;
```

### 3. **Verifică Log-urile**
```sql
-- Verifică log-urile recente
SELECT 
  job_name,
  start_time,
  end_time,
  status,
  duration
FROM cron_jobs.job_logs
ORDER BY created_at DESC
LIMIT 10;
```

## 🔧 Troubleshooting

### Job Nu Se Sincronizează
1. **Verifică Environment Variables:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Verifică Log-urile Vercel:**
   - Functions → Logs
   - Caută erori de sincronizare

3. **Verifică Permisiunile:**
   - Service role key are acces la `cron_jobs` schema

### Job Rămâne în Status "RUNNING"
1. **Verifică Handler-ul:**
   - Logica job-ului nu se completează
   - Erori în execuție

2. **Resetează Manual:**
   ```sql
   UPDATE cron_jobs.job_status 
   SET status = 'IDLE', last_run_error = NULL
   WHERE job_name = 'job_name';
   ```

### Next Run Nu Se Actualizează
1. **Verifică Calculul:**
   - Funcția `calculateNextRun()` pentru job-ul specific
   - Timezone-ul serverului

2. **Forțează Sincronizarea:**
   - Rulează manual job-ul din Vercel Dashboard
   - Sau folosește GraphQL mutation `runCronJob`

## 📈 Monitoring și Alerting

### 1. **Metrici Importante**
- **Success Rate:** `successful_runs / total_runs`
- **Average Runtime:** `average_runtime`
- **Last Run:** `last_run`
- **Next Run:** `next_run`

### 2. **Alerting Rules**
- Job eșuat de 3 ori consecutiv
- Runtime > 5 minute
- Job nu s-a executat în ultimele 24h

### 3. **Dashboard Queries**
```sql
-- Job-uri cu probleme
SELECT job_name, status, last_run, last_run_error
FROM cron_jobs.job_status
WHERE status = 'FAILED' 
   OR (last_run < NOW() - INTERVAL '1 day' AND is_enabled = true);

-- Metrici de performanță
SELECT 
  job_name,
  total_runs,
  successful_runs,
  ROUND((successful_runs::float / total_runs * 100), 2) as success_rate,
  ROUND(average_runtime::float / 1000, 2) as avg_runtime_seconds
FROM cron_jobs.job_status
WHERE total_runs > 0
ORDER BY success_rate ASC;
```

## 🚀 Deployment

### 1. **Deploy pe Vercel**
```bash
vercel --prod
```

### 2. **Verifică Configurația**
- Vercel Dashboard → Functions → Cron Jobs
- Toate job-urile sunt active

### 3. **Testează Sincronizarea**
- Rulează manual un job
- Verifică în baza de date că `next_run` s-a actualizat

## 📝 Best Practices

### 1. **Environment Variables**
- Folosește `VERCEL_CRON_KEY` pentru securitate
- Nu expune `SUPABASE_SERVICE_ROLE_KEY` în frontend

### 2. **Error Handling**
- Toate job-urile gestionează erorile
- Loghează erorile în metadate
- Nu lăsa job-urile blocate

### 3. **Performance**
- Job-urile ar trebui să ruleze < 5 minute
- Folosește `is_enabled` pentru a dezactiva job-urile
- Curăță log-urile vechi regulat

### 4. **Monitoring**
- Verifică regulat statusul job-urilor
- Configurează alerting pentru job-urile critice
- Monitorizează metricile de performanță
