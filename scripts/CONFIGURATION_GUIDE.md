# Ghid de Configurare - Subscription Management Cron Jobs

## Rezumat

Am implementat un sistem complet de cron job-uri Python pentru gestionarea automată a abonamentelor, incluzând:

### ✅ **Funcționalități implementate**

1. **Facturare recurentă** - Procesează abonamentele care au expirat și trebuie reînnoite
2. **Gestionarea perioadelor de trial** - Gestionează expirarea perioadelor de trial
3. **Retry plăți eșuate** - Reîncearcă plățile care au eșuat cu exponential backoff
4. **Monitorizare și alerte** - Monitorizează sistemul și detectează anomalii
5. **Curățare și optimizare** - Curățare zilnică și optimizare a bazei de date

### 📁 **Fișiere create**

```
scripts/
├── subscription_cron.py          # Script principal pentru cron job-uri
├── cron_config.py               # Configurația pentru cron job-uri
├── install_cron.sh              # Script de instalare automată
├── setup_production.sh          # Script de configurare pentru producție
├── test_subscription_cron.py    # Script de testare
├── README.md                    # Documentația completă
└── CONFIGURATION_GUIDE.md       # Acest ghid
```

## Configurare rapidă

### 1. Instalare automată (recomandat)

```bash
# Pentru development
./install_cron.sh development

# Pentru producție
sudo ./setup_production.sh
```

### 2. Configurare manuală

```bash
# 1. Instalează dependențele
pip3 install asyncpg aiohttp cryptography

# 2. Configurează variabilele de mediu
cp .env.subscription .env
# Editează .env cu valorile tale

# 3. Generează configurația cron
python3 cron_config.py --env production --format crontab > crontab_production.txt

# 4. Instalează cron job-urile
crontab crontab_production.txt
```

## Configurare detaliată

### Variabile de mediu necesare

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=monitoruloficial
DB_USER=postgres
DB_PASSWORD=your_db_password

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Netopia API Configuration
NETOPIA_API_KEY=your_netopia_api_key
NETOPIA_SECRET_KEY=your_netopia_secret_key
NETOPIA_BASE_URL=https://secure.mobilpay.ro

# Internal API Configuration
INTERNAL_API_KEY=your_internal_api_key
API_BASE_URL=https://api.monitoruloficial.ro

# Retry Configuration
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_SECONDS=300

# Trial Configuration
TRIAL_GRACE_PERIOD_HOURS=24
```

### Cron job-uri programate

| Job | Programare | Descriere |
|-----|------------|-----------|
| `recurring_billing` | La fiecare 6 ore | Procesează facturarea recurentă |
| `trial_processing` | La fiecare oră | Gestionează expirarea perioadelor de trial |
| `payment_retries` | La fiecare 2 ore | Reîncearcă plățile eșuate |
| `full_cleanup` | Zilnic la 2:00 | Curățare completă și optimizare |
| `monitoring` | La fiecare 15 minute | Monitorizare și alerte |

## Testare

### Testare completă

```bash
# Rulează toate testele
python3 test_subscription_cron.py

# Testează componente specifice
python3 test_subscription_cron.py --test=recurring
python3 test_subscription_cron.py --test=trial
python3 test_subscription_cron.py --test=retries
python3 test_subscription_cron.py --test=workflow
python3 test_subscription_cron.py --test=config
```

### Testare manuală

```bash
# Testează facturarea recurentă
python3 subscription_cron.py --job=recurring_billing --env=production

# Testează gestionarea trial-urilor
python3 subscription_cron.py --job=trial_processing --env=production

# Testează retry-ul plăților
python3 subscription_cron.py --job=payment_retries --env=production
```

## Monitorizare

### Loguri

```bash
# Urmărește logurile în timp real
tail -f /var/log/subscription_cron.log

# Verifică logurile recente
tail -n 100 /var/log/subscription_cron.log

# Caută erori
grep -i error /var/log/subscription_cron.log
```

### Status

```bash
# Verifică cron job-urile
crontab -l | grep subscription

# Verifică systemd timers (dacă folosești systemd)
systemctl list-timers | grep subscription

# Verifică statusul complet (dacă ai instalat scriptul de producție)
subscription-status
```

## Configurare pentru producție

### 1. Instalare pentru producție

```bash
# Rulează scriptul de configurare pentru producție
sudo ./setup_production.sh
```

### 2. Configurare variabile de mediu

```bash
# Editează fișierul de configurare
sudo nano /etc/subscription-cron/.env

# Completează cu valorile tale reale
```

### 3. Testare configurație

```bash
# Testează configurația
sudo -u www-data /var/lib/subscription-cron/venv/bin/python test_subscription_cron.py

# Testează un job specific
sudo -u www-data /var/lib/subscription-cron/venv/bin/python subscription_cron.py --job=recurring_billing --env=production
```

### 4. Monitorizare

```bash
# Verifică statusul
subscription-status

# Urmărește logurile
tail -f /var/log/subscription_cron/subscription_cron.log

# Verifică erorile
grep -i error /var/log/subscription_cron/subscription_cron.log
```

## Configurare pentru diferite medii

### Development

```bash
# Instalare pentru development
./install_cron.sh development

# Configurare mai relaxată (rulează mai rar)
python3 cron_config.py --env development --format crontab > crontab_dev.txt
crontab crontab_dev.txt
```

### Staging

```bash
# Instalare pentru staging
./install_cron.sh staging

# Configurare intermediară
python3 cron_config.py --env staging --format crontab > crontab_staging.txt
crontab crontab_staging.txt
```

### Production

```bash
# Instalare pentru producție
sudo ./setup_production.sh

# Configurare optimizată pentru producție
```

## Troubleshooting

### Probleme comune

1. **Eroare de conexiune la baza de date**
   ```bash
   # Verifică configurația DB
   echo $DB_HOST $DB_PORT $DB_NAME $DB_USER
   
   # Testează conexiunea
   python3 -c "import asyncpg; print('DB connection OK')"
   ```

2. **Eroare de autentificare Netopia**
   ```bash
   # Verifică API keys
   echo $NETOPIA_API_KEY $NETOPIA_SECRET_KEY
   
   # Testează configurația
   python3 test_subscription_cron.py --test=config
   ```

3. **Cron job-urile nu rulează**
   ```bash
   # Verifică cron service
   sudo systemctl status cron
   
   # Verifică logurile cron
   sudo tail -f /var/log/cron
   
   # Verifică permisiunile
   ls -la subscription_cron.py
   ```

### Debug mode

```bash
# Rulează cu debug logging
PYTHONPATH=. python3 subscription_cron.py --job=recurring_billing --env=production --debug

# Rulează cu dry-run (nu face modificări reale)
DRY_RUN=true python3 subscription_cron.py --job=recurring_billing --env=production
```

## Securitate

### Best practices

1. **Variabile de mediu**: Nu commita fișierul `.env` în git
2. **Permisiuni**: Scripturile trebuie să fie executabile doar de utilizatorul corespunzător
3. **Loguri**: Logurile nu trebuie să conțină informații sensibile
4. **API Keys**: Rotează cheile API regulat
5. **Monitoring**: Monitorizează accesul la scripturi și loguri

### Verificare securitate

```bash
# Verifică permisiunile
ls -la subscription_cron.py
# Trebuie să fie: -rwxr-xr-x

# Verifică ownership
ls -la subscription_cron.py
# Trebuie să fie deținut de utilizatorul corespunzător

# Verifică logurile pentru informații sensibile
grep -i "password\|key\|token" /var/log/subscription_cron.log
```

## Comenzi utile

### Management cron job-uri

```bash
# Verifică cron job-urile active
crontab -l | grep subscription

# Editează cron job-urile
crontab -e

# Șterge toate cron job-urile
crontab -r
```

### Management systemd timers

```bash
# Verifică statusul timers
systemctl list-timers | grep subscription

# Restart toate timers
systemctl restart subscription-*.timer

# Stop toate timers
systemctl stop subscription-*.timer

# Enable toate timers
systemctl enable subscription-*.timer

# Disable toate timers
systemctl disable subscription-*.timer
```

### Management loguri

```bash
# Urmărește logurile în timp real
tail -f /var/log/subscription_cron.log

# Verifică logurile recente
tail -n 100 /var/log/subscription_cron.log

# Caută erori
grep -i error /var/log/subscription_cron.log

# Caută warning-uri
grep -i warning /var/log/subscription_cron.log

# Caută succese
grep -i success /var/log/subscription_cron.log
```

## Suport

Pentru probleme sau întrebări:

1. Verifică logurile: `/var/log/subscription_cron.log`
2. Rulează testele: `python3 test_subscription_cron.py`
3. Verifică configurația: `python3 test_subscription_cron.py --test=config`
4. Contactează echipa de dezvoltare

## Changelog

### v1.0.0
- Implementare inițială
- Facturare recurentă cu Netopia API
- Gestionare perioade trial
- Retry plăți eșuate cu exponential backoff
- Monitorizare și alerte
- Suport pentru cron și systemd
- Scripturi de test și instalare
- Documentație completă
- Configurare pentru diferite medii
- Securitate și best practices
