/**
 * Branded weekly public newsletter email (table-based, Outlook-safe).
 */

const BRAND_BG = '#f6f2e8';
const BRAND_ACCENT = '#0a7a70';
const LOGO_URL = 'https://www.decodoruloficial.ro/logo.png';
const DEFAULT_BASE_URL = 'https://www.decodoruloficial.ro';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateRo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function articleHref(article, baseUrl) {
  if (article.link && /^https?:\/\//i.test(article.link)) {
    return article.link;
  }
  const slug = article.slug || article.id;
  return `${baseUrl.replace(/\/$/, '')}/stiri/${slug}`;
}

function excerptFromContent(content) {
  if (!content || typeof content !== 'object') return '';
  const summary = content.summary || content.excerpt || '';
  const text = String(summary).replace(/<[^>]+>/g, '').trim();
  if (text.length <= 220) return text;
  return `${text.slice(0, 217)}…`;
}

function buildArticleRow(article, baseUrl, index) {
  const href = articleHref(article, baseUrl);
  const excerpt = excerptFromContent(article.content);
  const dateLabel = formatDateRo(article.publication_date);

  return `
    <tr>
      <td style="padding: 0 0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e8e0d4; border-radius: 12px;">
          <tr>
            <td style="padding: 16px 18px;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #5c6b76;">#${index + 1}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ''}</p>
              <a href="${escapeHtml(href)}" style="font-size: 17px; font-weight: 700; color: ${BRAND_ACCENT}; text-decoration: none; line-height: 1.35;">${escapeHtml(article.title)}</a>
              ${excerpt ? `<p style="margin: 8px 0 0; font-size: 14px; color: #444; line-height: 1.5;">${escapeHtml(excerpt)}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `.trim();
}

/**
 * @param {{ articles: Array, weekStart: string, weekEnd: string, locale?: string, unsubscribeEmail: string, baseUrl?: string }} params
 */
export function buildWeeklyNewsletterHtml({
  articles = [],
  weekStart,
  weekEnd,
  locale = 'ro-RO',
  unsubscribeEmail,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const isRo = !locale || String(locale).toLowerCase().startsWith('ro');
  const weekLabel = `${formatDateRo(weekStart)} – ${formatDateRo(weekEnd)}`;
  const heroLabel = isRo ? 'Newsletter săptămânal' : 'Weekly newsletter';
  const intro = isRo
    ? `Topul celor mai importante știri legislative din săptămâna ${weekLabel}.`
    : `Top legislative stories from the week of ${weekLabel}.`;
  const ctaText = isRo ? 'Deschide aplicația' : 'Open the app';
  const unsubscribeText = isRo ? 'Dezabonare' : 'Unsubscribe';
  const footerNote = isRo
    ? 'Primești acest email pentru că te-ai abonat la newsletter-ul Decodorul Oficial.'
    : 'You receive this email because you subscribed to the Decodorul Oficial newsletter.';

  const unsubscribeUrl = `${baseUrl.replace(/\/$/, '')}/newsletter/unsubscribe?email=${encodeURIComponent(unsubscribeEmail || '')}`;
  const articleRows = articles.map((a, i) => buildArticleRow(a, baseUrl, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="${isRo ? 'ro' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Decodorul Oficial — Newsletter</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e2b33;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};">
    <tr>
      <td style="padding: 32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:780px;margin:0 auto;background:#ffffff;border-radius:32px;overflow:hidden;box-shadow:0 15px 50px rgba(14,20,35,0.08);">
          <tr>
            <td style="padding: 28px 32px; border-bottom: 1px solid #ebedf2;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${LOGO_URL}" alt="Decodorul Oficial" width="48" height="48" style="display:block;border-radius:12px;" />
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <div style="font-size:22px;font-weight:700;color:#0c1a29;">Decodorul Oficial</div>
                    <div style="font-size:14px;color:#5c6b76;margin-top:2px;">${escapeHtml(heroLabel)}</div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <div style="display:inline-block;background:${BRAND_ACCENT};color:#fff;border-radius:18px;padding:12px 18px;text-align:center;">
                      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">${isRo ? 'Săptămâna' : 'Week'}</div>
                      <div style="font-size:15px;font-weight:700;margin-top:2px;">${escapeHtml(weekLabel)}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 8px;">
              <p style="margin:0;font-size:16px;line-height:1.5;color:#1e2b33;">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${articleRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 32px 28px; text-align:center;">
              <a href="${escapeHtml(baseUrl)}" style="display:inline-block;background:${BRAND_ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:999px;">${escapeHtml(ctaText)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 28px; border-top: 1px solid #ebedf2; text-align:center; color:#5c6b76; font-size:12px; line-height:1.6;">
              <p style="margin:0 0 8px;">${escapeHtml(footerNote)}</p>
              <p style="margin:0;">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND_ACCENT};text-decoration:underline;">${escapeHtml(unsubscribeText)}</a>
                · © ${new Date().getFullYear()} Decodorul Oficial
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildWeeklyNewsletterSubject({ weekStart, weekEnd, locale = 'ro-RO', count = 15 }) {
  const isRo = !locale || String(locale).toLowerCase().startsWith('ro');
  const label = `${formatDateRo(weekStart)}–${formatDateRo(weekEnd)}`;
  if (isRo) {
    return `Decodorul Oficial — Top ${count} știri săptămâna ${label}`;
  }
  return `Decodorul Oficial — Top ${count} stories week of ${label}`;
}

export function buildWeeklyNewsletterText({ articles = [], weekStart, weekEnd, unsubscribeEmail, baseUrl = DEFAULT_BASE_URL }) {
  const lines = [
    `Decodorul Oficial — Newsletter săptămânal (${formatDateRo(weekStart)} – ${formatDateRo(weekEnd)})`,
    '',
    ...articles.map((a, i) => `${i + 1}. ${a.title}\n   ${articleHref(a, baseUrl)}`),
    '',
    `Dezabonare: ${baseUrl.replace(/\/$/, '')}/newsletter/unsubscribe?email=${encodeURIComponent(unsubscribeEmail || '')}`,
  ];
  return lines.join('\n');
}

export function validateWeeklyNewsletterHtml(html, articles) {
  if (!html || typeof html !== 'string') {
    return { ok: false, reason: 'empty_html' };
  }
  if (html.includes('{') && /\{[a-zA-Z]+\}/.test(html)) {
    return { ok: false, reason: 'unrendered_placeholder' };
  }
  if ((articles?.length || 0) > 0 && !html.includes('/stiri/')) {
    return { ok: false, reason: 'missing_stiri_links' };
  }
  return { ok: true };
}

export default {
  buildWeeklyNewsletterHtml,
  buildWeeklyNewsletterSubject,
  buildWeeklyNewsletterText,
  validateWeeklyNewsletterHtml,
};
