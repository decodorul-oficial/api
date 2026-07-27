/**
 * Resend email delivery for Node (digest, instant alerts, admin ops).
 * Mirrors scraper newsletter retry/rate-limit behaviour.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendEmailError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'ResendEmailError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.isQuota = status === 429 || /quota|daily_quota/i.test(String(message || '') + String(body || ''));
    this.isAuth = status === 401 || status === 403;
  }
}

export class ResendEmailService {
  constructor({
    apiKey = process.env.RESEND_API_KEY,
    fromEmail = process.env.RESEND_FROM_EMAIL || process.env.NEWSLETTER_FROM_EMAIL,
    maxRetries = 3,
    maxRequestsPerSecond = 2,
  } = {}) {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
    this.maxRetries = maxRetries;
    this.minIntervalMs = 1000 / maxRequestsPerSecond;
    this._lastRequestTs = 0;
  }

  assertConfigured() {
    if (!this.apiKey) {
      throw new ResendEmailError('RESEND_API_KEY is not configured', { code: 'NOT_CONFIGURED' });
    }
    if (!this.fromEmail) {
      throw new ResendEmailError('RESEND_FROM_EMAIL is not configured', { code: 'NOT_CONFIGURED' });
    }
  }

  async _throttle() {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this._lastRequestTs);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this._lastRequestTs = Date.now();
  }

  /**
   * @param {{ to: string|string[], subject: string, html: string, text?: string, from?: string, replyTo?: string }} params
   * @returns {Promise<{ id: string, to: string|string[] }>}
   */
  async sendEmail({ to, subject, html, text, from, replyTo }) {
    this.assertConfigured();

    if (!to || !subject || !html) {
      throw new ResendEmailError('Missing to, subject, or html', { code: 'INVALID_PAYLOAD' });
    }

    const payload = {
      from: from || this.fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this._throttle();
        const response = await fetch(RESEND_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const bodyText = await response.text();
        let body;
        try {
          body = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          body = { raw: bodyText };
        }

        if (response.ok) {
          return { id: body.id, to: payload.to };
        }

        const err = new ResendEmailError(
          body?.message || `Resend HTTP ${response.status}`,
          { status: response.status, code: body?.name, body }
        );

        if (err.isQuota || err.isAuth) {
          throw err;
        }

        // Retry 5xx
        if (response.status >= 500 && attempt < this.maxRetries) {
          const backoff = Math.min(10000, 600 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, backoff));
          lastError = err;
          continue;
        }

        throw err;
      } catch (error) {
        if (error instanceof ResendEmailError) throw error;
        lastError = error;
        if (attempt < this.maxRetries) {
          const backoff = Math.min(10000, 600 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new ResendEmailError(error.message || 'Resend request failed', { code: 'NETWORK' });
      }
    }

    throw lastError || new ResendEmailError('Resend send failed');
  }
}

export default ResendEmailService;
