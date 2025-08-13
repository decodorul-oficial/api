# 🚀 Deployment Rapid - Monitorul Oficial API

## ⚡ Deployment în 5 Minute

### 1. Pregătirea Proiectului
```bash
# Asigurați-vă că aveți toate fișierele necesare
ls -la
# Ar trebui să vedeți: vercel.json, vercel.config.js, .vercelignore
```

### 2. Configurarea Variabilelor de Mediu pe Vercel

În dashboard-ul Vercel → Settings → Environment Variables, adăugați:

| Variable | Value | Environment |
|----------|-------|-------------|
| `SUPABASE_URL` | `https://your-project.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | All |
| `NODE_ENV` | `production` | Production |
| `NODE_ENV` | `development` | Preview, Development |

### 3. Deployment-ul
```bash
# Instalați Vercel CLI (dacă nu aveți)
npm i -g vercel

# Deploy
vercel --prod
```

### 4. Verificarea Deployment-ului
```bash
# Rulați scriptul de verificare
npm run verify-deployment

# Sau manual
curl https://your-project.vercel.app/api/health
```

## 📋 Checklist Pre-Deployment

- [ ] Toate variabilele de mediu sunt configurate
- [ ] `vercel.json` există și este configurat corect
- [ ] `package.json` conține scripturile necesare
- [ ] `.vercelignore` exclude fișierele inutile
- [ ] Codul trece toate testele (`npm test`)

## 🔧 Configurații Avansate

### Domeniu Personalizat
1. Vercel Dashboard → Settings → Domains
2. Adăugați domeniul dvs.
3. Configurați DNS-ul

### Monitorizare
- **Vercel Analytics**: Timp de răspuns, erori
- **Supabase Dashboard**: Utilizarea bazei de date
- **Logs**: Vercel Dashboard → Functions → Logs

## 🚨 Troubleshooting Rapid

### Eroare "Environment variable not found"
```bash
# Verificați variabilele în Vercel Dashboard
vercel env ls
```

### Eroare de conectare la Supabase
```bash
# Testați conectivitatea
curl -X POST https://your-project.vercel.app/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

### Eroare "Function timeout"
```bash
# Verificați maxDuration în vercel.json
cat vercel.json | grep maxDuration
```

## 📞 Suport

- **Documentație completă**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs

---

**Notă**: Pentru detalii complete, consultați [DEPLOYMENT.md](./DEPLOYMENT.md)
