#!/bin/bash

# Subscription Management Cron Installation Script
# This script installs and configures cron jobs for subscription management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
PYTHON_PATH="${PYTHON_PATH:-python3}"
LOG_DIR="/var/log/subscription_cron"
SERVICE_USER="www-data"

echo -e "${BLUE}🚀 Installing Subscription Management Cron Jobs${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Script Directory: ${SCRIPT_DIR}${NC}"

# Check if running as root for system operations
if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  Running as root - will install system-wide${NC}"
    INSTALL_SYSTEM=true
else
    echo -e "${YELLOW}⚠️  Not running as root - will install for current user${NC}"
    INSTALL_SYSTEM=false
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo -e "${BLUE}📋 Checking dependencies...${NC}"

if ! command_exists python3; then
    echo -e "${RED}❌ Python 3 is required but not installed${NC}"
    exit 1
fi

if ! command_exists pip3; then
    echo -e "${RED}❌ pip3 is required but not installed${NC}"
    exit 1
fi

# Check Python packages
echo -e "${BLUE}📦 Checking Python packages...${NC}"
REQUIRED_PACKAGES=("asyncpg" "aiohttp" "cryptography")

for package in "${REQUIRED_PACKAGES[@]}"; do
    if ! python3 -c "import $package" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Installing $package...${NC}"
        pip3 install "$package"
    else
        echo -e "${GREEN}✅ $package is installed${NC}"
    fi
done

# Create log directory
echo -e "${BLUE}📁 Creating log directory...${NC}"
if [[ "$INSTALL_SYSTEM" == true ]]; then
    sudo mkdir -p "$LOG_DIR"
    sudo chown "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
    sudo chmod 755 "$LOG_DIR"
else
    mkdir -p "$LOG_DIR"
    chmod 755 "$LOG_DIR"
fi

# Make scripts executable
echo -e "${BLUE}🔧 Making scripts executable...${NC}"
chmod +x "$SCRIPT_DIR/subscription_cron.py"
chmod +x "$SCRIPT_DIR/cron_config.py"

# Generate cron configuration
echo -e "${BLUE}⚙️  Generating cron configuration...${NC}"
cd "$SCRIPT_DIR"

# Generate crontab
python3 cron_config.py --env "$ENVIRONMENT" --format crontab --output "crontab_${ENVIRONMENT}.txt"

# Generate systemd files
python3 cron_config.py --env "$ENVIRONMENT" --format systemd

echo -e "${GREEN}✅ Generated configuration files:${NC}"
echo -e "  - crontab_${ENVIRONMENT}.txt"
echo -e "  - systemd/"

# Install cron jobs
echo -e "${BLUE}⏰ Installing cron jobs...${NC}"

if [[ "$INSTALL_SYSTEM" == true ]]; then
    # Install system-wide crontab
    echo -e "${YELLOW}Installing system-wide crontab...${NC}"
    sudo crontab -u "$SERVICE_USER" "crontab_${ENVIRONMENT}.txt"
    echo -e "${GREEN}✅ System-wide crontab installed for user: $SERVICE_USER${NC}"
else
    # Install user crontab
    echo -e "${YELLOW}Installing user crontab...${NC}"
    crontab "crontab_${ENVIRONMENT}.txt"
    echo -e "${GREEN}✅ User crontab installed${NC}"
fi

# Install systemd timers (if systemd is available)
if command_exists systemctl && [[ "$INSTALL_SYSTEM" == true ]]; then
    echo -e "${BLUE}🔧 Installing systemd timers...${NC}"
    
    # Copy systemd files
    sudo cp systemd/*.timer /etc/systemd/system/
    sudo cp systemd/*.service /etc/systemd/system/
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable and start timers
    for timer_file in systemd/*.timer; do
        if [[ -f "$timer_file" ]]; then
            timer_name=$(basename "$timer_file")
            echo -e "${YELLOW}Enabling $timer_name...${NC}"
            sudo systemctl enable "$timer_name"
            sudo systemctl start "$timer_name"
        fi
    done
    
    echo -e "${GREEN}✅ Systemd timers installed and started${NC}"
fi

# Create environment file template
echo -e "${BLUE}📝 Creating environment file template...${NC}"
cat > "$SCRIPT_DIR/.env.subscription" << EOF
# Subscription Management Environment Configuration
# Copy this file to .env and fill in your values

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
NETOPIA_BASE_URL=https://sandboxsecure.mobilpay.ro

# Internal API Configuration
INTERNAL_API_KEY=your_internal_api_key
API_BASE_URL=https://api.monitoruloficial.ro

# Retry Configuration
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_SECONDS=300

# Trial Configuration
TRIAL_GRACE_PERIOD_HOURS=24

# Python Configuration
PYTHON_PATH=python3
EOF

echo -e "${GREEN}✅ Environment template created: .env.subscription${NC}"

# Test the installation
echo -e "${BLUE}🧪 Testing installation...${NC}"
if [[ -f "$SCRIPT_DIR/.env.subscription" ]]; then
    echo -e "${YELLOW}⚠️  Please configure .env.subscription with your actual values${NC}"
    echo -e "${YELLOW}⚠️  Then run: python3 subscription_cron.py --help${NC}"
else
    echo -e "${YELLOW}⚠️  Please create .env file with your configuration${NC}"
fi

# Show status
echo -e "${BLUE}📊 Installation Status:${NC}"
echo -e "${GREEN}✅ Scripts installed and configured${NC}"
echo -e "${GREEN}✅ Cron jobs scheduled${NC}"

if command_exists systemctl && [[ "$INSTALL_SYSTEM" == true ]]; then
    echo -e "${GREEN}✅ Systemd timers installed${NC}"
    echo -e "${BLUE}📋 Systemd timer status:${NC}"
    sudo systemctl list-timers | grep subscription || echo "No subscription timers found"
fi

echo -e "${BLUE}📋 Cron job status:${NC}"
if [[ "$INSTALL_SYSTEM" == true ]]; then
    sudo crontab -u "$SERVICE_USER" -l | grep subscription || echo "No subscription cron jobs found"
else
    crontab -l | grep subscription || echo "No subscription cron jobs found"
fi

echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo -e "${BLUE}📚 Next steps:${NC}"
echo -e "  1. Configure .env.subscription with your actual values"
echo -e "  2. Test the script: python3 subscription_cron.py --help"
echo -e "  3. Monitor logs: tail -f $LOG_DIR/subscription_cron.log"
echo -e "  4. Check cron status: crontab -l"

# Show help
echo -e "${BLUE}📖 Usage:${NC}"
echo -e "  python3 subscription_cron.py --job=recurring_billing --env=$ENVIRONMENT"
echo -e "  python3 subscription_cron.py --job=trial_processing --env=$ENVIRONMENT"
echo -e "  python3 subscription_cron.py --job=payment_retries --env=$ENVIRONMENT"
echo -e "  python3 subscription_cron.py --job=full_cleanup --env=$ENVIRONMENT"
echo -e "  python3 subscription_cron.py --job=monitoring --env=$ENVIRONMENT"
