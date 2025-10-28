# Cron Jobs Management Setup

## Overview

Sistemul de management al cron job-urilor pentru subscripții permite monitorizarea și controlul job-urilor de pe Vercel prin GraphQL API.

## Componente Implementate

### 1. Vercel Cron Jobs (`vercel.json`)

**ACTIVE CRON JOBS (Hobby Plan - max 2 allowed):**
- **recurring_billing**: Rulează zilnic la 3:00 AM (`0 3 * * *`)
- **trial_processing**: Rulează zilnic la 4:00 AM (`0 4 * * *`)

**DISABLED CRON JOBS (waiting for Pro plan upgrade):**
- **full_cleanup**: Rulează zilnic la 2:00 AM (`0 2 * * *`) - DISABLED
- **payment_retries**: Rulează zilnic la 5:00 AM (`0 5 * * *`) - DISABLED  
- **monitoring**: Rulează zilnic la 6:00 AM (`0 6 * * *`) - DISABLED

> **Note**: Vercel Hobby plan permite maxim 2 cron job-uri active. Pentru a activa toate job-urile, upgrade la Pro plan.

### 2. Database Schema (`cron_jobs`)

#### Tabele:
- **job_status**: Status-ul curent al fiecărui cron job
- **job_logs**: Istoric complet al execuțiilor

#### Funcții PostgreSQL:
- `get_all_cron_job_statuses()`: Returnează toate statusurile
- `get_cron_job_status(job_name)`: Returnează statusul unui job specific
- `get_cron_job_logs(...)`: Returnează log-urile cu filtrare

### 3. GraphQL API

#### Queries:
```graphql
# Obține statusul tuturor cron job-urilor
getAllCronJobsStatus: [CronJobStatus!]!

# Obține statusul unui cron job specific
getCronJobStatus(jobName: String!): CronJobStatus!

# Obține log-urile cron job-urilor
getCronJobLogs(
  jobName: String
  startDate: String
  endDate: String
  status: CronJobStatusType
  limit: Int
  offset: Int
): [CronJobLog!]!
```

#### Mutations:
```graphql
# Rulează manual un cron job
runCronJob(jobName: String!): CronJobStatus!

# Activează un cron job
enableCronJob(jobName: String!): CronJobStatus!

# Dezactivează un cron job
disableCronJob(jobName: String!): CronJobStatus!

# Șterge log-urile
clearCronJobLogs(
  jobName: String
  olderThan: String
  status: CronJobStatusType
): Boolean!
```

## Exemple de Utilizare

### 1. Listarea tuturor cron job-urilor

```graphql
query GetAllCronJobsStatus {
  getAllCronJobsStatus {
    jobName
    status
    lastRun
    nextRun
    lastRunDuration
    lastRunError
    metrics {
      totalRuns
      successfulRuns
      failedRuns
      averageRuntime
    }
  }
}
```

### 2. Obținerea statusului unui job specific

```graphql
query GetCronJobStatus($jobName: String!) {
  getCronJobStatus(jobName: $jobName) {
    jobName
    status
    lastRun
    nextRun
    metrics {
      totalRuns
      successfulRuns
      failedRuns
      averageRuntime
    }
  }
}
```

**Variables:**
```json
{
  "jobName": "payment_retries"
}
```

### 3. Obținerea log-urilor

```graphql
query GetCronJobLogs($jobName: String, $limit: Int, $offset: Int) {
  getCronJobLogs(jobName: $jobName, limit: $limit, offset: $offset) {
    id
    jobName
    startTime
    endTime
    status
    duration
    error
    metadata
  }
}
```

**Variables:**
```json
{
  "jobName": "payment_retries",
  "limit": 20,
  "offset": 0
}
```

### 4. Dezactivarea unui cron job

```graphql
mutation DisableCronJob($jobName: String!) {
  disableCronJob(jobName: $jobName) {
    jobName
    status
  }
}
```

**Variables:**
```json
{
  "jobName": "full_cleanup"
}
```

### 5. Rularea manuală a unui cron job

```graphql
mutation RunCronJob($jobName: String!) {
  runCronJob(jobName: $jobName) {
    jobName
    status
    lastRun
    metrics {
      totalRuns
      successfulRuns
      failedRuns
    }
  }
}
```

**Variables:**
```json
{
  "jobName": "payment_retries"
}
```

## Configurare

### Variabile de Mediu Necesare

Asigură-te că următoarele variabile sunt configurate în Vercel:

```env
# Supabase
SUPABASE_URL=https://kwgfkcxlgxikmzdpxulp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Vercel Cron
VERCEL_CRON_KEY=your_cron_key

# API
API_BASE_URL=https://your-api.vercel.app
INTERNAL_API_KEY=your_internal_api_key

# Database (pentru subscription_cron.py)
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Netopia (pentru plăți)
NETOPIA_API_KEY=your_netopia_api_key
NETOPIA_SECRET_KEY=your_netopia_secret_key
NETOPIA_BASE_URL=https://secure.mobilpay.ro

# Configurații cron job
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_SECONDS=300
TRIAL_GRACE_PERIOD_HOURS=24
```

### Aplicarea Migrărilor

Migrările au fost deja aplicate:
- `create_cron_job_management_schema`: Schema `cron_jobs` cu tabele și funcții
- `create_cron_job_access_functions`: Funcții RPC pentru acces la date

## Securitate

### Autentificare Admin

**IMPORTANT**: În momentul de față, verificarea admin este dezactivată pentru testare.

Pentru producție, trebuie să re-activezi verificarea în `cronJobResolvers.js`:

```javascript
// Înlocuiește:
// await verifyAdminAccess(context);

// Cu:
await verifyAdminAccess(context);
```

### Verificarea Admin

Funcția `verifyAdminAccess` verifică:
1. Dacă utilizatorul este autentificat (`context.user`)
2. Dacă utilizatorul are `isAdmin: true` în `raw_user_meta_data`

### Setarea unui Utilizator ca Admin

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{isAdmin}',
  'true'::jsonb
)
WHERE email = 'admin@example.com';
```

## Monitorizare

### Metrici Disponibile

Pentru fiecare cron job, sistemul tracked:
- Total execuții
- Execuții reușite
- Execuții eșuate
- Timpul mediu de execuție
- Ultima execuție (start, end, duration)
- Următoarea execuție programată

### Structura Log-urilor

Fiecare execuție este înregistrată cu:
- Timpul de start și end
- Status-ul execuției (IDLE, RUNNING, FAILED, DISABLED)
- Durata în milisecunde
- Mesajul de eroare (dacă există)
- Metadata suplimentară (JSON)

## Endpoint-uri REST pentru Admin

Pentru management-ul direct al cron job-urilor, există și endpoint-uri REST:

### 1. Obținerea statusului tuturor job-urilor
```
GET https://your-api.vercel.app/api/cron/admin/status
Authorization: Bearer <jwt_token>
```

### 2. Obținerea statusului unui job specific
```
GET https://your-api.vercel.app/api/cron/admin/status?jobName=payment_retries
Authorization: Bearer <jwt_token>
```

### 3. Obținerea log-urilor
```
GET https://your-api.vercel.app/api/cron/admin/logs?jobName=payment_retries&limit=20&offset=0
Authorization: Bearer <jwt_token>
```

### 4. Rularea manuală a unui job
```
POST https://your-api.vercel.app/api/cron/admin/run
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "jobName": "payment_retries"
}
```

### 5. Activarea/Dezactivarea unui job
```
POST https://your-api.vercel.app/api/cron/admin/toggle
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "jobName": "payment_retries",
  "enabled": false
}
```

### 6. Ștergerea log-urilor
```
POST https://your-api.vercel.app/api/cron/admin/clear-logs
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "jobName": "payment_retries",
  "olderThan": "2024-01-01T00:00:00Z"
}
```

## Integrare cu Aplicația Web

### Endpoint-uri GraphQL

Toate endpoint-urile sunt disponibile la:
```
POST https://your-api.vercel.app/graphql
```

### Headers Necesare

Pentru queries și mutations autentificate:
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Exemple de Integrare

```javascript
// Fetch all cron jobs status
const response = await fetch('https://your-api.vercel.app/graphql', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `
      query GetAllCronJobsStatus {
        getAllCronJobsStatus {
          jobName
          status
          lastRun
          nextRun
          metrics {
            totalRuns
            successfulRuns
            failedRuns
            averageRuntime
          }
        }
      }
    `
  })
});

const { data } = await response.json();
console.log('Cron jobs:', data.getAllCronJobsStatus);
```

## Troubleshooting

### Job-ul nu rulează

1. Verifică status-ul job-ului cu `getCronJobStatus`
2. Verifică dacă job-ul este activat (`is_enabled = true`)
3. Verifică log-urile cu `getCronJobLogs`
4. Verifică variabilele de mediu în Vercel

### Erori de Autentificare

1. Verifică dacă utilizatorul are rolul de admin
2. Verifică JWT token-ul
3. Verifică configurația `SUPABASE_SERVICE_ROLE_KEY`

### Erori în Execuție

1. Verifică log-urile cu `getCronJobLogs`
2. Verifică variabilele de mediu pentru cron job-uri
3. Verifică log-urile Vercel

## Next Steps

1. **Re-activează Autentificarea Admin**: Odată ce ai configurat utilizatorii admin
2. **Configurează Alertele**: Pentru failure-uri repetate
3. **Adaugă Monitoring**: Integrare cu servicii externe (Sentry, DataDog, etc.)
4. **Backup Log-urilor**: Arhivare periodică a log-urilor vechi
5. **Dashboard Web**: Interfață grafică pentru monitorizare

## Suport

Pentru întrebări sau probleme:
- Verifică documentația Vercel Cron Jobs
- Verifică documentația Supabase
- Verifică log-urile din baza de date



## Radu Comment

Pentru a activa restul de cron jobs in vercel.json adauga :
`{
  "path": "/api/src/api/cron/payment-retries",
  "schedule": "0 5 * * *"
},
{
  "path": "/api/src/api/cron/full-cleanup", 
  "schedule": "0 2 * * *"
},
{
  "path": "/api/src/api/cron/monitoring",
  "schedule": "0 6 * * *"
}`