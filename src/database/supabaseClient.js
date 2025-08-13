/**
 * Client Supabase Singleton
 * Respectă principiul Dependency Inversion prin expunerea unei interfețe clare
 * și prin injectarea dependențelor în loc de instanțiere directă
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseConfig, validateEnvironment } from '../config/index.js';

// Validează variabilele de mediu la inițializare
validateEnvironment();

/**
 * Client Supabase cu privilegii de service_role pentru operațiuni pe server
 * Acest client are acces complet la baza de date și trebuie folosit doar pe server
 */
const supabaseServiceClient = createClient(
  supabaseConfig.url,
  supabaseConfig.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Client Supabase pentru operațiuni publice (dacă este necesar)
 */
const supabasePublicClient = supabaseConfig.anonKey 
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

/**
 * Interfața pentru clientul Supabase
 * Aceasta definește contractul pe care îl respectă toate implementările
 */
export class SupabaseClientInterface {
  /**
   * Obține clientul cu privilegii de service_role
   * @returns {Object} Client Supabase cu privilegii complete
   */
  getServiceClient() {
    return supabaseServiceClient;
  }

  /**
   * Obține clientul public (dacă este disponibil)
   * @returns {Object|null} Client Supabase public sau null
   */
  getPublicClient() {
    return supabasePublicClient;
  }

  /**
   * Verifică dacă clientul este inițializat corect
   * @returns {boolean} True dacă clientul este valid
   */
  isValid() {
    return !!supabaseServiceClient && !!supabaseConfig.url && !!supabaseConfig.serviceRoleKey;
  }

  /**
   * Obține URL-ul proiectului Supabase
   * @returns {string} URL-ul proiectului
   */
  getProjectUrl() {
    return supabaseConfig.url;
  }
}

// Exportă o instanță singleton
const supabaseClient = new SupabaseClientInterface();

// Verifică validitatea la export
if (!supabaseClient.isValid()) {
  throw new Error('Clientul Supabase nu a putut fi inițializat. Verifică variabilele de mediu.');
}

export default supabaseClient;

// Exportă și clientul direct pentru compatibilitate (deprecated, folosește interfața)
export { supabaseServiceClient, supabasePublicClient };
