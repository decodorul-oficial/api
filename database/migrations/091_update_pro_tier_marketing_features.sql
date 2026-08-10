-- Align Pro tier marketing features with product capabilities
-- (legislation watches, weekday email alerts, favorites hub, saved searches,
-- export + legislative context, personalized feed + priority support)

UPDATE payments.subscription_tiers
SET features = '[
  "Urmărești legi și ordine — afli când se modifică",
  "Alerte email în zilele lucrătoare, doar când apar noutăți",
  "Favorite & Alerte — tot controlul într-un singur loc",
  "Căutări salvate cu notificări la rezultate noi",
  "Export PDF/Word și context legislativ pe fiecare act",
  "Feed personalizat pe categorii și suport prioritar"
]'::jsonb,
    description = 'Monitorizare legislativă, alerte email și instrumente pentru profesioniști',
    updated_at = now()
WHERE name = 'pro-monthly';

UPDATE payments.subscription_tiers
SET features = '[
  "Urmărești legi și ordine — afli când se modifică",
  "Alerte email în zilele lucrătoare, doar când apar noutăți",
  "Favorite & Alerte — tot controlul într-un singur loc",
  "Căutări salvate cu notificări la rezultate noi",
  "Export PDF/Word și context legislativ pe fiecare act",
  "Feed personalizat pe categorii și suport prioritar"
]'::jsonb,
    description = 'Monitorizare legislativă, alerte email și instrumente pentru profesioniști (2 luni gratuite)',
    updated_at = now()
WHERE name = 'pro-yearly';
