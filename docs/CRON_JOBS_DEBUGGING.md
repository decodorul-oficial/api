# 🔧 Cron Jobs Debugging Guide

## 📊 Interpretarea Metadatelor de Execuție

Când un cron job rulează, metadatele sunt salvate în tabelul `cron_jobs.job_logs` și `cron_jobs.job_status`. Acestea conțin informații detaliate despre execuție pentru debugging.

### ✅ Execuție Reușită

Pentru job-uri care rulează cu succes, metadatele vor conține:

```json
{
  "duration": 202,
  "timestamp": "2025-10-02T13:10:01.774Z",
  "success": true,
  "jobName": "full_cleanup",
  "execution": {
    "status": "completed",
    "message": "Job executed successfully"
  },
  "results": {
    "cleanupCount": 0,
    "subscriptionsCount": 5,
    "trialSubscriptionsCount": 2,
    "failedPaymentsCount": 1,
    "monitoredJobsCount": 5
  }
}
```

### ❌ Execuție Eșuată

Pentru job-uri care eșuează, metadatele vor conține:

```json
{
  "duration": 150,
  "timestamp": "2025-10-02T13:10:01.774Z",
  "success": false,
  "jobName": "recurring_billing",
  "execution": {
    "status": "failed",
    "message": "Job execution failed"
  },
  "error": {
    "message": "relation 'subscriptions' does not exist",
    "name": "PostgresError",
    "stack": "PostgresError: relation 'subscriptions' does not exist\n    at ...",
    "timestamp": "2025-10-02T13:10:01.774Z"
  }
}
```

## 🔍 Cum să Verifici Statusul Job-urilor

### 1. Verifică Statusul General
```sql
SELECT job_name, status, is_enabled, last_run, last_run_duration, last_run_error
FROM cron_jobs.job_status
ORDER BY updated_at DESC;
```

### 2. Verifică Log-urile Recente
```sql
SELECT job_name, start_time, end_time, status, duration, error, metadata
FROM cron_jobs.job_logs
WHERE job_name = 'full_cleanup'
ORDER BY created_at DESC
LIMIT 5;
```

### 3. Verifică Job-urile Eșuate
```sql
SELECT job_name, start_time, end_time, status, duration, error, metadata
FROM cron_jobs.job_logs
WHERE status = 'FAILED'
ORDER BY created_at DESC;
```

## 🚨 Probleme Comune și Soluții

### Job Rămas în Status "RUNNING"
**Symptom:** Job-ul rămâne în status "RUNNING" și nu se actualizează.

**Cauze posibile:**
- Eroare în execuția job-ului care nu este gestionată corect
- Timeout în execuția job-ului
- Problema de conectivitate la baza de date

**Soluție:**
```sql
-- Marchează manual job-ul ca completat
SELECT cron_complete_job('job_name', 'IDLE', '{"manual_fix": true}'::jsonb);
```

### Job Eșuează Repetat
**Symptom:** Job-ul eșuează în mod repetat cu aceeași eroare.

**Verifică:**
1. Metadatele pentru detalii despre eroare
2. Stack trace-ul pentru locația exactă a erorii
3. Log-urile de aplicație pentru context suplimentar

### Job Nu Rulează deloc
**Symptom:** Job-ul nu se execută deloc.

**Verifică:**
1. `is_enabled = true` în `cron_jobs.job_status`
2. Configurația Vercel cron jobs
3. Log-urile Vercel pentru erori de deployment

## 📈 Metrici de Performanță

### Durata Execuției
- **< 1 secundă:** Excelent
- **1-5 secunde:** Bun
- **5-30 secunde:** Acceptabil
- **> 30 secunde:** Investighează optimizări

### Rata de Succes
- **> 95%:** Excelent
- **90-95%:** Bun
- **< 90%:** Investighează problemele

### Verifică Metrici
```sql
SELECT 
  job_name,
  total_runs,
  successful_runs,
  failed_runs,
  ROUND((successful_runs::float / total_runs * 100), 2) as success_rate,
  ROUND(average_runtime::float / 1000, 2) as avg_runtime_seconds
FROM cron_jobs.job_status
WHERE total_runs > 0
ORDER BY success_rate ASC;
```

## 🛠️ Debugging Avansat

### 1. Verifică Erorile Specifice
```sql
SELECT 
  job_name,
  error,
  metadata->'error'->>'message' as error_message,
  metadata->'error'->>'name' as error_type,
  start_time
FROM cron_jobs.job_logs
WHERE status = 'FAILED'
ORDER BY start_time DESC;
```

### 2. Analizează Pattern-urile de Erori
```sql
SELECT 
  metadata->'error'->>'name' as error_type,
  COUNT(*) as error_count,
  MAX(start_time) as last_occurrence
FROM cron_jobs.job_logs
WHERE status = 'FAILED'
GROUP BY error_type
ORDER BY error_count DESC;
```

### 3. Verifică Performanța pe Timp
```sql
SELECT 
  DATE(start_time) as execution_date,
  job_name,
  COUNT(*) as executions,
  AVG(duration) as avg_duration,
  COUNT(CASE WHEN status = 'IDLE' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
FROM cron_jobs.job_logs
WHERE start_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(start_time), job_name
ORDER BY execution_date DESC, job_name;
```

## 🔧 Comenzi Utile pentru Administrator

### Resetează Job-ul
```sql
-- Resetează job-ul la status IDLE
UPDATE cron_jobs.job_status 
SET status = 'IDLE', last_run_error = NULL, updated_at = NOW()
WHERE job_name = 'job_name';
```

### Curăță Log-urile Vechi
```sql
-- Șterge log-urile mai vechi de 30 de zile
SELECT cron_clean_logs(p_older_than := (NOW() - INTERVAL '30 days')::timestamptz);
```

### Verifică Configurația Job-urilor
```sql
-- Verifică toate job-urile și statusul lor
SELECT 
  job_name,
  status,
  is_enabled,
  last_run,
  next_run,
  total_runs,
  successful_runs,
  failed_runs
FROM cron_jobs.job_status
ORDER BY job_name;
```
