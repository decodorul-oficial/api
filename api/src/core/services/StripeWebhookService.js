/**
 * Webhook HTTP Stripe: semnătură obligatorie, idempotență, la succes → RPC + profil.
 * @see docs/STRIPE_PAYMENTS.md
 */

import Stripe from 'stripe';
import supabaseClient from '../../database/supabaseClient.js';
import StripePaymentService from './StripePaymentService.js';
import SubscriptionService from './SubscriptionService.js';

class StripeWebhookService {
  constructor() {
    this.supabase = supabaseClient.getServiceClient();
    this.stripePaymentService = new StripePaymentService();
    this.subscriptionService = new SubscriptionService(this.supabase);
    this.webhookEventTypeRecord = 'WEBHOOK_RECEIVED';
  }

  async _markWebhookProcessingDone(signatureHash, orderId) {
    try {
      await this.supabase
        .from('webhook_processing')
        .update({ status: 'SUCCEEDED' })
        .eq('payment_provider_reference', orderId)
        .eq('event_type', this.webhookEventTypeRecord)
        .eq('signature_hash', signatureHash);
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Update status comandă: la SUCCEEDED folosește SubscriptionService + RPC payments.
   */
  async updateOrderStatusFromStripe({ orderId, newStatus, transactionId, rawData, eventId }) {
    const nowIso = new Date().toISOString();

    // 1) Idempotency (best-effort, in functie de existenta coloanelor/table-ului)
    const signatureHash = this.stripePaymentService.sha256Hex(eventId);

    try {
      const { data: existing } = await this.supabase
        .from('webhook_processing')
        .select('id')
        .eq('payment_provider_reference', orderId)
        .eq('event_type', this.webhookEventTypeRecord)
        .eq('signature_hash', signatureHash)
        .limit(1);

      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
        return { processed: false, reason: 'Duplicate event' };
      }

      await this.supabase.from('webhook_processing').insert({
        payment_provider_reference: orderId,
        event_type: this.webhookEventTypeRecord,
        signature_hash: signatureHash,
        status: 'PROCESSING'
      });
    } catch (e) {
      // Daca webhook_processing nu exista sau are alt schema, continuam (dar cu risc de dubluri).
      // Cerinta principala este verificarea semnaturii.
    }

    // 2) Load order
    const { data: order, error: orderErr } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return { processed: false, reason: 'Order not found' };
    }

    // Idempotent: nu reprocessăm plata reușită / eșuată deja înregistrată
    if (newStatus === 'SUCCEEDED' && order.status === 'SUCCEEDED') {
      await this._markWebhookProcessingDone(signatureHash, orderId);
      return { processed: false, reason: 'Already paid' };
    }
    if (newStatus === 'FAILED' && order.status === 'FAILED') {
      await this._markWebhookProcessingDone(signatureHash, orderId);
      return { processed: false, reason: 'Already failed' };
    }

    if (newStatus === 'SUCCEEDED') {
      try {
        await this.subscriptionService.handleStripePaymentSuccess(order, {
          transactionId,
          rawData
        });
        await this._markWebhookProcessingDone(signatureHash, orderId);
        return { processed: true, subscriptionFlow: 'rpc_and_profile' };
      } catch (err) {
        console.error('StripeWebhookService SUCCEEDED handling:', err);
        throw err;
      }
    }

    // 3) Prepare updated metadata
    const currentMetadata = order.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      ...(transactionId ? { last_transaction_id: transactionId } : {}),
    };

    // status timestamps in metadata (compatibil cu resolver-ul updateOrderStatus)
    const statusTsKey = {
      SUCCEEDED: 'succeeded_at',
      FAILED: 'failed_at',
      CANCELED: 'canceled_at',
      REFUNDED: 'refunded_at'
    }[newStatus];
    if (statusTsKey) {
      updatedMetadata[statusTsKey] = nowIso;
    }

    // 4) Update order
    const updatePayload = {
      status: newStatus,
      metadata: updatedMetadata,
      updated_at: nowIso
    };

    await this.supabase.from('orders').update(updatePayload).eq('id', orderId);

    // 5) Payment log
    try {
      await this.supabase.from('payment_logs').insert({
        order_id: orderId,
        event_type: 'WEBHOOK_PROCESSED',
        payment_provider_reference: order.payment_provider_reference || null,
        amount: Number(order.amount),
        currency: order.currency,
        status: newStatus,
        raw_payload: rawData || {},
        created_at: nowIso
      });
    } catch (_) {
      /* ignore logging errors */
    }

    await this._markWebhookProcessingDone(signatureHash, orderId);

    return { processed: true };
  }

  async handleStripeWebhook(req, res) {
    try {
      const signatureHeader = req.headers['stripe-signature'];
      const rawBody = req.rawBody;

      const event = this.stripePaymentService.verifyWebhookSignature({
        rawBody,
        signatureHeader
      });

      const eventId = event.id;

      const orderUpdate = await this.stripePaymentService.getOrderUpdateFromStripeEvent(event);
      if (!orderUpdate?.orderId || !orderUpdate?.newStatus) {
        return res.status(200).json({ received: true, ignored: true });
      }

      const result = await this.updateOrderStatusFromStripe({
        orderId: orderUpdate.orderId,
        newStatus: orderUpdate.newStatus,
        transactionId: orderUpdate.transactionId,
        rawData: orderUpdate.rawData || {},
        eventId
      });

      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      const isSignatureError =
        err instanceof Stripe.errors.StripeSignatureVerificationError
        || err?.type === 'StripeSignatureVerificationError';

      if (isSignatureError) {
        return res.status(400).json({ received: false, error: 'Invalid Stripe signature' });
      }

      console.error('Stripe webhook error:', err);
      return res.status(500).json({ received: false, error: err?.message || 'Internal error' });
    }
  }
}

export default StripeWebhookService;

