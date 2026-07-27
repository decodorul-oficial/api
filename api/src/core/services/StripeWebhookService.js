/**
 * Webhook HTTP Stripe: semnătură obligatorie, lifecycle abonament, renewals, Oblio.
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

  async _beginIdempotency(eventId, refKey) {
    const signatureHash = this.stripePaymentService.sha256Hex(eventId);
    try {
      const { data: existing } = await this.supabase
        .from('webhook_processing')
        .select('id')
        .eq('payment_provider_reference', refKey)
        .eq('event_type', this.webhookEventTypeRecord)
        .eq('signature_hash', signatureHash)
        .limit(1);

      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
        return { duplicate: true, signatureHash };
      }

      await this.supabase.from('webhook_processing').insert({
        payment_provider_reference: refKey,
        event_type: this.webhookEventTypeRecord,
        signature_hash: signatureHash,
        status: 'PROCESSING'
      });
    } catch (_) {
      /* table may be missing — continue */
    }
    return { duplicate: false, signatureHash };
  }

  /**
   * Update status comandă: la SUCCEEDED folosește SubscriptionService + RPC payments.
   */
  async updateOrderStatusFromStripe({ orderId, newStatus, transactionId, rawData, eventId }) {
    const nowIso = new Date().toISOString();
    const { duplicate, signatureHash } = await this._beginIdempotency(eventId, orderId);
    if (duplicate) {
      return { processed: false, reason: 'Duplicate event' };
    }

    const { data: order, error: orderErr } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return { processed: false, reason: 'Order not found' };
    }

    if (newStatus === 'SUCCEEDED' && order.status === 'SUCCEEDED') {
      // Still try Oblio if missing (invoice.paid / late webhook)
      if (!order.oblio_status || ['pending', 'failed'].includes(order.oblio_status)) {
        try {
          await this.subscriptionService.afterPaymentSuccessSideEffects(order.id, order.user_id);
        } catch (_) {
          /* ignore */
        }
      }
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

    const currentMetadata = order.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      ...(transactionId ? { last_transaction_id: transactionId } : {})
    };

    const statusTsKey = {
      SUCCEEDED: 'succeeded_at',
      FAILED: 'failed_at',
      CANCELED: 'canceled_at',
      REFUNDED: 'refunded_at'
    }[newStatus];
    if (statusTsKey) {
      updatedMetadata[statusTsKey] = nowIso;
    }

    await this.supabase.from('orders').update({
      status: newStatus,
      metadata: updatedMetadata,
      updated_at: nowIso
    }).eq('id', orderId);

    if (newStatus === 'FAILED') {
      try {
        await this.subscriptionService.handlePaymentFailure(order, rawData || {});
      } catch (_) {
        /* already updated status */
      }
    }

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
      /* ignore */
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
      const obj = event.data?.object || {};

      // --- Subscription lifecycle (no order required) ---
      if (event.type === 'customer.subscription.updated') {
        const ref = obj.id || eventId;
        const { duplicate } = await this._beginIdempotency(eventId, `sub:${ref}`);
        if (duplicate) {
          return res.status(200).json({ received: true, reason: 'Duplicate event' });
        }
        const result = await this.subscriptionService.syncSubscriptionFromStripe(obj);
        return res.status(200).json({ received: true, ...result });
      }

      if (event.type === 'customer.subscription.deleted') {
        const ref = obj.id || eventId;
        const { duplicate } = await this._beginIdempotency(eventId, `subdel:${ref}`);
        if (duplicate) {
          return res.status(200).json({ received: true, reason: 'Duplicate event' });
        }
        const result = await this.subscriptionService.handleStripeSubscriptionDeleted(obj);
        return res.status(200).json({ received: true, ...result });
      }

      if (event.type === 'invoice.payment_failed') {
        const ref = obj.id || eventId;
        const { duplicate } = await this._beginIdempotency(eventId, `invfail:${ref}`);
        if (duplicate) {
          return res.status(200).json({ received: true, reason: 'Duplicate event' });
        }
        const result = await this.subscriptionService.handleStripeInvoicePaymentFailed(obj);
        return res.status(200).json({ received: true, ...result });
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice_payment.paid') {
        const invoice =
          event.type === 'invoice_payment.paid' && obj.invoice
            ? (typeof obj.invoice === 'object' ? obj.invoice : obj)
            : obj;
        const ref = invoice.id || eventId;
        const { duplicate } = await this._beginIdempotency(eventId, `invpaid:${ref}`);
        if (duplicate) {
          return res.status(200).json({ received: true, reason: 'Duplicate event' });
        }
        const result = await this.subscriptionService.handleStripeInvoicePaid(invoice, { eventId });
        return res.status(200).json({ received: true, ...result });
      }

      // --- Order-mapped events (checkout / payment_intent) ---
      const orderUpdate = await this.stripePaymentService.getOrderUpdateFromStripeEvent(event);
      if (!orderUpdate?.orderId || !orderUpdate?.newStatus) {
        return res.status(200).json({ received: true, ignored: true, type: event.type });
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
