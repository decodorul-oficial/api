/**
 * OblioInvoiceService — emitere facturi fiscale RO via Oblio API.
 * Docs: docs/OBLIO_INVOICES.md | https://www.oblio.eu/api
 */

const OBLIO_BASE = 'https://www.oblio.eu/api';

class OblioInvoiceService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this._tokenCache = { accessToken: null, expiresAt: 0 };
  }

  isEnabled() {
    const flag = String(process.env.OBLIO_ENABLED || '').toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'no') return false;
    if (flag === 'true' || flag === '1' || flag === 'yes') {
      return Boolean(process.env.OBLIO_EMAIL && process.env.OBLIO_SECRET && process.env.OBLIO_CIF);
    }
    // Default: enabled only when credentials present AND not in explicit sandbox-only mode
    return Boolean(process.env.OBLIO_EMAIL && process.env.OBLIO_SECRET && process.env.OBLIO_CIF);
  }

  async _getAccessToken() {
    const now = Date.now();
    if (this._tokenCache.accessToken && this._tokenCache.expiresAt > now + 60_000) {
      return this._tokenCache.accessToken;
    }

    const email = process.env.OBLIO_EMAIL;
    const secret = process.env.OBLIO_SECRET;
    if (!email || !secret) {
      throw new Error('Lipsește OBLIO_EMAIL / OBLIO_SECRET');
    }

    const res = await fetch(`${OBLIO_BASE}/authorize/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: email,
        client_secret: secret
      }).toString()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      throw new Error(`Oblio auth failed: ${data?.statusMessage || data?.error_description || data?.error || res.statusText || res.status}`);
    }

    const expiresInSec = Number(data.expires_in) || 3600;
    this._tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + expiresInSec * 1000
    };
    return data.access_token;
  }

  _buildClientFromBilling(billing = {}, userEmail) {
    const isCompany = String(billing.type || '').toLowerCase() === 'company'
      || Boolean(billing.cui || billing.companyName);

    const name = isCompany
      ? (billing.companyName || `${billing.firstName || ''} ${billing.lastName || ''}`.trim())
      : `${billing.firstName || ''} ${billing.lastName || ''}`.trim()
        || billing.companyName
        || userEmail
        || 'Client';

    return {
      cif: billing.cui || undefined,
      name: name || 'Client',
      rc: billing.regCom || undefined,
      address: billing.address || undefined,
      state: billing.county || undefined,
      city: billing.city || undefined,
      country: billing.country || 'Romania',
      email: userEmail || undefined,
      vatPayer: billing.cui ? 1 : 0
    };
  }

  /**
   * Enqueue Oblio emit for an order (idempotent on order_id).
   */
  async enqueueInvoiceForOrder(orderId) {
    if (!orderId) return { queued: false, reason: 'missing_order_id' };

    const { error } = await this.supabase
      .from('oblio_invoice_queue')
      .upsert(
        {
          order_id: orderId,
          status: 'pending',
          next_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'order_id' }
      );

    if (error) {
      console.warn('OblioInvoiceService.enqueueInvoiceForOrder:', error.message);
      return { queued: false, reason: error.message };
    }
    return { queued: true };
  }

  /**
   * Emit invoice now (or skip if disabled). Updates order + queue.
   * @returns {Promise<{ status: string, series?: string, number?: string, link?: string }>}
   */
  async issueInvoiceForOrder(orderId) {
    const { data: order, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new Error(`Order ${orderId} not found for Oblio`);
    }

    if (order.oblio_status === 'issued' && order.oblio_link) {
      return {
        status: 'issued',
        series: order.oblio_series,
        number: order.oblio_number,
        link: order.oblio_link
      };
    }

    if (!this.isEnabled()) {
      await this.supabase
        .from('orders')
        .update({
          oblio_status: 'skipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      await this.supabase
        .from('oblio_invoice_queue')
        .upsert(
          {
            order_id: orderId,
            status: 'skipped',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'order_id' }
        );

      return { status: 'skipped' };
    }

    let userEmail = null;
    try {
      const { data: userData } = await this.supabase.auth.admin.getUserById(order.user_id);
      userEmail = userData?.user?.email || null;
    } catch (_) {
      /* ignore */
    }

    const tierName =
      order.metadata?.tier_name
      || order.metadata?.tier_display_name
      || 'Abonament Decodorul Oficial';

    const vatPercentage = Number(process.env.OBLIO_VAT_PERCENTAGE ?? 21);
    const vatName = process.env.OBLIO_VAT_NAME || 'Normala';
    const seriesName = process.env.OBLIO_SERIES_NAME || 'FCT';
    const amount = Number(order.amount);

    const payload = {
      cif: process.env.OBLIO_CIF,
      client: this._buildClientFromBilling(order.billing_details || {}, userEmail),
      issueDate: new Date().toISOString().slice(0, 10),
      seriesName,
      language: 'RO',
      precision: 2,
      currency: String(order.currency || 'RON').toUpperCase(),
      idempotencyKey: String(order.id),
      products: [
        {
          name: String(tierName),
          description: order.stripe_invoice_id
            ? `Plată Stripe ${order.stripe_invoice_id}`
            : `Comandă ${order.id}`,
          price: amount,
          measuringUnit: 'buc',
          currency: String(order.currency || 'RON').toUpperCase(),
          vatName,
          vatPercentage,
          vatIncluded: true,
          quantity: 1,
          productType: 'Serviciu'
        }
      ],
      collect: {
        // Oblio accepted types: Chitanta, Bon fiscal, Alta incasare numerar,
        // Ordin de plata, Mandat postal, Card, CEC, Bilet ordin, Ramburs, Alta incasare banca
        type: 'Card',
        documentNumber: order.stripe_invoice_id
          || order.payment_provider_reference
          || order.id,
        value: amount,
        issueDate: new Date().toISOString().slice(0, 10)
      },
      mentions: 'Factură emisă automat după plata online (Stripe).',
      useStock: 0
    };

    try {
      const token = await this._getAccessToken();
      const res = await fetch(`${OBLIO_BASE}/docs/invoice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.status !== 200) {
        throw new Error(data?.statusMessage || `Oblio HTTP ${res.status}`);
      }

      const doc = data?.data || {};
      const series = doc.seriesName || seriesName;
      const number = doc.number != null ? String(doc.number) : null;
      const link = doc.link || doc.pdfLink || null;

      await this.supabase
        .from('orders')
        .update({
          oblio_series: series,
          oblio_number: number,
          oblio_link: link,
          oblio_status: 'issued',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      await this.supabase
        .from('oblio_invoice_queue')
        .upsert(
          {
            order_id: orderId,
            status: 'succeeded',
            attempts: 0,
            last_error: null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'order_id' }
        );

      return { status: 'issued', series, number, link };
    } catch (err) {
      const message = err?.message || String(err);
      console.error('OblioInvoiceService.issueInvoiceForOrder:', message);

      await this.supabase
        .from('orders')
        .update({
          oblio_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      const { data: q } = await this.supabase
        .from('oblio_invoice_queue')
        .select('attempts')
        .eq('order_id', orderId)
        .maybeSingle();

      const attempts = (q?.attempts || 0) + 1;
      const delayMin = Math.min(60, 5 * attempts);

      await this.supabase
        .from('oblio_invoice_queue')
        .upsert(
          {
            order_id: orderId,
            status: 'failed',
            attempts,
            last_error: message.slice(0, 1000),
            next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString(),
            updated_at: new Date().toISOString()
          },
          { onConflict: 'order_id' }
        );

      throw err;
    }
  }

  /**
   * Process pending/failed queue items (batch).
   */
  async processQueue({ limit = 20 } = {}) {
    if (!this.isEnabled()) {
      return { processed: 0, skipped: true };
    }

    const nowIso = new Date().toISOString();
    const { data: rows, error } = await this.supabase
      .from('oblio_invoice_queue')
      .select('order_id, attempts')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', nowIso)
      .lt('attempts', 8)
      .order('next_attempt_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('OblioInvoiceService.processQueue fetch:', error.message);
      return { processed: 0, error: error.message };
    }

    let ok = 0;
    let fail = 0;
    for (const row of rows || []) {
      try {
        await this.issueInvoiceForOrder(row.order_id);
        ok += 1;
      } catch (_) {
        fail += 1;
      }
    }

    return { processed: ok + fail, ok, fail };
  }
}

export default OblioInvoiceService;
