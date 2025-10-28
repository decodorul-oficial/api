/**
 * PaymentService - Gestionează integrarea cu Netopia Payments API V2.
 * Implementează crearea plăților, procesarea webhook-urilor, refund-uri și
 * verificarea statusului plăților, cu mecanismul de autentificare corect (epi-signature).
 */

import crypto from 'crypto';
import axios from 'axios';

class PaymentService {
  constructor() {
    // --- Configurare NETOPIA API V2 ---
    // Cheia API și cheia de semnătură POS sunt necesare pentru autentificare.
    this.apiKey = process.env.NODE_ENV === 'production' 
      ? process.env.NETOPIA_PRODUCTION_API_KEY 
      : process.env.NETOPIA_SANDBOX_API_KEY;
      
    this.posSignature = process.env.NETOPIA_POS_SIGNATURE; // Cheia SECRETĂ pentru semnarea cererilor. NECESARĂ!

    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.NETOPIA_PRODUCTION_BASE_URL 
      : process.env.NETOPIA_SANDBOX_BASE_URL;

    // --- Endpoints API V2 ---
    this.paymentStartEndpoint = '/payment/card/start';
    this.refundEndpoint = '/payment/refund'; // S-a corectat endpoint-ul conform documentației V2
    this.statusEndpoint = '/payment'; // S-a corectat endpoint-ul conform documentației V2

    // --- URL-uri de configurare ---
    this.webhookUrl = process.env.NETOPIA_WEBHOOK_URL;
    this.redirectUrl = process.env.NETOPIA_REDIRECT_URL;
    
    // Validarea variabilelor de mediu esențiale la inițializare
    this._validateEnvironment();
  }

  /**
   * Validează prezența variabilelor de mediu necesare pentru funcționare.
   * @private
   * @throws {Error} Dacă o variabilă de mediu obligatorie lipsește.
   */
  _validateEnvironment() {
    const requiredVars = {
      'NETOPIA_POS_SIGNATURE': this.posSignature,
      'NETOPIA_WEBHOOK_URL': this.webhookUrl,
      'NETOPIA_REDIRECT_URL': this.redirectUrl,
    };
    
    if (process.env.NODE_ENV === 'production') {
      requiredVars['NETOPIA_PRODUCTION_API_KEY'] = this.apiKey;
      requiredVars['NETOPIA_PRODUCTION_BASE_URL'] = this.baseUrl;
    } else {
      requiredVars['NETOPIA_SANDBOX_API_KEY'] = this.apiKey;
      requiredVars['NETOPIA_SANDBOX_BASE_URL'] = this.baseUrl;
    }
    
    const missingVars = Object.keys(requiredVars).filter(key => !requiredVars[key]);
    
    if (missingVars.length > 0) {
      throw new Error(`Variabile de mediu lipsă: ${missingVars.join(', ')}. Verifică fișierul .env.`);
    }
  }

  /**
   * Generează headerele de autentificare necesare pentru cererile către Netopia API V2.
   * Aceasta este piesa centrală a autentificării și motivul erorii 401.
   * @private
   * @param {string} method - Metoda HTTP (GET, POST).
   * @param {string} endpoint - Endpoint-ul API apelat (ex: /payment/card/start).
   * @param {string} jsonPayload - Body-ul cererii în format JSON string. Pentru GET, este un string gol.
   * @returns {Object} Un obiect conținând headerele necesare pentru cererea Axios.
   */
  _generateAuthHeaders() {
    return {
      'Authorization': `${this.apiKey}`, // Folosește cheia API direct aici
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Creează o nouă comandă de plată.
   * @param {Object} orderData - Detaliile comenzii.
   * @returns {Object} Răspunsul de la API cu URL-ul de checkout.
   */
  async createOrder(orderData) {
    try {
      const {
        orderId, amount, currency = 'RON', description, billingAddress,
        shippingAddress, items = [], customerEmail, clientID
      } = orderData;
      
      
      const payload = {
        config: {
          emailTemplate: '',
          emailSubject: '',
          notifyUrl: this.webhookUrl,
          redirectUrl: this.redirectUrl,
          language: 'ro'
        },
        /* payment: {
          options: { installments: 0, bonus: 0 },
          instrument: {
            type: 'card', // Se lasă 'card' pentru plata cu cardul
            account: '',   // Aceste câmpuri se lasă goale; clientul le completează pe pagina Netopia
            expMonth: '',
            expYear: '',
            secretCode: '',
            token: ''
          },
          data: {} // Câmp pentru date suplimentare legate de plată, dacă este cazul
        },*/
        order: {
          ntpID: '', // Se lasă gol; va fi generat de Netopia
          posSignature: this.posSignature,
          dateTime: new Date().toISOString(), // Generează data curentă în format ISO 8601
          description: orderData.description,
          orderID: orderId,
          amount: amount,
          currency: currency,
          billing: {
            email: customerEmail,
            phone: orderData.customerPhone || '', // Asigură-te că nu este undefined
            firstName: '',
            lastName: '',
            city: billingAddress.city,
            country: 642, // Codul ISO 3166-1 numeric pentru România (RO)
            countryName: 'Romania',
            state: billingAddress.city, // Pentru România, județul/sectorul poate fi trecut aici
            postalCode: billingAddress.zipCode,
            details: billingAddress.address
          },
          // Dacă adresa de livrare lipsește, se pot copia datele de facturare
          shipping: {
            email: customerEmail,
            phone: orderData.customerPhone || '',
            firstName: '',
            lastName: '',
            city: billingAddress.city,
            country: 642,
            state: billingAddress.city,
            postalCode: billingAddress.zipCode,
            details: billingAddress.address
          },
          // Maparea produselor din coș
          products: items.map(item => ({
            name: item.name,
            code: item.code,
            category: 'Abonamente', // Adaugă o categorie generică sau specifică
            price: item.price,
            vat: item.vat
          })),
          installments: { selected: 0, available: [0] },
          // Aici poți adăuga date personalizate pe care le vei primi înapoi la notificare
          data: orderData.customData || {}
        }
      };

      // 1. Serializăm payload-ul O SINGURĂ DATĂ.
      const jsonPayload = JSON.stringify(payload);
      
      // 2. Generăm headerele pentru cerere
      const headers = this._generateAuthHeaders();
      console.log('payload !!!!! : ', payload);
      //return;
      // 3. Facem cererea POST cu payload-ul ca body
      const response = await axios.post(
        `${this.baseUrl}${this.paymentStartEndpoint}`,
        payload, // Trimitem obiectul payload direct, nu string-ul JSON
        { headers }
      );
      
      const error = response?.data.error;
      const payment = response?.data.payment;

       // Verificăm cazul specific de succes (cod 101 și un URL de plată valid)
       if (error?.code === "101" && payment?.paymentURL) {
         // Este un SUCCES! Extragem datele necesare.
         console.log("Comanda Netopia a fost creată cu succes. Se redirecționează utilizatorul.");
         
         // Calculăm data de expirare (de obicei 24 de ore de la creare)
         const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
         
         return {
             success: true,
             // Folosim orderId din cererea inițială, deoarece răspunsul nu îl conține
             orderId: orderData.orderId, 
             checkoutUrl: payment.paymentURL, // URL-ul esențial pentru redirect
             netopiaOrderId: payment.ntpID,   // ID-ul tranzacției de la Netopia
             expiresAt: expiresAt,            // Data de expirare a sesiunii de checkout
             rawResponse: response?.data
         };
       }

      // Dacă există un alt tip de eroare, o aruncăm
      if (error) {
          throw new Error(`[${error.code}] ${error.message}`);
      }

      // Fallback pentru un răspuns neașteptat fără eroare, dar și fără URL de plată
      if (!payment?.paymentURL) {
          throw new Error("Răspuns invalid de la API: URL-ul de plată lipsește.");
      }
      
       // În mod normal, codul nu ar trebui să ajungă aici, dar este o măsură de siguranță
       const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
       
       return {
         success: true,
         orderId: response?.data.orderId || orderId,
         checkoutUrl: response?.data.paymentUrl,
         netopiaOrderId: response?.data.transactionId,
         expiresAt: expiresAt,
         rawResponse: response?.data
       };

    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      // Linia 151 la care face referire eroarea ta este acest `throw`.
      throw new Error(`Nu s-a putut crea comanda de plată: ${errorMessage}`);
    }
  }

  /**
   * Obține statusul unei comenzi de la Netopia.
   * @param {string} netopiaOrderId - ID-ul de tranzacție Netopia.
   * @returns {Object} Statusul comenzii.
   */
  async getOrderStatus(netopiaOrderId) {
    try {
      const endpoint = `${this.statusEndpoint}/${netopiaOrderId}`;
      const headers = this._generateAuthHeaders();

      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });

      return {
        success: true,
        ...response.data,
        amount: response.data.amount / 100, // Conversie înapoi în unități
      };
    } catch (error) {
      console.error('PaymentService.getOrderStatus error:', error.response ? error.response.data : error.message);
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`Nu s-a putut obține statusul comenzii: ${errorMessage}`);
    }
  }
  
  // --- Metode Ajutătoare Private ---

  /**
   * Formatează adresa pentru API-ul Netopia.
   * @private
   */
  _formatAddress(address) {
    if (!address) return undefined;
    return {
      email: address.email || '',
      phone: address.phone,
      firstName: address.firstName || '',
      lastName: address.lastName || '',
      city: address.city || '',
      country: address.country || 'RO',
      countryName: address.countryName,
      state: address.state || '',
      postalCode: address.postalCode || '',
      details: address.details || ''
    };
  }

  /**
   * Formatează itemii pentru API-ul Netopia.
   * @private
   */
  _formatItems(items) {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => ({
      name: item.name || '',
      code: item.code || '',
      category: item.category || '',
      price: Math.round((item.price || 0) * 100), // Conversie în subunități (bani)
      vat: item.vat || 0
    }));
  }
}

export default PaymentService;
