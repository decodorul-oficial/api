# Sistemul de Notificări Email pentru Căutări Salvate

## Prezentare Generală

Sistemul de notificări email permite utilizatorilor cu abonament Pro sau Enterprise să primească notificări automate prin email când sunt publicate articole noi care se potrivesc cu criteriile căutărilor lor salvate.

## Caracteristici Principale

### ✅ Funcționalități Disponibile
- **Notificări automate**: Utilizatorii primesc emailuri când apar articole noi relevante
- **Limite bazate pe abonament**: Pro (5 notificări), Enterprise (20 notificări)
- **Șabloane personalizabile**: Administratorii pot gestiona conținutul emailurilor
- **Tracking complet**: Loguri detaliate pentru toate notificările trimise
- **Protecție împotriva duplicatelor**: Fiecare articol este notificat doar o dată per căutare
- **Integrare cu sistemul existent**: Folosește infrastructura de email existentă

### ❌ Restricții
- **Doar pentru abonamente Pro/Enterprise**: Utilizatorii Free nu pot activa notificări
- **Limite de notificări**: Respectă limitele definite în abonament
- **Doar pentru căutări salvate**: Nu se pot activa notificări pentru căutări temporare

## Arhitectura Implementării

### 1. Schema Bazei de Date

#### Tabela `payments.email_templates`
```sql
CREATE TABLE payments.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

#### Coloana `max_email_notifications` în `payments.subscription_tiers`
```sql
ALTER TABLE payments.subscription_tiers 
ADD COLUMN max_email_notifications INTEGER DEFAULT 0;
```

#### Coloana `email_notifications_enabled` în `saved_searches`
```sql
ALTER TABLE saved_searches 
ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT FALSE;
```

#### Tabela `payments.email_notification_logs`
```sql
CREATE TABLE payments.email_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    saved_search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    article_id UUID NOT NULL,
    template_id UUID NOT NULL REFERENCES payments.email_templates(id),
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### 2. Tipuri GraphQL

```graphql
type SavedSearch {
  id: ID!
  name: String!
  description: String
  searchParams: JSON!
  isFavorite: Boolean!
  emailNotificationsEnabled: Boolean!
  createdAt: String!
  updatedAt: String!
}

type EmailTemplate {
  id: ID!
  templateName: String!
  subject: String!
  bodyHtml: String!
  createdAt: String!
  updatedAt: String!
}

type EmailNotificationInfo {
  limit: Int!
  currentCount: Int!
  canEnableMore: Boolean!
  remaining: Int!
}

type EmailNotificationStats {
  totalNotifications: Int!
  totalSent: Int!
  totalFailed: Int!
  successRate: Float!
}
```

### 3. Input Types

```graphql
input CreateEmailTemplateInput {
  templateName: String!
  subject: String!
  bodyHtml: String!
}

input UpdateEmailTemplateInput {
  templateName: String
  subject: String
  bodyHtml: String
}
```

## API Endpoints

### Queries

#### `getEmailNotificationInfo`
Obține informații despre notificările email pentru utilizatorul curent.

```graphql
query GetEmailNotificationInfo {
  getEmailNotificationInfo {
    limit
    currentCount
    canEnableMore
    remaining
  }
}
```

#### `getEmailTemplates` (Admin)
Obține toate șabloanele de email.

```graphql
query GetEmailTemplates {
  getEmailTemplates {
    id
    templateName
    subject
    bodyHtml
    createdAt
    updatedAt
  }
}
```

#### `getEmailNotificationStats`
Obține statistici despre notificările trimise.

```graphql
query GetEmailNotificationStats {
  getEmailNotificationStats(daysBack: 7) {
    totalNotifications
    totalSent
    totalFailed
    successRate
  }
}
```

### Mutations

#### `toggleEmailNotifications`
Activează/dezactivează notificările email pentru o căutare salvată.

```graphql
mutation ToggleEmailNotifications {
  toggleEmailNotifications(
    id: "search-id-here"
    enabled: true
  ) {
    id
    name
    emailNotificationsEnabled
    updatedAt
  }
}
```

#### `createEmailTemplate` (Admin)
Creează un nou șablon de email.

```graphql
mutation CreateEmailTemplate {
  createEmailTemplate(input: {
    templateName: "weekly_digest"
    subject: "Săptămâna în știri: {weekPeriod}"
    bodyHtml: "<html>...</html>"
  }) {
    id
    templateName
    subject
    createdAt
  }
}
```

## Șabloane de Email

### Variabile Disponibile

Pentru șablonul `new_article_notification`, următoarele variabile sunt disponibile:

- `{userName}` - Numele utilizatorului
- `{searchName}` - Numele căutării salvate
- `{searchDescription}` - Descrierea căutării salvate
- `{articleTitle}` - Titlul articolului
- `{articlePublicationDate}` - Data publicării articolului
- `{articleAuthor}` - Autorul articolului
- `{articleExcerpt}` - Un excerpt din articol
- `{articleLink}` - Link-ul către articol

### Exemplu de Șablon

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Nouă știre</title>
</head>
<body>
    <h1>Monitorul Oficial</h1>
    <p>Salut {userName}!</p>
    
    <h2>{articleTitle}</h2>
    <p>Data publicării: {articlePublicationDate}</p>
    <p>Autor: {articleAuthor}</p>
    
    <div>{articleExcerpt}</div>
    
    <a href="{articleLink}">Citește articolul complet</a>
    
    <p>Acest email a fost trimis automat pe baza căutării tale salvate "{searchName}".</p>
</body>
</html>
```

## Procesarea Notificărilor

### Script de Procesare

Un script cron (`scripts/process-email-notifications.js`) poate fi folosit pentru a procesa notificările periodic:

```bash
# Rulare manuală
node scripts/process-email-notifications.js

# Cu variabile de mediu
NOTIFICATION_HOURS_BACK=24 \
NOTIFICATION_BATCH_SIZE=50 \
NOTIFICATION_DRY_RUN=false \
node scripts/process-email-notifications.js
```

### Configurare Cron Job

```bash
# Procesează notificările la fiecare 2 ore
0 */2 * * * cd /path/to/api && node scripts/process-email-notifications.js

# Procesează notificările zilnic la 8:00
0 8 * * * cd /path/to/api && node scripts/process-email-notifications.js
```

## Limite și Restricții

### Limite de Abonament

| Abonament | Limita de Notificări |
|-----------|---------------------|
| Free | 0 |
| Pro | 5 |
| Enterprise | 20 |

### Validări

- Utilizatorii trebuie să aibă abonament activ (Pro/Enterprise)
- Limitele de notificări sunt respectate strict
- Fiecare articol este notificat doar o dată per căutare
- Șabloanele de email sunt validate pentru variabile corecte

## Integrare cu Servicii de Email

### Configurare SendGrid

```javascript
// În NewsletterRepository.js
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: emailData.to,
  from: emailData.from,
  subject: emailData.subject,
  html: emailData.html,
};

await sgMail.send(msg);
```

### Configurare Mailgun

```javascript
// În NewsletterRepository.js
const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN
});

const data = {
  from: emailData.from,
  to: emailData.to,
  subject: emailData.subject,
  html: emailData.html
};

await mailgun.messages().send(data);
```

## Monitorizare și Loguri

### Loguri de Notificări

Toate notificările sunt logate în tabela `payments.email_notification_logs` cu următoarele informații:

- ID-ul utilizatorului
- ID-ul căutării salvate
- ID-ul articolului
- ID-ul șablonului folosit
- Statusul trimiterii (succes/eșec)
- Data și ora trimiterii
- Mesajul de eroare (dacă aplicabil)

### Statistici

Sistemul oferă statistici detaliate:

- Numărul total de notificări
- Numărul de notificări trimise cu succes
- Numărul de notificări eșuate
- Rata de succes

## Testare

### Testare Manuală

```bash
# Testează schema bazei de date
node test-email-notifications.js

# Testează procesarea notificărilor (dry run)
NOTIFICATION_DRY_RUN=true node scripts/process-email-notifications.js
```

### Testare GraphQL

Folosește GraphQL Playground pentru a testa endpoint-urile:

```graphql
# Testează activarea notificărilor
mutation TestToggle {
  toggleEmailNotifications(id: "test-id", enabled: true) {
    id
    emailNotificationsEnabled
  }
}
```

## Securitate

### Row Level Security (RLS)

- Utilizatorii pot accesa doar propriile căutări salvate
- Șabloanele de email sunt accesibile doar de administratori
- Logurile de notificări sunt protejate prin RLS

### Validare

- Toate input-urile sunt validate folosind Zod schemas
- Șabloanele de email sunt validate pentru variabile corecte
- Limitele de notificări sunt verificate la nivel de bază de date

## Performanță

### Optimizări

- Indexuri pe coloanele frecvent folosite
- Procesare în batch pentru căutări multiple
- Cache pentru șabloanele de email
- Verificare de duplicare pentru a evita notificările multiple

### Scalabilitate

- Sistemul poate procesa sute de căutări în paralel
- Logurile sunt optimizate pentru volume mari de date
- Procesarea poate fi distribuită pe multiple instanțe

## Troubleshooting

### Probleme Comune

1. **Notificările nu sunt trimise**
   - Verifică configurarea serviciului de email
   - Verifică logurile pentru erori
   - Asigură-te că scriptul cron rulează

2. **Limitele nu sunt respectate**
   - Verifică configurarea abonamentelor în baza de date
   - Verifică funcțiile de bază de date

3. **Șabloanele nu se procesează corect**
   - Verifică sintaxa variabilelor în șabloane
   - Verifică că toate variabilele necesare sunt furnizate

### Loguri de Debug

```bash
# Activează logurile de debug
LOG_LEVEL=debug node scripts/process-email-notifications.js
```

## Dezvoltare Viitoare

### Funcționalități Planificate

- [ ] Notificări push pentru aplicația mobilă
- [ ] Personalizare avansată a șabloanelor
- [ ] Integrare cu servicii de email multiple
- [ ] Dashboard pentru administratori
- [ ] A/B testing pentru șabloane
- [ ] Notificări în timp real

### Îmbunătățiri

- [ ] Cache Redis pentru performanță
- [ ] Queue system pentru procesare asincronă
- [ ] Monitoring și alerting avansat
- [ ] Backup și recovery pentru șabloane
