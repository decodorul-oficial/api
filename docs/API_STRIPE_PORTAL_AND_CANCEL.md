# Web app ↔ API: Stripe Customer Portal & anulare abonament

Acest document descrie cum aplicația **web** consumă fluxurile Stripe pentru **gestionare** (Customer Portal) și **anulare** (GraphQL), astfel încât proiectul **API** poate expune rutele/mutațiile aliniate.

## Autentificare

- Toate apelurile GraphQL folosesc același client ca restul aplicației: header **`Authorization: Bearer <JWT>`** (token Supabase / sesiune), endpoint din `NEXT_PUBLIC_GRAPHQL_ENDPOINT` (sau proxy `/api/graphql`).

---

## 1. Gestionare abonament → Stripe Customer Portal

### Comportament în web

- UI: butonul **„Gestionare Abonament”** (ex. `/profile` în `SubscriptionManager`) apelează `paymentProcessor.getCustomerPortalUrl({ customerEmail, returnUrl })`.
- Se redirecționează browserul la URL-ul returnat (`window.location.href = portal_url`).

### Sursă URL portal (variabilă de mediu)

`NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_SOURCE`:

| Valoare | Semnificație |
|--------|----------------|
| **`auto`** (implicit) | Încearcă mai întâi **API GraphQL** (`createStripeCustomerPortalSession`). Dacă mutația eșuează (ex. nu e încă implementată), face **fallback** la ruta Next.js `POST /api/payment/stripe/customer-portal` (Stripe SDK pe serverul web). |
| **`api`** | Doar GraphQL; fără fallback la Next. |
| **`next`** | Doar ruta Next (util dev / când API-ul nu expune încă mutația). |

### Contract GraphQL așteptat de web

**Mutație:**

```graphql
mutation CreateStripeCustomerPortalSession($input: CreateStripeCustomerPortalSessionInput!) {
  createStripeCustomerPortalSession(input: $input) {
    url
  }
}
```

**Input (recomandat):**

- `returnUrl: String` (opțional) — URL absolut sau relativ; backend-ul îl trimite la Stripe ca `return_url` pentru sesiunea de portal. Web trimite de obicei `https://<domeniu>/profile`.

**Răspuns:**

- `createStripeCustomerPortalSession.url` — string, URL-ul sesiunii Stripe Billing Portal (redirect HTTP 302 din browser).

**Implementare recomandată în API:**

1. Identifică utilizatorul din JWT.
2. Rezolvă **`stripeCustomerId`** (din DB legat de user; nu te baza pe email singur în producție).
3. Apelează Stripe: `stripe.billingPortal.sessions.create({ customer, return_url })`.
4. Returnează `{ url: session.url }` în GraphQL.

**Notă:** Ruta Next `customer-portal` folosește încă `customers.list({ email })` / creare customer — este doar fallback; producția cu API propriu ar trebui să folosească **`api`** sau **`auto`** după ce mutația există.

---

## 2. Anulare abonament

### Comportament în web

- UI: modal **„Anulează”** în `SubscriptionManager` (și alte componente unde există) apelează:

```graphql
mutation CancelSubscription($input: CancelSubscriptionInput!) {
  cancelSubscription(input: $input) {
    id
    status
    currentPeriodStart
    currentPeriodEnd
    cancelAtPeriodEnd
    createdAt
    updatedAt
  }
}
```

**Input trimis de web (tipic):**

```json
{
  "subscriptionId": "<id abonament din getMySubscription sau me.profile.activeSubscription>",
  "immediate": false,
  "refund": false,
  "reason": "Utilizator a solicitat anularea"
}
```

### Ce trebuie să facă API-ul pentru Stripe

- Pentru abonamente Stripe, resolver-ul `cancelSubscription` ar trebui să traducă `immediate: false` în **`cancel_at_period_end`** (sau echivalent) pe subscription-ul Stripe, să persistă starea în DB și să returneze obiectul subscription actualizat (inclusiv `cancelAtPeriodEnd` când e cazul).
- Web-ul reîncarcă datele după succes (`getMySubscription` + `getMyProfile` unde e cazul).

**Important:** Web-ul folosește **`subscriptionId` din `getMySubscription()` sau, dacă lipsește, din `me.profile.activeSubscription.id`** — ID-ul trebuie să fie același identificator pe care API-ul îl mapează la Stripe Subscription.

---

## 3. Suprapunere cu portalul Stripe

- **Gestionare Abonament** → portal Stripe (metodă de plată, facturi, uneori anulare — în funcție de configurația portalului în Stripe Dashboard).
- **Anulează** în UI → mutația GraphQL `cancelSubscription` (trebuie să fie echivalent Stripe în backend).

Este valid să lași doar portalul pentru anulare (config Stripe) și să ascunzi butonul GraphQL din UI; în prezent web-ul expune **ambele**. Dacă vrei o singură cale „doar Stripe”, aliniază produsul (UI + portal Stripe) și eventual depreciază mutația sau redirecționează-o intern către Stripe.

---

## Fișiere relevante în web

- `src/features/subscription/services/paymentProcessor.ts` — logică `auto` / `api` / `next` pentru portal.
- `src/features/subscription/services/subscriptionService.ts` — `createStripeCustomerPortalSession`, `cancelSubscription`.
- `src/features/subscription/graphql/queries.ts` — documente `CREATE_STRIPE_CUSTOMER_PORTAL_SESSION`, `CANCEL_SUBSCRIPTION`.
- `src/features/subscription/services/stripePaymentService.ts` — fallback `POST /api/payment/stripe/customer-portal`.
- `src/app/api/payment/stripe/customer-portal/route.ts` — creare sesiune portal cu cheie Stripe pe serverul Next.
- `src/components/subscription/SubscriptionManager.tsx` — butoane și fluxuri UI.

---

## Query `me` / profil îmbunătățit

Web-ul cere în `GET_MY_ENHANCED_PROFILE` pe `activeSubscription` câmpurile **`cancelAtPeriodEnd`**, **`tier.id`** (pe lângă cele existente), ca UI-ul din profil să poată ascunde butonul „Anulează” când anularea e deja programată. Asigură-te că tipul GraphQL `ActiveSubscription` (sau echivalent) expune aceste câmpuri.

---

## Checklist rapid pentru echipa API (Cursor / implementare)

- [ ] Mutație `createStripeCustomerPortalSession` → returnează `url`, input acceptă `returnUrl` opțional.
- [ ] Resolver folosește `stripeCustomerId` al utilizatorului autentificat + `stripe.billingPortal.sessions.create`.
- [ ] Mutație `cancelSubscription` → pentru Stripe, `immediate: false` = anulare la sfârșitul perioadei; returnează `cancelAtPeriodEnd` când e cazul.
- [ ] `getMySubscription` / `me.profile.activeSubscription` folosesc același `subscriptionId` ca în Stripe (sau mapare clară).

După deploy API, setează în web (opțional) `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_SOURCE=api` pentru a forța doar backend-ul, fără fallback Next.
