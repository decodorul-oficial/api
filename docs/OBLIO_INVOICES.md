# Oblio — facturi fiscale (România)

Facturile văzute de clienți sunt emise în **Oblio**, nu din Stripe Invoice PDF și nu din PDF generat în browser.

## Flux

1. Stripe confirmă plata (`checkout.session.completed` / `invoice.paid`).
2. API activează abonamentul și pune comanda în `payments.oblio_invoice_queue`.
3. `OblioInvoiceService` emite factura (`POST /api/docs/invoice`) cu `idempotencyKey = order.id`.
4. Pe `orders` se salvează `oblio_series`, `oblio_number`, `oblio_link`, `oblio_status`.
5. Utilizatorul le vede în `/profile` → Istoric Plăți (link Oblio).
6. Sweeper-ul `recurring-billing` (sau `post_payments_maintenance` via pg_cron) reîncearcă eșecurile.

## Variabile de mediu (API)

| Variabilă | Rol |
|-----------|-----|
| `OBLIO_ENABLED` | `true` / `false` — în sandbox lasă `false` dacă nu vrei facturi reale |
| `OBLIO_EMAIL` | Email cont Oblio (client_id) |
| `OBLIO_SECRET` | Secret API Oblio |
| `OBLIO_CIF` | CIF-ul SRL-ului emitent |
| `OBLIO_SERIES_NAME` | Seria facturilor (ex. `FCT`) |
| `OBLIO_VAT_PERCENTAGE` | Implicit `21` |
| `OBLIO_VAT_NAME` | Implicit `Normala` |

## Sandbox vs producție

- **Sandbox / local:** `OBLIO_ENABLED=false` (skip) sau serie de test dedicată.
- **Producție:** `OBLIO_ENABLED=true` + serie fiscală reală + CIF SRL.
- Migrare: `database/migrations/087_oblio_invoices_and_stripe_lifecycle.sql`

## Cod

- `api/src/core/services/OblioInvoiceService.js`
- Hook după plată: `SubscriptionService.afterPaymentSuccessSideEffects`
