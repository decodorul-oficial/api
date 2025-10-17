/**
 * Exemple de utilizare pentru funcționalitatea de notificări email
 * Pentru utilizatorii cu abonament Pro/Enterprise
 */

console.log(`
=================================================================
   EXEMPLU: Notificări Email pentru Căutări Salvate
=================================================================

Funcționalitatea permite utilizatorilor cu abonament Pro/Enterprise să:
✅ Activeze notificări email pentru căutările salvate
✅ Primească emailuri automat când apar articole noi relevante
✅ Gestioneze limitele de notificări bazate pe abonament
✅ Personalizeze conținutul emailurilor (admin)

-----------------------------------------------------------------
1. OBȚINEREA INFORMAȚIILOR DESPRE NOTIFICĂRI
-----------------------------------------------------------------

query GetEmailNotificationInfo {
  getEmailNotificationInfo {
    limit
    currentCount
    canEnableMore
    remaining
  }
}

# Răspuns exemplu:
# {
#   "data": {
#     "getEmailNotificationInfo": {
#       "limit": 5,
#       "currentCount": 2,
#       "canEnableMore": true,
#       "remaining": 3
#     }
#   }
# }

-----------------------------------------------------------------
2. OBȚINEREA CĂUTĂRILOR SALVATE CU NOTIFICĂRI
-----------------------------------------------------------------

query GetSavedSearches {
  getSavedSearches {
    savedSearches {
      id
      name
      description
      searchParams
      isFavorite
      emailNotificationsEnabled
      createdAt
      updatedAt
    }
    pagination {
      totalCount
      hasNextPage
      currentPage
      totalPages
    }
  }
}

-----------------------------------------------------------------
3. ACTIVAREA NOTIFICĂRILOR EMAIL PENTRU O CĂUTARE
-----------------------------------------------------------------

mutation EnableEmailNotifications {
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

# Răspuns exemplu:
# {
#   "data": {
#     "toggleEmailNotifications": {
#       "id": "search-id-here",
#       "name": "Căutare Guvern 2024",
#       "emailNotificationsEnabled": true,
#   "updatedAt": "2024-01-15T10:30:00Z"
#     }
#   }
# }

-----------------------------------------------------------------
4. DEZACTIVAREA NOTIFICĂRILOR EMAIL
-----------------------------------------------------------------

mutation DisableEmailNotifications {
  toggleEmailNotifications(
    id: "search-id-here"
    enabled: false
  ) {
    id
    name
    emailNotificationsEnabled
    updatedAt
  }
}

-----------------------------------------------------------------
5. GESTIONAREA ȘABLOANELOR DE EMAIL (ADMIN)
-----------------------------------------------------------------

# Obținerea tuturor șabloanelor
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

# Obținerea unui șablon specific
query GetEmailTemplate {
  getEmailTemplateByName(templateName: "new_article_notification") {
    id
    templateName
    subject
    bodyHtml
  }
}

# Crearea unui șablon nou
mutation CreateEmailTemplate {
  createEmailTemplate(input: {
    templateName: "weekly_digest"
    subject: "Săptămâna în știri: {weekPeriod}"
    bodyHtml: """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Digest săptămânal</title>
    </head>
    <body>
        <h1>Salut {userName}!</h1>
        <p>Iată cele mai importante știri din perioada {weekPeriod}:</p>
        <ul>
            {articleList}
        </ul>
    </body>
    </html>
    """
  }) {
    id
    templateName
    subject
    createdAt
  }
}

# Actualizarea unui șablon
mutation UpdateEmailTemplate {
  updateEmailTemplate(
    id: "template-id-here"
    input: {
      subject: "Nouă știre: {articleTitle} - Monitorul Oficial"
      bodyHtml: """
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Nouă știre</title>
      </head>
      <body>
          <h1>Monitorul Oficial</h1>
          <h2>{articleTitle}</h2>
          <p>Data publicării: {articlePublicationDate}</p>
          <p>Autor: {articleAuthor}</p>
          <div>{articleExcerpt}</div>
          <a href="{articleLink}">Citește articolul complet</a>
      </body>
      </html>
      """
    }
  ) {
    id
    templateName
    subject
    updatedAt
  }
}

-----------------------------------------------------------------
6. STATISTICI DESPRE NOTIFICĂRI
-----------------------------------------------------------------

query GetEmailNotificationStats {
  getEmailNotificationStats(daysBack: 7) {
    totalNotifications
    totalSent
    totalFailed
    successRate
  }
}

# Răspuns exemplu:
# {
#   "data": {
#     "getEmailNotificationStats": {
#       "totalNotifications": 25,
#       "totalSent": 23,
#       "totalFailed": 2,
#       "successRate": 92.0
#     }
#   }
# }

-----------------------------------------------------------------
7. EXEMPLU COMPLET: WORKFLOW DE NOTIFICĂRI
-----------------------------------------------------------------

# 1. Verifică informațiile despre notificări
query CheckNotificationInfo {
  getEmailNotificationInfo {
    limit
    currentCount
    canEnableMore
    remaining
  }
}

# 2. Obține căutările salvate
query GetSavedSearches {
  getSavedSearches {
    savedSearches {
      id
      name
      emailNotificationsEnabled
    }
  }
}

# 3. Activează notificările pentru o căutare
mutation EnableNotifications {
  toggleEmailNotifications(
    id: "search-id-here"
    enabled: true
  ) {
    id
    name
    emailNotificationsEnabled
  }
}

# 4. Verifică statisticile după o săptămână
query CheckStats {
  getEmailNotificationStats(daysBack: 7) {
    totalNotifications
    totalSent
    successRate
  }
}

-----------------------------------------------------------------
8. VARIABILE DISPONIBILE ÎN ȘABLOANE
-----------------------------------------------------------------

Pentru șablonul "new_article_notification", următoarele variabile sunt disponibile:

- {userName} - Numele utilizatorului
- {searchName} - Numele căutării salvate
- {searchDescription} - Descrierea căutării salvate
- {articleTitle} - Titlul articolului
- {articlePublicationDate} - Data publicării articolului
- {articleAuthor} - Autorul articolului
- {articleExcerpt} - Un excerpt din articol
- {articleLink} - Link-ul către articol

Exemplu de utilizare în șablon:
Subject: "Nouă știre: {articleTitle}"
Body: "Salut {userName}! Am găsit o știre nouă care se potrivește cu căutarea ta '{searchName}': {articleTitle}"

-----------------------------------------------------------------
RESTRICȚII ȘI VALIDĂRI:
-----------------------------------------------------------------

❌ Doar utilizatorii cu abonament Pro/Enterprise pot activa notificări
❌ Utilizatorii Free primesc eroare: SUBSCRIPTION_REQUIRED
✅ Limitele de notificări sunt respectate:
   - Pro: maximum 5 notificări active
   - Enterprise: maximum 20 notificări active
✅ RLS (Row Level Security) asigură că utilizatorii văd doar propriile date
✅ Șabloanele de email sunt gestionate doar de administratori
✅ Notificările sunt trimise doar o dată per articol per căutare

-----------------------------------------------------------------
CODURI DE EROARE:
-----------------------------------------------------------------

- UNAUTHENTICATED: Utilizatorul nu este autentificat
- SUBSCRIPTION_REQUIRED: Utilizatorul nu are abonament activ
- EMAIL_NOTIFICATION_LIMIT_REACHED: Limita de notificări a fost atinsă
- TEMPLATE_NOT_FOUND: Șablonul de email nu a fost găsit
- TEMPLATE_IN_USE: Șablonul nu poate fi șters (este folosit)
- DUPLICATE_TEMPLATE_NAME: Există deja un șablon cu acest nume
- VALIDATION_ERROR: Parametrii invalizi
- DATABASE_ERROR: Eroare la nivelul bazei de date
- INTERNAL_ERROR: Eroare internă a serverului

-----------------------------------------------------------------
NOTĂ: Pentru a testa aceste query-uri:
-----------------------------------------------------------------

1. Asigură-te că utilizatorul are abonament Pro sau Enterprise
2. Aplică migrația 057_email_notification_system.sql în Supabase
3. Folosește GraphQL Playground la: http://localhost:4000/graphql
4. Adaugă header-ul de autentificare:
   Authorization: Bearer <your-jwt-token>

=================================================================
`);
