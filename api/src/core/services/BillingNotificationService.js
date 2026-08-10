/**
 * BillingNotificationService — email-uri minime plată / abonament via Resend.
 */

import { ResendEmailService } from './ResendEmailService.js';

class BillingNotificationService {
  constructor(supabaseClient, resendService) {
    this.supabase = supabaseClient;
    this.resend = resendService || new ResendEmailService();
    this.frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_APP_URL || 'https://decodoruloficial.ro').replace(/\/$/, '');
  }

  async _getUserEmail(userId) {
    try {
      const { data } = await this.supabase.auth.admin.getUserById(userId);
      return data?.user?.email || null;
    } catch (_) {
      return null;
    }
  }

  async _safeSend({ to, subject, html, text }) {
    if (!to) return { sent: false, reason: 'no_email' };
    try {
      if (!process.env.RESEND_API_KEY) {
        console.warn('BillingNotificationService: RESEND_API_KEY missing, skip email');
        return { sent: false, reason: 'not_configured' };
      }
      await this.resend.sendEmail({ to, subject, html, text });
      return { sent: true };
    } catch (err) {
      console.warn('BillingNotificationService send failed:', err?.message || err);
      return { sent: false, reason: err?.message };
    }
  }

  async notifyPaymentSuccess({ userId, order, oblioLink }) {
    const email = await this._getUserEmail(userId);
    const amount = order?.amount != null ? `${order.amount} ${order.currency || 'RON'}` : '';
    const invoiceLine = oblioLink
      ? `<p>Factura fiscală: <a href="${oblioLink}">deschide factura Oblio</a></p>`
      : `<p>Factura fiscală va apărea în <a href="${this.frontendUrl}/profile">contul tău</a> după emitere.</p>`;

    return this._safeSend({
      to: email,
      subject: 'Plată confirmată — Decodorul Oficial',
      html: `
        <p>Plata ta a fost confirmată${amount ? ` (${amount})` : ''}.</p>
        ${invoiceLine}
        <p>Poți gestiona abonamentul din <a href="${this.frontendUrl}/profile">profil</a>.</p>
      `,
      text: `Plata confirmată${amount ? ` (${amount})` : ''}. Facturi: ${this.frontendUrl}/profile`
    });
  }

  async notifyPaymentFailed({ userId, reason }) {
    const email = await this._getUserEmail(userId);
    return this._safeSend({
      to: email,
      subject: 'Plată eșuată — actualizează metoda de plată',
      html: `
        <p>Nu am putut încasa plata pentru abonamentul Decodorul Oficial${reason ? `: ${reason}` : ''}.</p>
        <p>Te rugăm să actualizezi metoda de plată din
          <a href="${this.frontendUrl}/profile">contul tău</a> (Gestionare Abonament → Stripe).</p>
      `,
      text: `Plată eșuată. Actualizează metoda de plată: ${this.frontendUrl}/profile`
    });
  }

  async notifySubscriptionCanceled({ userId, immediate, periodEnd }) {
    const email = await this._getUserEmail(userId);
    const when = immediate
      ? 'imediat'
      : (periodEnd
        ? `la finalul perioadei (${new Date(periodEnd).toLocaleDateString('ro-RO')})`
        : 'la finalul perioadei curente');

    return this._safeSend({
      to: email,
      subject: 'Abonament anulat — Decodorul Oficial',
      html: `
        <p>Abonamentul tău a fost marcat pentru anulare (${when}).</p>
        <p>Poți reactiva din <a href="${this.frontendUrl}/profile">profil</a> înainte de expirare, dacă e cazul.</p>
      `,
      text: `Abonament anulat (${when}). Profil: ${this.frontendUrl}/profile`
    });
  }

  /**
   * Reminder cu ~1 zi înainte de expirarea trial-ului Pro.
   * CTA către pagina de prețuri; după expirare contul rămâne, fără acces Pro.
   */
  async notifyTrialExpiringSoon({ userId, trialEnd }) {
    const email = await this._getUserEmail(userId);
    const endLabel = trialEnd
      ? new Date(trialEnd).toLocaleDateString('ro-RO', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'mâine';
    const pricingUrl = `${this.frontendUrl}/preturi`;

    return this._safeSend({
      to: email,
      subject: 'Trial-ul Pro expiră mâine — Decodorul Oficial',
      html: `
        <p>Salut,</p>
        <p>Trial-ul tău <strong>Pro</strong> pe Decodorul Oficial expiră pe <strong>${endLabel}</strong>.</p>
        <p>După expirare, contul rămâne activ, dar vei pierde accesul la funcțiile Pro
          (favorite, export, context legislativ, feed personalizat etc.).</p>
        <p style="margin:24px 0;">
          <a href="${pricingUrl}"
             style="display:inline-block;padding:12px 20px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Activează abonamentul Pro
          </a>
        </p>
        <p>Poți alege planul lunar sau anual din <a href="${pricingUrl}">pagina de prețuri</a>.</p>
      `,
      text:
        `Trial-ul Pro expiră pe ${endLabel}. Contul rămâne, dar fără funcții Pro. `
        + `Activează plata: ${pricingUrl}`,
    });
  }
}

export default BillingNotificationService;
