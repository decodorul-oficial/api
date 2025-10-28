# Daily Digest System - macOS Setup & Testing

## 🍎 Setup pentru macOS

### 1. Instalare Cron Job

```bash
# Rulează scriptul de setup pentru macOS
./scripts/setup-daily-digest-cron-macos.sh
```

Acest script va:
- ✅ Verifica dacă Node.js este instalat
- ✅ Crea log-urile în `~/Library/Logs/daily-digest-cron.log`
- ✅ Configura cron job-ul pentru Luni-Vineri la 08:00
- ✅ Testa configurația

### 2. Verificare Setup

```bash
# Verifică dacă cron job-ul a fost instalat
./scripts/digest-commands.sh crontab

# Verifică log-urile
./scripts/digest-commands.sh logs
```

## 🧪 Testare Manuală

### Comenzi Rapide

```bash
# Afișează toate comenzile disponibile
./scripts/digest-commands.sh help

# Rulează test digest (simulare)
./scripts/digest-commands.sh test

# Deschide tool-ul interactiv de testare
./scripts/digest-commands.sh send-test

# Verifică sănătatea sistemului
./scripts/digest-commands.sh health

# Afișează statistici
./scripts/digest-commands.sh stats
```

### Tool Interactiv de Testare

```bash
# Deschide meniul interactiv
./scripts/digest-commands.sh send-test
```

**Opțiuni disponibile:**
1. **Send test digest to all users (simulation)** - Trimite digest de test la toți utilizatorii (simulare)
2. **Send test digest to specific user** - Trimite digest de test la un utilizator specific
3. **Send real digest to all users** - ⚠️ Trimite digest real la toți utilizatorii
4. **Send real digest to specific user** - ⚠️ Trimite digest real la un utilizator specific
5. **Show users with active notifications** - Afișează utilizatorii cu notificări active
6. **Show digest statistics** - Afișează statisticile digest-urilor
7. **Test email template processing** - Testează procesarea template-urilor
8. **Health check** - Verifică sănătatea sistemului

## 📋 Comenzi Detaliate

### Setup și Configurare

```bash
# Setup complet
./scripts/setup-daily-digest-cron-macos.sh

# Verifică crontab-ul
crontab -l

# Editează crontab-ul
crontab -e

# Șterge cron job-ul
./scripts/digest-commands.sh remove-cron
```

### Testare

```bash
# Test rapid (simulare)
node scripts/daily-digest-cron.js test

# Test cu tool interactiv
node scripts/send-test-digest.js

# Health check
node scripts/daily-digest-cron.js health

# Statistici
node scripts/daily-digest-cron.js stats
```

### Monitorizare

```bash
# Urmărește log-urile în timp real
tail -f ~/Library/Logs/daily-digest-cron.log

# Afișează ultimele 50 de linii
tail -n 50 ~/Library/Logs/daily-digest-cron.log

# Caută erori în log-uri
grep -i error ~/Library/Logs/daily-digest-cron.log
```

## 🔧 Configurare Variabile de Mediu

### Opțiunea 1: Fișier .env

Creează un fișier `.env` în directorul proiectului:

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=production
LOG_LEVEL=info
```

### Opțiunea 2: Export în Terminal

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## 📅 Programare Cron

Cron job-ul este configurat să ruleze:
- **Programare**: Luni-Vineri la 08:00
- **Comandă**: `0 8 * * 1-5`
- **Log**: `~/Library/Logs/daily-digest-cron.log`

### Modificare Programare

Pentru a modifica programarea, editează crontab-ul:

```bash
crontab -e
```

Exemple de programări:
```bash
# Zilnic la 09:00
0 9 * * * cd /path/to/project && /usr/bin/node scripts/daily-digest-cron.js >> ~/Library/Logs/daily-digest-cron.log 2>&1

# De două ori pe zi (08:00 și 18:00)
0 8,18 * * 1-5 cd /path/to/project && /usr/bin/node scripts/daily-digest-cron.js >> ~/Library/Logs/daily-digest-cron.log 2>&1
```

## ⚠️ Limitări macOS

### Cron Jobs și Sleep Mode

Pe macOS, cron job-urile **nu rulează** când computerul este în sleep mode. Pentru o soluție mai robustă, consideră folosirea `launchd`:

```bash
# Creează un Launch Agent
mkdir -p ~/Library/LaunchAgents

# Creează fișierul plist
cat > ~/Library/LaunchAgents/com.monitoruloficial.daily-digest.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.monitoruloficial.daily-digest</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/node</string>
        <string>/path/to/your/project/scripts/daily-digest-cron.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>1</integer>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/$(whoami)/Library/Logs/daily-digest-cron.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/$(whoami)/Library/Logs/daily-digest-cron.log</string>
</dict>
</plist>
EOF

# Încarcă Launch Agent
launchctl load ~/Library/LaunchAgents/com.monitoruloficial.daily-digest.plist

# Verifică status
launchctl list | grep daily-digest
```

## 🐛 Troubleshooting

### Probleme Comune

#### 1. Cron Job Nu Rulează
```bash
# Verifică dacă cron job-ul există
crontab -l

# Verifică log-urile pentru erori
tail -f ~/Library/Logs/daily-digest-cron.log

# Testează manual
node scripts/daily-digest-cron.js health
```

#### 2. Variabile de Mediu Lipsesc
```bash
# Verifică variabilele
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Testează cu variabilele setate
SUPABASE_URL="your-url" SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/daily-digest-cron.js health
```

#### 3. Permisiuni
```bash
# Verifică permisiunile scripturilor
ls -la scripts/

# Facă scripturile executabile
chmod +x scripts/*.sh
chmod +x scripts/*.js
```

#### 4. Node.js Nu Este Găsit
```bash
# Verifică instalarea Node.js
which node
node --version

# Instalează Node.js cu Homebrew
brew install node
```

### Debug Mode

Pentru debug detaliat, setează variabila de mediu:

```bash
export LOG_LEVEL=debug
node scripts/daily-digest-cron.js test
```

## 📞 Suport

Dacă întâmpini probleme:

1. **Verifică log-urile**: `tail -f ~/Library/Logs/daily-digest-cron.log`
2. **Rulează health check**: `./scripts/digest-commands.sh health`
3. **Testează manual**: `./scripts/digest-commands.sh send-test`
4. **Verifică configurația**: `./scripts/digest-commands.sh crontab`

## 🎯 Workflow Recomandat

### Pentru Testare Inițială

1. **Setup**: `./scripts/setup-daily-digest-cron-macos.sh`
2. **Health Check**: `./scripts/digest-commands.sh health`
3. **Test Simulare**: `./scripts/digest-commands.sh test`
4. **Test Interactiv**: `./scripts/digest-commands.sh send-test`
5. **Verifică Log-uri**: `./scripts/digest-commands.sh logs`

### Pentru Monitorizare Zilnică

1. **Verifică Statistici**: `./scripts/digest-commands.sh stats`
2. **Urmărește Log-uri**: `tail -f ~/Library/Logs/daily-digest-cron.log`
3. **Testează Manual**: `./scripts/digest-commands.sh send-test` (opțiunea 1)

