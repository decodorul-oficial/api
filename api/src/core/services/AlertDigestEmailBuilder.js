/**
 * Branded alert digest email builder (table-based, Outlook-safe).
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

function articleLink(article, baseUrl) {
  if (article.link && /^https?:\/\//i.test(article.link)) {
    return article.link;
  }
  const slug = article.slug || article.stiriSlug;
  if (slug) {
    return `${baseUrl.replace(/\/$/, '')}/stiri/${slug}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/stiri/${article.id}`;
}

function formatMeta(article) {
  const parts = [];
  if (article.watchLabel) parts.push(`Act: ${article.watchLabel}`);
  if (article.searchName) parts.push(`Căutare: ${article.searchName}`);
  if (article.categoryLabel) parts.push(`Domeniu: ${article.categoryLabel}`);
  if (article.relationshipType) parts.push(article.relationshipType);
  if (article.publishedAt) parts.push(article.publishedAt);
  return parts.join(' · ');
}

function buildPrimaryCard(article, baseUrl) {
  const href = articleLink(article, baseUrl);
  const meta = formatMeta(article);
  const excerpt = article.excerpt ? `<p style="margin: 8px 0 0; font-size: 14px; color: #444; line-height: 1.5;">${escapeHtml(article.excerpt)}</p>` : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px; background: #ffffff; border: 1px solid #e8e0d4; border-radius: 8px;">
      <tr>
        <td style="padding: 16px 18px;">
          <a href="${escapeHtml(href)}" style="font-size: 17px; font-weight: 700; color: ${BRAND_ACCENT}; text-decoration: none; line-height: 1.35;">${escapeHtml(article.title)}</a>
          ${excerpt}
          ${meta ? `<p style="margin: 10px 0 0; font-size: 12px; color: #777;">${escapeHtml(meta)}</p>` : ''}
        </td>
      </tr>
    </table>
  `.trim();
}

function buildCompactLine(article, baseUrl) {
  const href = articleLink(article, baseUrl);
  return `<li style="margin: 0 0 8px; font-size: 14px;"><a href="${escapeHtml(href)}" style="color: ${BRAND_ACCENT}; text-decoration: none;">${escapeHtml(article.title)}</a></li>`;
}

export function buildDigestHtml({
  userName,
  currentDate,
  primaryArticles = [],
  categoryArticles = [],
  referenceArticles = [],
  similarArticles = [],
  manageAlertsUrl,
  disableAllAlertsUrl,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const primaryCards = primaryArticles.map((a) => buildPrimaryCard(a, baseUrl)).join('\n');
  const categoryCards = categoryArticles.map((a) => buildPrimaryCard(a, baseUrl)).join('\n');
  const referenceLines = referenceArticles.slice(0, 3).map((a) => buildCompactLine(a, baseUrl)).join('\n');
  const similarLines = similarArticles.slice(0, 5).map((a) => buildCompactLine(a, baseUrl)).join('\n');

  const referenceSection = referenceLines
    ? `
      <tr><td style="padding: 24px 24px 8px;">
        <h2 style="margin: 0; font-size: 16px; color: #333;">Deja anunțate azi</h2>
        <p style="margin: 6px 0 0; font-size: 13px; color: #666;">Le-ai primit deja astăzi — le reamintim pe scurt.</p>
      </td></tr>
      <tr><td style="padding: 0 24px 16px;"><ul style="margin: 8px 0 0; padding-left: 18px;">${referenceLines}</ul></td></tr>
    `
    : '';

  const similarSection = similarLines
    ? `
      <tr><td style="padding: 16px 24px 8px;">
        <h2 style="margin: 0; font-size: 16px; color: #333;">Știri similare din ultima lună</h2>
      </td></tr>
      <tr><td style="padding: 0 24px 16px;"><ul style="margin: 8px 0 0; padding-left: 18px;">${similarLines}</ul></td></tr>
    `
    : '';

  const categorySection = categoryCards
    ? `
      <tr><td style="padding: 16px 24px 8px;">
        <h2 style="margin: 0; font-size: 16px; color: #333;">Din domeniile tale</h2>
        <p style="margin: 6px 0 0; font-size: 13px; color: #666;">Știri noi din categoriile preferate.</p>
      </td></tr>
      <tr><td style="padding: 0 24px 8px;">${categoryCards}</td></tr>
    `
    : '';

  const manageUrl = manageAlertsUrl || `${baseUrl.replace(/\/$/, '')}/alerte`;
  const disableUrl = disableAllAlertsUrl || `${baseUrl.replace(/\/$/, '')}/alerte?action=disable-all`;
  const count = primaryArticles.length + categoryArticles.length;

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};">
    <tr><td align="center" style="padding: 24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e0d4;">
        <tr>
          <td style="padding: 20px 24px; background: ${BRAND_ACCENT}; color: #fff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: middle;">
                  <img src="${LOGO_URL}" alt="Decodorul Oficial" width="48" height="48" style="display:block;border-radius:8px;background:#fff;" />
                </td>
                <td style="vertical-align: middle; padding-left: 12px;">
                  <div style="font-size: 18px; font-weight: 700;">Decodorul Oficial</div>
                  <div style="font-size: 13px; opacity: 0.9;">Digestul tău de alerte</div>
                </td>
                <td align="right" style="vertical-align: middle;">
                  <div style="background: rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 8px; font-size: 13px;">${escapeHtml(currentDate)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding: 24px 24px 8px;">
          <p style="margin: 0; font-size: 16px; color: #222;">Salut, ${escapeHtml(userName || 'utilizator')}!</p>
          <p style="margin: 10px 0 0; font-size: 15px; color: #444; line-height: 1.5;">
            ${count === 1 ? 'Am găsit <strong>1 noutate</strong> potrivită intereselor tale.' : `Am găsit <strong>${count} noutăți</strong> potrivite intereselor tale.`}
          </p>
        </td></tr>
        <tr><td style="padding: 8px 24px 8px;">
          <h2 style="margin: 0; font-size: 16px; color: #333;">Noutăți</h2>
        </td></tr>
        <tr><td style="padding: 0 24px 8px;">${primaryCards || (categoryCards ? '' : '<p style="color:#666;">Nu există noutăți.</p>')}</td></tr>
        ${categorySection}
        ${referenceSection}
        ${similarSection}
        <tr><td style="padding: 20px 24px; text-align: center;">
          <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:${BRAND_ACCENT};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:15px;">Gestionează alertele</a>
        </td></tr>
        <tr><td style="padding: 0 24px 24px; border-top: 1px solid #eee; font-size: 12px; color: #777; line-height: 1.6;">
          <p style="margin: 16px 0 8px;">
            <a href="${escapeHtml(baseUrl)}" style="color:${BRAND_ACCENT};">Acasă</a> ·
            <a href="${escapeHtml(baseUrl)}/stiri" style="color:${BRAND_ACCENT};">Știri</a> ·
            <a href="${escapeHtml(baseUrl)}/preturi" style="color:${BRAND_ACCENT};">Prețuri</a> ·
            <a href="${escapeHtml(manageUrl)}" style="color:${BRAND_ACCENT};">Alerte</a>
          </p>
          <p style="margin: 0 0 8px;">© ${new Date().getFullYear()} Decodorul Oficial</p>
          <p style="margin: 0 0 8px;">Primești acest email pentru că ai alerte active pe Decodorul Oficial.</p>
          <p style="margin: 0;"><a href="${escapeHtml(disableUrl)}" style="color:#888;">Dezactivează toate alertele email</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildDigestText({
  userName,
  currentDate,
  primaryArticles = [],
  categoryArticles = [],
  referenceArticles = [],
  similarArticles = [],
  manageAlertsUrl,
  disableAllAlertsUrl,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const manageUrl = manageAlertsUrl || `${baseUrl.replace(/\/$/, '')}/alerte`;
  const disableUrl = disableAllAlertsUrl || `${baseUrl.replace(/\/$/, '')}/alerte?action=disable-all`;

  const lines = [
    `Decodorul Oficial — Digest alerte (${currentDate})`,
    '',
    `Salut, ${userName || 'utilizator'}!`,
    `${primaryArticles.length + categoryArticles.length} noutăți potrivite intereselor tale.`,
    '',
    'NOUTĂȚI',
    ...primaryArticles.map((a) => `- ${a.title}\n  ${articleLink(a, baseUrl)}`),
  ];

  if (categoryArticles.length) {
    lines.push('', 'DIN DOMENIILE TALE');
    categoryArticles.forEach((a) => {
      lines.push(`- ${a.title} — ${articleLink(a, baseUrl)}`);
    });
  }

  if (referenceArticles.length) {
    lines.push('', 'DEJA ANUNȚATE AZI (max 3)');
    referenceArticles.slice(0, 3).forEach((a) => {
      lines.push(`- ${a.title} — ${articleLink(a, baseUrl)}`);
    });
  }

  if (similarArticles.length) {
    lines.push('', 'ȘTIRI SIMILARE');
    similarArticles.slice(0, 5).forEach((a) => {
      lines.push(`- ${a.title} — ${articleLink(a, baseUrl)}`);
    });
  }

  lines.push('', `Gestionează alertele: ${manageUrl}`);
  lines.push(`Dezactivează toate alertele email: ${disableUrl}`);

  return lines.join('\n');
}

/**
 * @param {{ to: string, subject: string, html: string, articles?: Array }} payload
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateDigestEmailPayload({ to, subject, html, articles = [] }) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRe.test(String(to).trim())) {
    return { ok: false, reason: 'invalid_to_email' };
  }

  const subj = String(subject || '').trim();
  if (subj.length < 5 || subj.length > 180) {
    return { ok: false, reason: 'invalid_subject_length' };
  }
  if (/undefined|null|\[object Object\]/i.test(subj)) {
    return { ok: false, reason: 'invalid_subject_content' };
  }

  const htmlStr = String(html || '');
  if (!htmlStr.trim()) {
    return { ok: false, reason: 'empty_html' };
  }

  const unreplaced = ['{articleList}', '{userName}', '{watchArticleList}', '{searchArticleList}'];
  for (const token of unreplaced) {
    if (htmlStr.includes(token)) {
      return { ok: false, reason: `unreplaced_token_${token}` };
    }
  }

  if (!htmlStr.includes('/stiri/') && (articles?.length || 0) > 0) {
    return { ok: false, reason: 'missing_stiri_links' };
  }

  if (
    !htmlStr.includes('Gestionează alertele')
    && !htmlStr.includes('/alerte')
    && !htmlStr.includes('favorite?tab=alerte')
  ) {
    return { ok: false, reason: 'missing_manage_cta' };
  }

  if (!htmlStr.includes('disable-all') && !htmlStr.includes('Dezactivează toate')) {
    return { ok: false, reason: 'missing_disable_all_link' };
  }

  if (!htmlStr.includes(LOGO_URL)) {
    return { ok: false, reason: 'missing_logo' };
  }

  for (const article of articles) {
    if (!article?.title || !article?.id) {
      return { ok: false, reason: 'invalid_article_fields' };
    }
    const link = articleLink(article, DEFAULT_BASE_URL);
    if (!/^https:\/\//i.test(link)) {
      return { ok: false, reason: 'invalid_article_link' };
    }
  }

  if (articles.length > 0 && !htmlStr.includes('/stiri/')) {
    return { ok: false, reason: 'articles_without_stiri_hrefs' };
  }

  return { ok: true };
}

export function buildInstantAlertHtml({
  userName,
  watchLabel,
  relationshipType,
  articleTitle,
  articleUrl,
  manageAlertsUrl,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const manageUrl = manageAlertsUrl || `${baseUrl.replace(/\/$/, '')}/alerte`;

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};">
    <tr><td align="center" style="padding: 24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e8e0d4;">
        <tr>
          <td style="padding: 20px 24px; background: ${BRAND_ACCENT}; color: #fff;">
            <div style="font-size: 18px; font-weight: 700;">Alertă instant — Decodorul Oficial</div>
          </td>
        </tr>
        <tr><td style="padding: 24px;">
          <p style="margin: 0 0 12px; font-size: 16px;">Salut, ${escapeHtml(userName || 'utilizator')}!</p>
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.5;">
            Actul urmărit <strong>${escapeHtml(watchLabel)}</strong> a primit o relație
            <strong>${escapeHtml(relationshipType)}</strong>.
          </p>
          <p style="margin: 0 0 8px; font-size: 15px;">
            <a href="${escapeHtml(articleUrl)}" style="color:${BRAND_ACCENT};font-weight:700;text-decoration:none;">${escapeHtml(articleTitle)}</a>
          </p>
          <p style="margin: 24px 0 0; text-align:center;">
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:${BRAND_ACCENT};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;">Gestionează alertele</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildInstantAlertText({
  watchLabel,
  relationshipType,
  articleTitle,
  articleUrl,
  manageAlertsUrl,
}) {
  return [
    `Alertă instant: ${watchLabel} — ${relationshipType}`,
    '',
    articleTitle,
    articleUrl,
    '',
    `Gestionează alertele: ${manageAlertsUrl}`,
  ].join('\n');
}

export default {
  buildDigestHtml,
  buildDigestText,
  buildInstantAlertHtml,
  buildInstantAlertText,
  validateDigestEmailPayload,
};
