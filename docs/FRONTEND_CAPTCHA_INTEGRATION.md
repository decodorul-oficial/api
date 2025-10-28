# Integrarea reCAPTCHA v3 în Frontend - Ghid Complet

## Prezentare Generală

Acest ghid descrie cum să integrezi reCAPTCHA v3 în aplicația web frontend pentru a funcționa cu API-ul backend care a fost deja configurat.

## Configurarea Frontend-ului

### 1. Instalarea Dependențelor

```bash
# Pentru React
npm install react-google-recaptcha-v3

# Pentru Vue.js
npm install vue-recaptcha-v3

# Pentru vanilla JavaScript
# Nu necesită dependențe suplimentare
```

### 2. Configurarea Environment

```bash
# .env.local sau .env
REACT_APP_RECAPTCHA_SITE_KEY=your_site_key_here
# sau
VUE_APP_RECAPTCHA_SITE_KEY=your_site_key_here
```

## Implementarea în React

### 1. Configurarea reCAPTCHA

```jsx
// App.js sau index.js
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

function App() {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
      scriptProps={{
        async: false,
        defer: false,
        appendTo: 'head',
        nonce: undefined
      }}
    >
      {/* Restul aplicației */}
    </GoogleReCaptchaProvider>
  );
}
```

### 2. Hook pentru reCAPTCHA

```jsx
// hooks/useRecaptcha.js
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { useCallback } from 'react';

export const useRecaptcha = () => {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const executeCaptcha = useCallback(async (action) => {
    if (!executeRecaptcha) {
      console.warn('reCAPTCHA not available');
      return null;
    }

    try {
      const token = await executeRecaptcha(action);
      return token;
    } catch (error) {
      console.error('reCAPTCHA execution failed:', error);
      return null;
    }
  }, [executeRecaptcha]);

  return { executeCaptcha };
};
```

### 3. Implementarea în Form-uri

#### SignUp Form

```jsx
// components/SignUpForm.jsx
import React, { useState } from 'react';
import { useRecaptcha } from '../hooks/useRecaptcha';

const SignUpForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const { executeCaptcha } = useRecaptcha();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generează token captcha
      const recaptchaToken = await executeCaptcha('signup');
      
      if (!recaptchaToken) {
        throw new Error('Failed to generate captcha token');
      }

      // Trimite la API
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}` // dacă e necesar
        },
        body: JSON.stringify({
          query: `
            mutation SignUp($input: SignUpInput!) {
              signUp(input: $input) {
                token
                user {
                  id
                  email
                }
              }
            }
          `,
          variables: {
            input: {
              email: formData.email,
              password: formData.password,
              recaptchaToken: recaptchaToken
            }
          }
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Succes
      console.log('User signed up:', result.data.signUp);
      
    } catch (error) {
      console.error('SignUp error:', error);
      // Afișează eroarea utilizatorului
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
};
```

#### SignIn Form

```jsx
// components/SignInForm.jsx
import React, { useState } from 'react';
import { useRecaptcha } from '../hooks/useRecaptcha';

const SignInForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const { executeCaptcha } = useRecaptcha();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generează token captcha
      const recaptchaToken = await executeCaptcha('signin');
      
      if (!recaptchaToken) {
        throw new Error('Failed to generate captcha token');
      }

      // Trimite la API
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `
            mutation SignIn($input: SignInInput!) {
              signIn(input: $input) {
                token
                user {
                  id
                  email
                }
              }
            }
          `,
          variables: {
            input: {
              email: formData.email,
              password: formData.password,
              recaptchaToken: recaptchaToken
            }
          }
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Succes - salvează token-ul
      localStorage.setItem('authToken', result.data.signIn.token);
      
    } catch (error) {
      console.error('SignIn error:', error);
      // Afișează eroarea utilizatorului
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
};
```

#### Comment Form

```jsx
// components/CommentForm.jsx
import React, { useState } from 'react';
import { useRecaptcha } from '../hooks/useRecaptcha';

const CommentForm = ({ parentType, parentId }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const { executeCaptcha } = useRecaptcha();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generează token captcha
      const recaptchaToken = await executeCaptcha('createComment');
      
      if (!recaptchaToken) {
        throw new Error('Failed to generate captcha token');
      }

      // Trimite la API
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          query: `
            mutation CreateComment($input: CreateCommentInput!) {
              createComment(input: $input) {
                id
                content
                createdAt
                user {
                  profile {
                    displayName
                  }
                }
              }
            }
          `,
          variables: {
            input: {
              content: content,
              parentType: parentType,
              parentId: parentId,
              recaptchaToken: recaptchaToken
            }
          }
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Succes
      setContent('');
      console.log('Comment created:', result.data.createComment);
      
    } catch (error) {
      console.error('Comment error:', error);
      // Afișează eroarea utilizatorului
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your comment..."
        maxLength={2000}
        required
      />
      <button type="submit" disabled={loading || content.length === 0}>
        {loading ? 'Posting...' : 'Post Comment'}
      </button>
    </form>
  );
};
```

## Implementarea în Vue.js

### 1. Configurarea reCAPTCHA

```js
// main.js
import { createApp } from 'vue';
import VueReCaptcha from 'vue-recaptcha-v3';

const app = createApp(App);

app.use(VueReCaptcha, {
  siteKey: process.env.VUE_APP_RECAPTCHA_SITE_KEY,
  loaderOptions: {
    useRecaptchaNet: true
  }
});

app.mount('#app');
```

### 2. Composable pentru reCAPTCHA

```js
// composables/useRecaptcha.js
import { useReCaptcha } from 'vue-recaptcha-v3';

export const useRecaptcha = () => {
  const { executeRecaptcha, recaptchaLoaded } = useReCaptcha();

  const executeCaptcha = async (action) => {
    await recaptchaLoaded();
    return await executeRecaptcha(action);
  };

  return { executeCaptcha };
};
```

### 3. Implementarea în Componente

```vue
<!-- components/SignUpForm.vue -->
<template>
  <form @submit="handleSubmit">
    <input
      v-model="formData.email"
      type="email"
      placeholder="Email"
      required
    />
    <input
      v-model="formData.password"
      type="password"
      placeholder="Password"
      required
    />
    <button type="submit" :disabled="loading">
      {{ loading ? 'Signing up...' : 'Sign Up' }}
    </button>
  </form>
</template>

<script setup>
import { ref } from 'vue';
import { useRecaptcha } from '../composables/useRecaptcha';

const formData = ref({
  email: '',
  password: ''
});
const loading = ref(false);
const { executeCaptcha } = useRecaptcha();

const handleSubmit = async (e) => {
  e.preventDefault();
  loading.value = true;

  try {
    const recaptchaToken = await executeCaptcha('signup');
    
    if (!recaptchaToken) {
      throw new Error('Failed to generate captcha token');
    }

    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          mutation SignUp($input: SignUpInput!) {
            signUp(input: $input) {
              token
              user {
                id
                email
              }
            }
          }
        `,
        variables: {
          input: {
            email: formData.value.email,
            password: formData.value.password,
            recaptchaToken: recaptchaToken
          }
        }
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    console.log('User signed up:', result.data.signUp);
    
  } catch (error) {
    console.error('SignUp error:', error);
  } finally {
    loading.value = false;
  }
};
</script>
```

## Implementarea în Vanilla JavaScript

### 1. Încărcarea Script-ului

```html
<!-- index.html -->
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
```

### 2. Funcția pentru Execuția Captcha

```js
// utils/recaptcha.js
export const executeCaptcha = async (action) => {
  return new Promise((resolve, reject) => {
    if (typeof grecaptcha === 'undefined') {
      reject(new Error('reCAPTCHA not loaded'));
      return;
    }

    grecaptcha.ready(() => {
      grecaptcha.execute('YOUR_SITE_KEY', { action })
        .then(token => resolve(token))
        .catch(error => reject(error));
    });
  });
};
```

### 3. Implementarea în Form-uri

```js
// forms/signup.js
import { executeCaptcha } from '../utils/recaptcha.js';

const signupForm = document.getElementById('signup-form');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(signupForm);
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    // Generează token captcha
    const recaptchaToken = await executeCaptcha('signup');
    
    if (!recaptchaToken) {
      throw new Error('Failed to generate captcha token');
    }

    // Trimite la API
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          mutation SignUp($input: SignUpInput!) {
            signUp(input: $input) {
              token
              user {
                id
                email
              }
            }
          }
        `,
        variables: {
          input: {
            email: email,
            password: password,
            recaptchaToken: recaptchaToken
          }
        }
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    console.log('User signed up:', result.data.signUp);
    
  } catch (error) {
    console.error('SignUp error:', error);
    // Afișează eroarea utilizatorului
  }
});
```

## Gestionarea Erorilor

### 1. Tipuri de Erori Captcha

```js
const handleCaptchaError = (error) => {
  if (error.message.includes('CAPTCHA_REQUIRED')) {
    return 'Captcha validation is required';
  } else if (error.message.includes('CAPTCHA_INVALID')) {
    return 'Captcha validation failed. Please try again.';
  } else if (error.message.includes('Failed to generate captcha token')) {
    return 'Unable to verify you are human. Please refresh and try again.';
  }
  return 'An error occurred. Please try again.';
};
```

### 2. Retry Logic

```js
const submitWithRetry = async (submitFunction, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await submitFunction();
    } catch (error) {
      if (error.message.includes('CAPTCHA_INVALID') && i < maxRetries - 1) {
        // Așteaptă puțin înainte de retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
};
```

## Best Practices

### 1. Performance

- **Lazy Loading**: Încarcă reCAPTCHA doar când e necesar
- **Caching**: Cache token-urile pentru operațiuni multiple
- **Debouncing**: Evită generarea excesivă de token-uri

### 2. UX

- **Loading States**: Afișează loading când se generează token-ul
- **Error Messages**: Mesaje clare pentru utilizatori
- **Fallback**: Plan de rezervă pentru cazurile când reCAPTCHA eșuează

### 3. Security

- **Token Freshness**: Generează token-uri noi pentru fiecare operațiune
- **Action Validation**: Folosește acțiuni specifice pentru fiecare operațiune
- **Error Handling**: Nu expune detalii despre erorile de captcha

## Testarea

### 1. Testare Locală

```js
// Pentru testare locală, poți folosi token-uri mock
const MOCK_CAPTCHA_TOKEN = 'mock_token_for_testing';

const executeCaptcha = async (action) => {
  if (process.env.NODE_ENV === 'development') {
    return MOCK_CAPTCHA_TOKEN;
  }
  
  // Implementarea reală
  return await realExecuteCaptcha(action);
};
```

### 2. Testare cu Cypress

```js
// cypress/support/commands.js
Cypress.Commands.add('mockRecaptcha', () => {
  cy.window().then((win) => {
    win.grecaptcha = {
      ready: (callback) => callback(),
      execute: () => Promise.resolve('mock_captcha_token')
    };
  });
});
```

## Concluzie

Această implementare oferă:

✅ **Integrare seamless** cu backend-ul existent
✅ **Experiență utilizator** optimă (invisible captcha)
✅ **Gestionarea erorilor** robustă
✅ **Compatibilitate** cu toate framework-urile populare
✅ **Testare** și debugging ușoare

Implementarea este gata pentru producție și se integrează perfect cu API-ul backend configurat! 🚀
