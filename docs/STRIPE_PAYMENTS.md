# Plăți Stripe — ghid oficial (API Monitorul Oficial)

Acest document descrie integrarea Stripe din acest repository: variabile de mediu, GraphQL, REST, webhook-uri și modelul de date. Codul relevant: `api/src/core/services/StripePaymentService.js`, `StripeWebhookService.js`, rutele din `api/src/routes/`, utilitarele `api/src/utils/stripe*.js`.

---

## 1. Ce oferă integrarea

| Mod | Descriere |
|-----|-----------|
| **Checkout (redirect)** | Utilizatorul este redirecționat pe pagina Stripe; după plată, Stripe îl trimite înapoi la aplicația ta. Folosește **Price** din Stripe (abonament sau plată unică). |
| **Elements / PaymentIntent** | UI-ul tău colectează cardul cu Stripe.js; API-ul expune `clientSecret` prin GraphQL. |
| **Customer Portal** | Gestionare factură / metodă de plată (necesită `customer` Stripe). |

Plățile sunt **Stripe-only**. Activarea checkout-ului este controlată de `PAYMENTS_ENABLED=true` (implicit dezactivat în producție dacă variabila lipsește).

---

## 2. Variabile de mediu (server)

Toate sunt **doar pe server**. Nu folosi prefix `NEXT_PUBLIC_` pentru secrete.

| Variabilă | Rol |
|-----------|-----|
| `STRIPE_SECRET_KEY` | Cheie API secretă (sau `STRIPE_SANDBOX_SECRET_KEY` / `STRIPE_PRODUCTION_SECRET_KEY` după `NODE_ENV`). |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | Secretul endpoint-ului de webhook din Stripe (`whsec_…`). Alias: `STRIPE_WEBHOOK_SECRET`. |
| `STRIPE_API_VERSION` | Versiune API Stripe (ex. `2026-01-28.clover`). |
| `STRIPE_SUCCESS_URL` | URL absolut unde Stripe redirecționează după **succes sau renunțare** la Checkout (același URL pentru `success_url` și `cancel_url`). |
| `FRONTEND_URL` / `CLIENT_APP_URL` | Alternativă: dacă lipsește `STRIPE_SUCCESS_URL`, se construiește `{FRONTEND_URL}{STRIPE_CHECKOUT_RETURN_PATH}` (implicit path `/payment/stripe-result`). |
| `STRIPE_CUSTOMER_PORTAL_RETURN_URL` | Întoarcere după Customer Portal. |
| `STRIPE_CHECKOUT_LOCALE` | Opțional: limbă Checkout (ex. `ro`). |

**Webhook-ul** nu folosește cheia de semnătură la crearea sesiunilor de Checkout; este necesar doar pe rutele POST de webhook.

---

## 3. GraphQL

Autentificare: utilizator logat (JWT / mecanismul existent al API-ului).

### `startCheckout(input: StartCheckoutInput!)`

- Creează o comandă (`orders`) și, pentru Stripe, o **Checkout Session**.
- Returnează `orderId`, `checkoutUrl`, `expiresAt`.
- Câmpuri utile: `tierId`, `billingDetails`, `stripeSuccessUrl`, `stripePriceId`, `stripeProductId`, `paymentProcessor`.
- `stripe_price_id` pe tier în DB poate fi fie **ID real** Stripe (`price_` + sufix alfanumeric lung), fie **lookup_key** configurat pe Price în Stripe (API încearcă și varianta fără prefixul `price_`).

**Erori frecvente:** lipsă URL de întoarcere (`PAYMENT_CONFIG_ERROR` / mesaj despre `STRIPE_SUCCESS_URL`); Price inexistent în Stripe.

### `createPaymentIntent(orderId: ID!, amount: Int!)`

- `amount` = **unități minore** Stripe (ex. bani pentru RON: `Math.round(lei * 100)`).
- Validează că suma coincide cu comanda și că statusul este `PENDING` sau `PROCESSING`.
- Returnează doar `{ clientSecret }` (fără obiect Stripe complet).
- După confirmare în UI, finalizarea plății și actualizarea abonamentului se bazează pe **webhook** `payment_intent.succeeded` (sau flux paralel Checkout).

### `confirmPayment(orderId: ID!)`

- Citește comanda utilizatorului (verificare stare după redirect).
- Pentru comenzile Stripe Checkout aflate în `PENDING`/`PROCESSING`, face și **reconciliere fallback** direct cu Stripe (`checkout.sessions.retrieve`):
  - dacă sesiunea este `paid/complete` => finalizează fluxul (`SUCCEEDED`, subscription + profile),
  - dacă sesiunea este `expired` => marchează comanda `CANCELED`,
  - dacă sesiunea e încă nefinalizată => păstrează statusul curent.

---

## 4. REST (autentificat)

Montate sub **`/payment/stripe`** cu același middleware de autentificare ca GraphQL.

| Metodă | Path | Rol |
|--------|------|-----|
| POST | `/payment/stripe/checkout-session` | Echo al logicii `startCheckout` cu `paymentProcessor: stripe`. Body: `tierId`, `mode`, `successUrl`, etc. Răspuns: `session_url`, `session_id`, `order_id`, `expires_at`. |
| POST | `/payment/stripe/customer-portal` | Body: `customer_id` / `customerId`, opțional `return_url`. Răspuns: `portal_url`. |

Prefixul `/api` poate fi adăugat de gateway-ul din față; în codul Express de bază rutele sunt cele de mai sus.

---

## 5. Webhook-uri Stripe (fără GraphQL)

**Două URL-uri echivalente** (același handler, o singură instanță de serviciu):

- `POST /webhook/stripe`
- `POST /api/payment/stripe/webhook`

**Cerințe tehnice**

- Body **raw** (neserializat înainte de verificare). În Express, `req.rawBody` este populat în `index.js` prin `express.json({ verify })`.
- Header `Stripe-Signature` + `STRIPE_WEBHOOK_SIGNING_SECRET` (sau aliasul menționat).

**Răspunsuri HTTP**

- `400` — semnătură invalidă.
- `200` — eveniment acceptat, ignorat (fără `orderId` în metadata) sau procesat; Stripe nu retrimite la 2xx.

**Evenimente mapate** (extras `order_id` / `orderId` din metadata sau din subscripție la factură):

- `checkout.session.completed` → succes plată comandă.
- `checkout.session.async_payment_succeeded` → succes plată asincronă.
- `checkout.session.async_payment_failed` / `checkout.session.expired` → eșec / anulare checkout.
- `invoice.paid` → succes (abonamente).
- `invoice_payment.paid` → succes (variante API noi Stripe Billing).
- `payment_intent.succeeded` / `payment_intent.payment_failed` → Elements.
- `customer.subscription.deleted` → anulare (status comandă `CANCELED` pe ramura fără RPC complet).

**La succes (`SUCCEEDED`)**

1. Legare / creare `subscriptions` după `order.metadata.tier_id` (dacă lipsea).
2. Apel **`update_order_status_rpc`** (funcție DB `payments.update_order_status`): comandă `SUCCEEDED`, log `PAYMENT_SUCCEEDED`, subscripție `ACTIVE` unde e cazul.
3. **`activateSubscription`** (serviciu JS) → **`payments.activate_subscription`** în DB: sincronizare `profiles.subscription_tier`.

---

## 6. Model de date (rezumat)

- **`orders.payment_provider_reference`**: ID tranzacție gateway; pentru Stripe poate fi `cs_…` (session) sau `pi_…` (PaymentIntent), după flux.
- **`payments.subscription_tiers.stripe_price_id`**: Price Stripe sau `lookup_key`.
- Comanda creată la `startCheckout` include în **`metadata`** `tier_id` (necesar pentru webhook).

---

## 7. Checklist Stripe Dashboard

1. **Products / Prices** — active; `lookup_key` dacă folosești identificatori simbolice în DB.
2. **Developers → Webhooks** — URL public HTTPS către unul din endpoint-urile de mai sus; evenimentele relevante selectate.
3. **Customer Portal** — activat dacă folosești ruta portal.
4. **Apple Pay** (opțional) — domeniu și HTTPS în producție.

---

## 8. Securitate

- `sk_` și `whsec_` doar pe server.
- Nu expune `clientSecret` decât către clientul care deține sesiunea utilizatorului autentificat.
- Validează mereu webhook-ul cu secretul endpoint-ului, nu doar cu cheia API.

---

## 9. Fișiere utile în repo

| Fișier | Rol |
|--------|-----|
| `api/src/core/services/StripePaymentService.js` | Client Stripe, Checkout, PaymentIntent, Portal, mapare evenimente, rezolvare Price. |
| `api/src/core/services/StripeWebhookService.js` | Verificare semnătură, idempotență, apel `handleStripePaymentSuccess`. |
| `api/src/routes/stripeWebhookDelegate.js` | Instanță unică webhook. |
| `api/src/routes/webhook.js` | `/webhook/stripe` |
| `api/src/routes/payment-stripe-webhook-api.js` | `/api/payment/stripe/webhook` |
| `api/src/routes/payment-stripe.js` | REST Checkout + Portal |
| `api/src/utils/stripeAmount.js` | Conversie sumă comandă → unități minore Stripe. |
| `api/src/utils/stripeResolveOrderId.js` | `orderId` din metadata PaymentIntent. |
| `env.example` | Șablon variabile. |

Pentru abonamente, comenzi și RPC-uri SQL, vezi și `docs/SUBSCRIPTION_SYSTEM.md` și migrațiile din `database/migrations/`.
