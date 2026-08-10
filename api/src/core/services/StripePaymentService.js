/**
 * StripePaymentService — integrare Stripe (Checkout redirect, Elements / PaymentIntent, Customer Portal, webhook).
 * Documentație consum API: docs/STRIPE_PAYMENTS.md
 */

import Stripe from 'stripe';
import crypto from 'crypto';
import { resolveOrderIdFromPaymentIntent } from '../../utils/stripeResolveOrderId.js';
import { orderAmountToStripeMinorUnits } from '../../utils/stripeAmount.js';

class StripePaymentService {
  constructor() {
    const isProd = process.env.NODE_ENV === 'production';

    // Chei secret. Prioritate pe cheile specifice mediului, apoi fallback la chei generice.
    const secretKey = isProd
      ? (process.env.STRIPE_PRODUCTION_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
      : (process.env.STRIPE_SANDBOX_SECRET_KEY || process.env.STRIPE_SECRET_KEY);

    if (!secretKey) {
      throw new Error('Lipsește cheia STRIPE_SECRET_KEY (sau STRIPE_PRODUCTION_SECRET_KEY / STRIPE_SANDBOX_SECRET_KEY)');
    }

    const apiVersion = process.env.STRIPE_API_VERSION || '2026-01-28.clover';

    this.stripe = new Stripe(secretKey, { apiVersion });

    // Secretul pentru webhook (whsec_...) este SEPARAT de cheia API (sk_...).
    // Îl folosim doar la verifyWebhookSignature — nu la Checkout / Portal.
    this._isProd = isProd;

    this.defaultSuccessUrl = process.env.STRIPE_SUCCESS_URL;
    this.defaultCustomerPortalReturnUrl = process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL;
    // Fallback când lipsește STRIPE_SUCCESS_URL (ex. {FRONTEND_URL}/payment/stripe-result)
    this._frontendCheckoutReturnUrl = this._buildFrontendStripeReturnUrl();
  }

  /**
   * URL de întoarcere după Checkout când lipsește STRIPE_SUCCESS_URL.
   * Baza: FRONTEND_URL sau CLIENT_APP_URL (fără slash final).
   */
  _buildFrontendStripeReturnUrl() {
    const base = (process.env.FRONTEND_URL || process.env.CLIENT_APP_URL || '').replace(/\/$/, '');
    if (!base) return null;
    const path = process.env.STRIPE_CHECKOUT_RETURN_PATH || '/payment/stripe-result';
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalized}`;
  }

  /**
   * Signing secret pentru endpoint-ul de webhook (începe cu whsec_).
   * Nu e publishable key și nu e secret API — îl primești din Stripe Dashboard → Developers → Webhooks → endpoint.
   */
  _getWebhookSigningSecret() {
    const secret =
      process.env.STRIPE_WEBHOOK_SIGNING_SECRET
      || process.env.STRIPE_WEBHOOK_SECRET
      || (this._isProd
        ? process.env.STRIPE_WEBHOOK_SIGNING_SECRET_PRODUCTION
        : process.env.STRIPE_WEBHOOK_SIGNING_SECRET_SANDBOX);
    if (!secret) {
      throw new Error(
        'Lipsește STRIPE_WEBHOOK_SIGNING_SECRET sau STRIPE_WEBHOOK_SECRET (whsec_…, din Dashboard → Webhooks). '
        + 'Nu se expun în frontend; nu înlocuiesc STRIPE_SECRET_KEY.'
      );
    }
    return secret;
  }

  /**
   * PaymentIntent pentru Stripe Elements (client_secret către UI).
   * @param {{ orderId: string, amount: number, currency: string }} params amount = unități minore Stripe
   * @returns {Promise<{ clientSecret: string }>}
   */
  async createPaymentIntent({ orderId, amount, currency }) {
    if (!orderId) throw new Error('orderId este obligatoriu');
    if (!Number.isInteger(amount) || amount < 1) {
      throw new Error('amount trebuie să fie un întreg pozitiv (unități minore Stripe)');
    }
    const c = String(currency || 'ron').toLowerCase();
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount,
        currency: c,
        metadata: { orderId: String(orderId) },
        automatic_payment_methods: { enabled: true }
      });
      if (!intent?.client_secret) {
        throw new Error('Stripe nu a returnat client_secret');
      }
      return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
    } catch (e) {
      const msg = e?.raw?.message || e?.message || 'Eroare la crearea PaymentIntent';
      throw new Error(msg);
    }
  }

  /**
   * Creează o sesiune Stripe Checkout.
   * @param {Object} params
   * @param {string} params.orderId Order ID existent in sistem
   * @param {'subscription'|'payment'} params.mode
   * @param {string} [params.priceId] Stripe Price ID
   * @param {string} [params.productId] Stripe Product ID (optional, doar daca priceId nu e furnizat)
   * @param {string} [params.customerEmail]
   * @param {Object} [params.customerInfo] Optional pentru extensii (telefon etc.)
   * @param {string} [params.successUrl] După plată reușită
   * @param {string} [params.cancelUrl] Dacă utilizatorul anulează Checkout (implicit STRIPE_CANCEL_URL / success cu checkout=cancel)
   * @returns {Promise<{checkoutUrl: string, sessionId: string, expiresAt: string}>}
   */
  async createCheckoutSession({
    orderId,
    mode = 'subscription',
    priceId,
    productId,
    customerEmail,
    customerInfo,
    successUrl,
    cancelUrl
  }) {
    if (!orderId) throw new Error('orderId este obligatoriu pentru Stripe Checkout');

    const checkoutMode = mode === 'payment' ? 'payment' : 'subscription';
    const fallbackReturn = this._frontendCheckoutReturnUrl;
    const resolvedSuccessUrl = successUrl || this.defaultSuccessUrl || fallbackReturn;
    if (!resolvedSuccessUrl) {
      throw new Error(
        'Lipsește URL-ul de întoarcere după Stripe Checkout. Setează STRIPE_SUCCESS_URL '
        + '(ex. http://localhost:3000/profile?checkout=success), sau FRONTEND_URL=http://localhost:3000 '
        + '(opțional STRIPE_CHECKOUT_RETURN_PATH=/payment/stripe-result), sau trimite stripeSuccessUrl în startCheckout.'
      );
    }

    const resolvedCancelUrl =
      cancelUrl
      || process.env.STRIPE_CANCEL_URL
      || this._toCheckoutCancelUrl(resolvedSuccessUrl);

    const resolvedPriceId = await this._resolvePriceId({ priceId, productId });

    const sessionParams = {
      mode: checkoutMode,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
      metadata: {
        order_id: String(orderId),
        orderId: String(orderId)
      },
      // Evităm colectarea card data local - Stripe redirect.
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      allow_promotion_codes: false,
      // Nu seta payment_method_types: Stripe include automat metode eligibile (card, Link, Apple Pay, Google Pay).
      // Apple Pay pe web: verifică domeniul în Dashboard → Settings → Payment methods → Apple Pay.
      ...(process.env.STRIPE_CHECKOUT_LOCALE ? { locale: process.env.STRIPE_CHECKOUT_LOCALE } : {})
    };

    const orderMeta = { order_id: String(orderId), orderId: String(orderId) };
    if (checkoutMode === 'subscription') {
      sessionParams.subscription_data = { metadata: { ...orderMeta } };
    } else {
      sessionParams.payment_intent_data = { metadata: { ...orderMeta } };
    }

    // Dacă există informații suplimentare, le atașăm în metadata.
    if (customerInfo?.phone) {
      // Stripe checkout poate colecta telefon; noi nu forțăm. Telefonul este disponibil doar ca metadata.
      sessionParams.metadata = { ...sessionParams.metadata, customer_phone: String(customerInfo.phone) };
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    const expiresAt =
      session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      expiresAt,
      rawResponse: session
    };
  }

  /**
   * Interfață createOrder pentru SubscriptionService.startCheckout.
   *
   * @param {Object} orderData
   * @returns {Promise<{success: boolean, paymentProviderReference: string, checkoutUrl: string, sessionId: string, expiresAt: string, rawResponse: any}>}
   */
  async createOrder(orderData) {
    const orderId = orderData?.orderId;
    const customData = orderData?.customData || {};

    const mode = customData?.stripeCheckoutMode || customData?.mode || 'subscription';
    const priceId = customData?.stripePriceId;
    const productId = customData?.stripeProductId;

    const customerEmail = orderData?.customerEmail;
    const customerPhone = orderData?.customerPhone;

    const successUrl = customData?.stripeSuccessUrl;

    const result = await this.createCheckoutSession({
      orderId,
      mode,
      priceId,
      productId,
      customerEmail,
      customerInfo: { phone: customerPhone },
      successUrl
    });

    return {
      success: true,
      paymentProviderReference: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
      rawResponse: result.rawResponse
    };
  }

  /**
   * Creează sau găsește un Stripe Customer după email.
   * @param {{ email: string, userId?: string }} params
   * @returns {Promise<string>} Stripe customer id (cus_…)
   */
  async createOrFindCustomer({ email, userId }) {
    if (!email) throw new Error('email este obligatoriu pentru createOrFindCustomer');

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await this.stripe.customers.list({ email: normalizedEmail, limit: 3 });
    const found =
      existing.data.find((c) => c.email?.toLowerCase() === normalizedEmail)
      || existing.data[0]
      || null;

    if (found?.id) return found.id;

    const created = await this.stripe.customers.create({
      email: normalizedEmail,
      metadata: userId ? { userId: String(userId) } : {}
    });

    return created.id;
  }

  /**
   * Extrage customer / subscription Stripe din obiecte webhook (Checkout Session, Invoice, etc.).
   * @param {object} rawData
   * @returns {{ stripeCustomerId?: string, stripeSubscriptionId?: string }}
   */
  extractCustomerAndSubscriptionIds(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return {};
    }

    const customer = rawData.customer;
    const stripeCustomerId =
      typeof customer === 'string' ? customer : customer?.id || undefined;

    const subscription = rawData.subscription;
    const stripeSubscriptionId =
      typeof subscription === 'string' ? subscription : subscription?.id || undefined;

    const checkoutSession = rawData.checkout_session;
    if (checkoutSession && typeof checkoutSession === 'object') {
      const nested = this.extractCustomerAndSubscriptionIds(checkoutSession);
      return {
        stripeCustomerId: stripeCustomerId || nested.stripeCustomerId,
        stripeSubscriptionId: stripeSubscriptionId || nested.stripeSubscriptionId
      };
    }

    return {
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {})
    };
  }

  /**
   * Anulează un abonament Stripe (imediat sau la sfârșitul perioadei).
   * @param {{ stripeSubscriptionId: string, immediate?: boolean }} params
   */
  async cancelStripeSubscription({ stripeSubscriptionId, immediate = false }) {
    if (!stripeSubscriptionId) {
      throw new Error('stripeSubscriptionId este obligatoriu');
    }

    if (immediate) {
      return this.stripe.subscriptions.cancel(String(stripeSubscriptionId));
    }

    return this.stripe.subscriptions.update(String(stripeSubscriptionId), {
      cancel_at_period_end: true
    });
  }

  /**
   * Reactivează un abonament marcat cancel_at_period_end pe Stripe.
   */
  async reactivateStripeSubscription({ stripeSubscriptionId }) {
    if (!stripeSubscriptionId) {
      throw new Error('stripeSubscriptionId este obligatoriu');
    }
    return this.stripe.subscriptions.update(String(stripeSubscriptionId), {
      cancel_at_period_end: false
    });
  }

  /**
   * Retrieve Stripe subscription by id.
   */
  async retrieveSubscription(stripeSubscriptionId) {
    if (!stripeSubscriptionId) return null;
    return this.stripe.subscriptions.retrieve(String(stripeSubscriptionId));
  }

  /**
   * Refund Stripe pentru o comandă plătită (PaymentIntent / Checkout Session).
   * @param {{ paymentReference: string, amount: number, currency: string, reason?: string, description?: string }} params
   */
  async createRefund({ paymentReference, amount, currency, reason, description }) {
    if (!paymentReference) {
      throw new Error('paymentReference este obligatoriu pentru refund');
    }

    let paymentIntentId = String(paymentReference);

    if (paymentIntentId.startsWith('cs_')) {
      const session = await this.stripe.checkout.sessions.retrieve(paymentIntentId);
      const pi = session.payment_intent;
      paymentIntentId = typeof pi === 'string' ? pi : pi?.id || '';
    }

    if (!paymentIntentId.startsWith('pi_')) {
      throw new Error('Nu s-a putut determina PaymentIntent pentru refund Stripe');
    }

    const amountMinor = orderAmountToStripeMinorUnits(amount, currency);
    if (amountMinor == null || amountMinor < 1) {
      throw new Error('Suma refund invalidă');
    }

    const stripeReason = ['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)
      ? reason
      : 'requested_by_customer';

    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountMinor,
      reason: stripeReason,
      metadata: description ? { description: String(description) } : undefined
    });

    return {
      success: true,
      paymentRefundReference: refund.id,
      status: refund.status === 'succeeded' ? 'SUCCEEDED' : String(refund.status || 'PENDING').toUpperCase(),
      rawResponse: refund
    };
  }

  /**
   * Creează sesiune Stripe Customer Portal.
   * @param {Object} params
   * @param {string} params.customerId Stripe customer id
   * @param {string} [params.returnUrl]
   * @returns {Promise<{portalUrl: string}>}
   */
  async createCustomerPortalLink({ customerId, returnUrl }) {
    if (!customerId) throw new Error('customerId este obligatoriu pentru customer portal');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || this.defaultCustomerPortalReturnUrl || undefined
    });

    if (!session?.url) {
      throw new Error('Stripe Customer Portal a returnat un răspuns invalid (fără url)');
    }

    return { portalUrl: session.url };
  }

  /**
   * Citește o sesiune Checkout pentru reconciliere post-redirect.
   * Folosim această metodă ca fallback când webhook-ul nu a ajuns încă.
   *
   * @param {string} sessionId
   * @returns {Promise<import('stripe').Stripe.Checkout.Session>}
   */
  async retrieveCheckoutSession(sessionId) {
    if (!sessionId) {
      throw new Error('sessionId este obligatoriu pentru retrieveCheckoutSession');
    }

    return this.stripe.checkout.sessions.retrieve(String(sessionId), {
      expand: ['payment_intent', 'subscription']
    });
  }

  /**
   * Verifică semnătura webhook Stripe și construiește evenimentul.
   * @param {Object} params
   * @param {Buffer|string} params.rawBody raw body din request
   * @param {string} params.signatureHeader header `stripe-signature`
   */
  verifyWebhookSignature({ rawBody, signatureHeader }) {
    if (!rawBody) throw new Error('lipsește rawBody pentru verificarea semnăturii');
    if (!signatureHeader) throw new Error('lipsește header-ul stripe-signature');

    return this.stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      this._getWebhookSigningSecret()
    );
  }

  /**
   * Mapează evenimentul Stripe la actualizare de comandă (orderId intern + status).
   * @param {import('stripe').Stripe.Event} event
   * @returns {Promise<null|{orderId: string, newStatus: string, transactionId?: string, amount?: number, currency?: string, rawData?: any}>}
   */
  async getOrderUpdateFromStripeEvent(event) {
    if (!event?.type) return null;

    if (event.type === 'payment_intent.succeeded') {
      const obj = event.data?.object || {};
      const orderId = resolveOrderIdFromPaymentIntent(obj);
      if (!orderId) return null;
      return {
        orderId,
        newStatus: 'SUCCEEDED',
        transactionId: obj.id,
        amount: typeof obj.amount_received === 'number' ? obj.amount_received : undefined,
        currency: obj.currency || undefined,
        rawData: obj
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const obj = event.data?.object || {};
      const orderId = resolveOrderIdFromPaymentIntent(obj);
      if (!orderId) return null;
      return {
        orderId,
        newStatus: 'FAILED',
        transactionId: obj.id,
        rawData: obj
      };
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const obj = event.data?.object || {};
      const orderId = obj.metadata?.order_id || obj.metadata?.orderId;
      if (!orderId) return null;

      return {
        orderId: String(orderId),
        newStatus: 'SUCCEEDED',
        transactionId: obj.payment_intent || obj.id,
        rawData: obj
      };
    }

    if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      const obj = event.data?.object || {};
      const orderId = obj.metadata?.order_id || obj.metadata?.orderId;
      if (!orderId) return null;

      return {
        orderId: String(orderId),
        newStatus: event.type === 'checkout.session.expired' ? 'CANCELED' : 'FAILED',
        transactionId: obj.payment_intent || obj.id,
        rawData: obj
      };
    }

    // invoice.* and customer.subscription.* handled in StripeWebhookService router

    return null;
  }

  /**
   * Derive cancel URL from success URL: swap checkout=success → checkout=cancel,
   * or append checkout=cancel when missing.
   */
  _toCheckoutCancelUrl(successUrl) {
    try {
      const url = new URL(successUrl);
      if (url.searchParams.get('checkout') === 'success') {
        url.searchParams.set('checkout', 'cancel');
      } else if (!url.searchParams.has('checkout')) {
        url.searchParams.set('checkout', 'cancel');
      }
      return url.toString();
    } catch {
      return successUrl;
    }
  }

  /**
   * Pentru idempotency/utilitare.
   */
  sha256Hex(input) {
    return crypto.createHash('sha256').update(String(input)).digest('hex');
  }

  /**
   * ID-uri Stripe reale (ex. price_1MqKeL2eZvKYlo2C): după „price_” doar alfanumeric, fără „_”.
   * Valori din DB gen „price_pro_monthly” nu sunt ID-uri — se rezolvă prin Price.lookup_key în Stripe.
   */
  _looksLikeStripeNativePriceId(id) {
    if (!id || typeof id !== 'string' || !id.startsWith('price_')) return false;
    const rest = id.slice(6);
    return /^[A-Za-z0-9]+$/.test(rest) && rest.length >= 14;
  }

  /**
   * @returns {Promise<string>} ID Stripe real (price_…)
   */
  async _resolvePriceId({ priceId, productId }) {
    if (priceId && this._looksLikeStripeNativePriceId(priceId)) {
      return priceId;
    }

    if (productId && !priceId) {
      const prices = await this.stripe.prices.list({
        product: productId,
        active: true,
        limit: 1
      });
      const resolved = prices?.data?.[0]?.id;
      if (!resolved) {
        throw new Error(`Nu am găsit niciun price activ pentru productId=${productId}`);
      }
      return resolved;
    }

    if (!priceId) {
      throw new Error('Trebuie furnizat priceId sau productId pentru a crea Checkout Session');
    }

    // priceId din DB poate fi lookup_key (ex. price_pro_monthly, pro_monthly)
    const candidates = [priceId];
    if (String(priceId).startsWith('price_')) {
      candidates.push(String(priceId).slice(6));
    }

    for (const key of candidates) {
      try {
        const { data } = await this.stripe.prices.list({
          lookup_keys: [key],
          active: true,
          limit: 1
        });
        const found = data?.[0]?.id;
        if (found) return found;
      } catch (_) {
        /* continuă cu următorul candidat */
      }
    }

    throw new Error(
      `Nu există un Stripe Price pentru „${priceId}”. Fie pune în DB ID-ul real din Dashboard (ex. price_1…), `
      + `fie creează în Stripe un Price cu lookup_key exact „${priceId}”`
      + (candidates.length > 1 ? ` sau „${candidates[1]}”` : '')
      + '.'
    );
  }
}

export default StripePaymentService;

