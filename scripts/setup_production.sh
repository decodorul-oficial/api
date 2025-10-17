#!/bin/bash

# Production Setup Script for Subscription Management
# This script sets up the subscription cron jobs for production environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up Subscription Management for Production${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root for production setup${NC}"
   echo -e "${YELLOW}Usage: sudo ./setup_production.sh${NC}"
   exit 1
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVICE_USER="www-data"
LOG_DIR="/var/log/subscription_cron"
PYTHON_PATH="/usr/bin/python3"

echo -e "${BLUE}📁 Script Directory: ${SCRIPT_DIR}${NC}"
echo -e "${BLUE}👤 Service User: ${SERVICE_USER}${NC}"
echo -e "${BLUE}📝 Log Directory: ${LOG_DIR}${NC}"

# Create service user if it doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Creating service user: ${SERVICE_USER}${NC}"
    useradd -r -s /bin/false -d /var/lib/subscription-cron "$SERVICE_USER"
fi

# Create directories
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p "$LOG_DIR"
mkdir -p "/var/lib/subscription-cron"
mkdir -p "/etc/subscription-cron"

# Set permissions
echo -e "${BLUE}🔐 Setting permissions...${NC}"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "/var/lib/subscription-cron"
chown -R "$SERVICE_USER:$SERVICE_USER" "$SCRIPT_DIR"
chmod 755 "$LOG_DIR"
chmod 755 "/var/lib/subscription-cron"
chmod +x "$SCRIPT_DIR"/*.py
chmod +x "$SCRIPT_DIR"/*.sh

# Install Python dependencies
echo -e "${BLUE}📦 Installing Python dependencies...${NC}"
apt-get update
apt-get install -y python3-pip python3-venv

# Create virtual environment
echo -e "${BLUE}🐍 Creating Python virtual environment...${NC}"
python3 -m venv "/var/lib/subscription-cron/venv"
source "/var/lib/subscription-cron/venv/bin/activate"
pip install asyncpg aiohttp cryptography

# Create environment file
echo -e "${BLUE}📝 Creating environment configuration...${NC}"
cat > "/etc/subscription-cron/.env" << 'EOF'
# Subscription Management Environment Configuration
# Fill in your actual values

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

# Python Configuration
PYTHON_PATH=/var/lib/subscription-cron/venv/bin/python
EOF

chown "$SERVICE_USER:$SERVICE_USER" "/etc/subscription-cron/.env"
chmod 600 "/etc/subscription-cron/.env"

# Generate cron configuration
echo -e "${BLUE}⚙️  Generating cron configuration...${NC}"
cd "$SCRIPT_DIR"
sudo -u "$SERVICE_USER" env PYTHON_PATH="$PYTHON_PATH" python3 cron_config.py --env production --format crontab --output "/etc/subscription-cron/crontab"

# Install cron jobs
echo -e "${BLUE}⏰ Installing cron jobs...${NC}"
sudo -u "$SERVICE_USER" crontab "/etc/subscription-cron/crontab"

# Generate systemd files
echo -e "${BLUE}🔧 Generating systemd configuration...${NC}"
sudo -u "$SERVICE_USER" env PYTHON_PATH="$PYTHON_PATH" python3 cron_config.py --env production --format systemd

# Install systemd timers
echo -e "${BLUE}🔧 Installing systemd timers...${NC}"
cp systemd/*.timer /etc/systemd/system/
cp systemd/*.service /etc/systemd/system/

# Update service files to use virtual environment
for service_file in /etc/systemd/system/subscription-*.service; do
    if [[ -f "$service_file" ]]; then
        sed -i "s|ExecStart=.*|ExecStart=$PYTHON_PATH $SCRIPT_DIR/subscription_cron.py --job=\${JOB_NAME} --env=production|" "$service_file"
        sed -i "s|WorkingDirectory=.*|WorkingDirectory=$SCRIPT_DIR|" "$service_file"
        sed -i "s|User=.*|User=$SERVICE_USER|" "$service_file"
        sed -i "s|Group=.*|Group=$SERVICE_USER|" "$service_file"
        echo "EnvironmentFile=/etc/subscription-cron/.env" >> "$service_file"
    fi
done

# Reload systemd
systemctl daemon-reload

# Enable and start timers
echo -e "${BLUE}🚀 Starting systemd timers...${NC}"
for timer_file in /etc/systemd/system/subscription-*.timer; do
    if [[ -f "$timer_file" ]]; then
        timer_name=$(basename "$timer_file")
        echo -e "${YELLOW}Enabling $timer_name...${NC}"
        systemctl enable "$timer_name"
        systemctl start "$timer_name"
    fi
done

# Create log rotation
echo -e "${BLUE}📄 Setting up log rotation...${NC}"
cat > "/etc/logrotate.d/subscription-cron" << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $SERVICE_USER $SERVICE_USER
    postrotate
        systemctl reload subscription-*.timer > /dev/null 2>&1 || true
    endscript
}
EOF

# Create monitoring script
echo -e "${BLUE}📊 Creating monitoring script...${NC}"
cat > "/usr/local/bin/subscription-status" << 'EOF'
#!/bin/bash
echo "=== Subscription Management Status ==="
echo
echo "Cron Jobs:"
crontab -u www-data -l | grep subscription || echo "No subscription cron jobs found"
echo
echo "Systemd Timers:"
systemctl list-timers | grep subscription || echo "No subscription timers found"
echo
echo "Recent Logs:"
tail -n 20 /var/log/subscription_cron/subscription_cron.log 2>/dev/null || echo "No logs found"
echo
echo "Service Status:"
systemctl status subscription-*.timer --no-pager -l
EOF

chmod +x "/usr/local/bin/subscription-status"

# Test the installation
echo -e "${BLUE}🧪 Testing installation...${NC}"
sudo -u "$SERVICE_USER" env PYTHONPATH="$SCRIPT_DIR" "$PYTHON_PATH" "$SCRIPT_DIR/test_subscription_cron.py" --test=config

# Show status
echo -e "${GREEN}🎉 Production setup completed successfully!${NC}"
echo
echo -e "${BLUE}📊 Status:${NC}"
subscription-status

echo
echo -e "${BLUE}📚 Next steps:${NC}"
echo -e "  1. Edit /etc/subscription-cron/.env with your actual values"
echo -e "  2. Test the configuration: sudo -u $SERVICE_USER $PYTHON_PATH $SCRIPT_DIR/test_subscription_cron.py"
echo -e "  3. Monitor logs: tail -f $LOG_DIR/subscription_cron.log"
echo -e "  4. Check status: subscription-status"
echo -e "  5. Restart timers if needed: systemctl restart subscription-*.timer"

echo
echo -e "${BLUE}🔧 Management commands:${NC}"
echo -e "  - Check status: subscription-status"
echo -e "  - View logs: tail -f $LOG_DIR/subscription_cron.log"
echo -e "  - Restart all: systemctl restart subscription-*.timer"
echo -e "  - Stop all: systemctl stop subscription-*.timer"
echo -e "  - Enable all: systemctl enable subscription-*.timer"
echo -e "  - Disable all: systemctl disable subscription-*.timer"

echo
echo -e "${YELLOW}⚠️  Important:${NC}"
echo -e "  - Configure /etc/subscription-cron/.env with your actual values"
echo -e "  - Test the configuration before going live"
echo -e "  - Monitor logs regularly"
echo -e "  - Set up monitoring and alerting"
