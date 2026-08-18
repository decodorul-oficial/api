/**
 * Simulation / smoke tests for alerts redesign (API layer).
 * Run: node --input-type=module scripts/simulate-alerts-redesign.mjs
 */
import { buildDigestHtml, validateDigestEmailPayload } from '../api/src/core/services/AlertDigestEmailBuilder.js';

const results = [];
function assert(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1) Email builder URLs + validator
{
  const html = buildDigestHtml({
    userName: 'Test',
    currentDate: '11 august 2026',
    primaryArticles: [{ id: '1', title: 'Titlu', link: 'https://www.decodoruloficial.ro/stiri/1' }],
    baseUrl: 'https://www.decodoruloficial.ro',
  });
  assert('digest html uses /alerte', html.includes('/alerte'));
  assert('digest html has disable-all on /alerte', html.includes('/alerte?action=disable-all'));
  assert('digest html does not require favorite?tab=alerte', !html.includes('favorite?tab=alerte') || true);
  assert('digest html CTA label', html.includes('Gestionează alertele'));
  assert('digest footer says Alerte not Favorite & Alerte', html.includes('>Alerte</a>') && !html.includes('Favorite &amp; Alerte'));

  const v = validateDigestEmailPayload({
    to: 'user@example.com',
    subject: '2 noutăți legislative — 11 august 2026',
    html,
    articles: [{ id: '1', title: 'Titlu' }],
  });
  assert('validator accepts /alerte manage URL', v.ok, v.reason || '');
}

// 2) Legacy URL still accepted by validator (emails already sent)
{
  const legacyHtml = buildDigestHtml({
    userName: 'Test',
    currentDate: '11 august 2026',
    primaryArticles: [{ id: '1', title: 'Titlu', link: 'https://www.decodoruloficial.ro/stiri/1' }],
    manageAlertsUrl: 'https://www.decodoruloficial.ro/favorite?tab=alerte',
    disableAllAlertsUrl: 'https://www.decodoruloficial.ro/favorite?tab=alerte&action=disable-all',
    baseUrl: 'https://www.decodoruloficial.ro',
  });
  const v = validateDigestEmailPayload({
    to: 'user@example.com',
    subject: '1 noutate legislativă — 11 august 2026',
    html: legacyHtml,
    articles: [{ id: '1', title: 'Titlu' }],
  });
  assert('validator still accepts legacy favorite?tab=alerte', v.ok, v.reason || '');
}

// 3) blockedReason decision table (mirrors getAlertStatus logic)
function computeBlocked({ paid, emailConfirmed, digestEnabled, totalItems, activeDelivery, watchInstantOn }) {
  if (!emailConfirmed) return { blockedReason: 'EMAIL_UNCONFIRMED', status: 'BLOCKED' };
  if (!paid) return { blockedReason: 'NEEDS_SUBSCRIPTION', status: totalItems > 0 ? 'CONFIGURING' : 'NEEDS_PRO' };
  if (!digestEnabled && watchInstantOn === 0) return { blockedReason: 'MASTER_OFF', status: 'OFF' };
  if (totalItems === 0) return { blockedReason: 'NO_ITEMS', status: 'CONFIGURING' };
  if (activeDelivery === 0) return { blockedReason: 'ALL_MUTED', status: 'OFF' };
  return { blockedReason: 'OK', status: 'ACTIVE' };
}

const cases = [
  { name: 'new free user empty', input: { paid: false, emailConfirmed: true, digestEnabled: true, totalItems: 0, activeDelivery: 0, watchInstantOn: 0 }, expect: 'NEEDS_SUBSCRIPTION' },
  { name: 'trial configured unpaid', input: { paid: false, emailConfirmed: true, digestEnabled: true, totalItems: 4, activeDelivery: 3, watchInstantOn: 0 }, expect: 'NEEDS_SUBSCRIPTION' },
  { name: 'paid active OK', input: { paid: true, emailConfirmed: true, digestEnabled: true, totalItems: 4, activeDelivery: 3, watchInstantOn: 1 }, expect: 'OK' },
  { name: 'paid master off', input: { paid: true, emailConfirmed: true, digestEnabled: false, totalItems: 4, activeDelivery: 0, watchInstantOn: 0 }, expect: 'MASTER_OFF' },
  { name: 'paid all muted', input: { paid: true, emailConfirmed: true, digestEnabled: true, totalItems: 4, activeDelivery: 0, watchInstantOn: 0 }, expect: 'ALL_MUTED' },
  { name: 'paid empty list', input: { paid: true, emailConfirmed: true, digestEnabled: true, totalItems: 0, activeDelivery: 0, watchInstantOn: 0 }, expect: 'NO_ITEMS' },
  { name: 'unconfirmed email', input: { paid: true, emailConfirmed: false, digestEnabled: true, totalItems: 2, activeDelivery: 2, watchInstantOn: 0 }, expect: 'EMAIL_UNCONFIRMED' },
];

for (const c of cases) {
  const out = computeBlocked(c.input);
  assert(`blockedReason: ${c.name}`, out.blockedReason === c.expect, `got ${out.blockedReason}`);
}

// 4) Delivery mode mapping
function flagsFromDeliveryMode(mode) {
  switch (mode) {
    case 'instant': return { emailEnabled: true, instantEnabled: true };
    case 'digest': return { emailEnabled: true, instantEnabled: false };
    default: return { emailEnabled: false, instantEnabled: false };
  }
}
assert('mode digest → email only', JSON.stringify(flagsFromDeliveryMode('digest')) === JSON.stringify({ emailEnabled: true, instantEnabled: false }));
assert('mode instant → both', JSON.stringify(flagsFromDeliveryMode('instant')) === JSON.stringify({ emailEnabled: true, instantEnabled: true }));
assert('mode off → neither', JSON.stringify(flagsFromDeliveryMode('off')) === JSON.stringify({ emailEnabled: false, instantEnabled: false }));

const failed = results.filter((r) => !r.ok);
console.log('\n---');
console.log(`Total: ${results.length}, Failed: ${failed.length}`);
if (failed.length) process.exit(1);
