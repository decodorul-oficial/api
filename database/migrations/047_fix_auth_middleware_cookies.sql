-- Fix pentru middleware-ul de autentificare pentru a suporta cookies Supabase
-- Data: 2025-01-04
-- Descriere: Middleware-ul de autentificare a fost actualizat pentru a suporta token-uri din cookies Supabase

-- Această migrație documentează modificările făcute la middleware-ul de autentificare
-- pentru a suporta autentificarea prin cookies Supabase în plus față de header-ul Authorization.

-- Modificările includ:
-- 1. Adăugarea funcției getCookieValue() pentru extragerea valorilor din cookies
-- 2. Suportul pentru token-uri Supabase din cookie-ul 'sb-kwgfkcxlgxikmzdpxulp-auth-token'
-- 3. Decodificarea JWT-ului din cookie pentru a extrage access_token
-- 4. Fallback-ul la header-ul Authorization dacă nu există token în cookies

-- Nu sunt necesare modificări la baza de date pentru această funcționalitate.
-- Modificările sunt doar în codul JavaScript al middleware-ului.

-- Comentariu pentru documentație
COMMENT ON SCHEMA public IS 'Middleware-ul de autentificare suportă acum cookies Supabase pentru autentificare.';
