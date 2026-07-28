# Newsletter săptămânal (cloud)

## Productie

Trimiterea newsletter-ului public (`newsletter_subscribers`) rulează **doar în cloud**:

1. **Vercel Cron** — luni `05:00 UTC` (`0 5 * * 1`) ≈ 08:00 Europe/Bucharest (EEST vară)
2. Handler: `api/src/api/cron/newsletter-weekly.js`
3. Selectează top 15 știri din săptămâna anterioară (`get_weekly_newsletter_stiri`)
4. Trimite via **Resend** (`ResendEmailService`) către toți abonații `status = subscribed`
5. Audit: `payments.newsletter_weekly_runs` (view public `newsletter_weekly_runs`)

Iarnă (EET UTC+2): ajustează schedule la `0 6 * * 1` dacă vrei strict 08:00 RO.

## Conținut

- Preferat: top 15 după vizualizări (`news_views`) în fereastra luni–duminică anterioară
- Fallback: ultimele 15 după `publication_date` dacă ranking-ul pe views nu diferențiază (`MAX(views) <= 1`)

## Auth handler

Header `Authorization: Bearer <secret>` unde secret = `NEWSLETTER_CRON_SECRET` sau `ALERTS_CRON_SECRET` sau `VERCEL_CRON_KEY`.  
Vercel Cron trimite și `x-vercel-cron`.

## Test local / manual

```bash
# Dry-run (nu trimite email; status SKIPPED_DRY_RUN — nu blochează send-ul real)
curl -X POST "https://<api>/api/src/api/cron/newsletter-weekly.js?dryRun=1" \
  -H "Authorization: Bearer $VERCEL_CRON_KEY"

# Canary (doar un email)
curl -X POST "https://<api>/api/src/api/cron/newsletter-weekly.js?canaryEmail=you@example.com" \
  -H "Authorization: Bearer $VERCEL_CRON_KEY"
```

Al doilea send reușit pentru aceeași `edition_week` → `SKIPPED_DUPLICATE`.

## Non-producție

Scriptul Python din scraper (`src/newsletter/send_newsletter.py`) este **preview / local only**. Nu este legat de pipeline și nu este canonic pentru producție.
