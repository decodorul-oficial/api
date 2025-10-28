#!/bin/bash

# =====================================================
# Daily Digest System - macOS Setup & Management
# =====================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_SCRIPT="$SCRIPT_DIR/daily_digest.py"
LOG_FILE="$HOME/Library/Logs/daily-digest.log"
CRON_SCHEDULE="0 8 * * 1-5" # 8:00 AM, Monday to Friday

# Change to project directory
cd "$PROJECT_DIR"

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    # Load only valid environment variables (those that start with uppercase letters and contain =)
    while IFS= read -r line; do
        # Skip comments and empty lines
        if [[ ! "$line" =~ ^[[:space:]]*# ]] && [[ ! -z "$line" ]]; then
            # Check if line contains = and starts with uppercase letter
            if [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
                export "$line"
            fi
        fi
    done < .env
fi

echo -e "${BLUE}🍎 Daily Digest System for macOS${NC}"
echo "=================================="

# Function to check if Python 3 is available
check_python() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Python 3 is not installed. Please install Python 3 first.${NC}"
        echo "You can install it using Homebrew:"
        echo "  brew install python"
        echo "Or download from: https://python.org/"
        return 1
    fi
    
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✅ Python version: $PYTHON_VERSION${NC}"
    return 0
}

# Function to check if required Python packages are installed
check_python_packages() {
    echo -e "${BLUE}🔍 Checking Python packages...${NC}"
    
    # Check if packages are installed
    if ! python3 -c "import requests" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Installing required Python packages...${NC}"
        pip3 install requests python-dotenv
    fi
    
    if ! python3 -c "import requests" 2>/dev/null; then
        echo -e "${RED}❌ Failed to install required packages. Please install manually:${NC}"
        echo "  pip3 install requests python-dotenv"
        return 1
    fi
    
    echo -e "${GREEN}✅ Python packages are available${NC}"
    return 0
}

# Function to check environment variables
check_environment() {
    echo -e "${BLUE}🔍 Checking environment variables...${NC}"
    
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        echo -e "${RED}❌ Missing required environment variables:${NC}"
        echo "   - SUPABASE_URL"
        echo "   - SUPABASE_SERVICE_ROLE_KEY"
        echo ""
        echo "Please set them in your .env file or export them in your shell."
        return 1
    fi
    
    echo -e "${GREEN}✅ Environment variables are set${NC}"
    echo "   - SUPABASE_URL: ${SUPABASE_URL:0:30}..."
    echo "   - SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:20}..."
    return 0
}

# Function to setup cron job
setup_cron() {
    echo -e "${GREEN}🚀 Setting up daily digest cron job...${NC}"
    
    # Check if Python script exists
    if [ ! -f "$PYTHON_SCRIPT" ]; then
        echo -e "${RED}❌ Python script not found at: $PYTHON_SCRIPT${NC}"
        return 1
    fi
    
    # Make the Python script executable
    chmod +x "$PYTHON_SCRIPT"
    echo -e "${GREEN}✅ Made Python script executable${NC}"
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 644 "$LOG_FILE"
    echo -e "${GREEN}✅ Created log file: $LOG_FILE${NC}"
    
    # Create cron job entry
    CRON_ENTRY="$CRON_SCHEDULE cd $PROJECT_DIR && /usr/bin/python3 $PYTHON_SCRIPT process >> $LOG_FILE 2>&1"
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "daily_digest.py"; then
        echo -e "${YELLOW}⚠️  Daily digest cron job already exists.${NC}"
        echo "Current cron jobs:"
        crontab -l 2>/dev/null | grep "daily_digest.py"
        echo ""
        read -p "Do you want to replace it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Remove existing cron job
            (crontab -l 2>/dev/null | grep -v "daily_digest.py") | crontab -
            echo -e "${GREEN}✅ Removed existing cron job${NC}"
        else
            echo -e "${YELLOW}⚠️  Keeping existing cron job. Setup cancelled.${NC}"
            return 0
        fi
    fi
    
    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo -e "${GREEN}✅ Added daily digest cron job${NC}"
    
    # Display cron job information
    echo ""
    echo -e "${BLUE}📋 Cron Job Details:${NC}"
    echo "   Schedule: $CRON_SCHEDULE (8:00 AM, Monday to Friday)"
    echo "   Script: $PYTHON_SCRIPT"
    echo "   Log file: $LOG_FILE"
    echo "   Working directory: $PROJECT_DIR"
    
    return 0
}

# Function to test the system
test_system() {
    echo -e "${GREEN}🧪 Testing the system...${NC}"
    
    if python3 "$PYTHON_SCRIPT" health; then
        echo -e "${GREEN}✅ System test passed${NC}"
        return 0
    else
        echo -e "${RED}❌ System test failed${NC}"
        return 1
    fi
}

# Function to run test digest
run_test() {
    echo -e "${GREEN}🧪 Running test digest (simulation)...${NC}"
    python3 "$PYTHON_SCRIPT" test
}

# Function to show logs
show_logs() {
    echo -e "${GREEN}📋 Showing recent logs...${NC}"
    if [ -f "$LOG_FILE" ]; then
        tail -n 50 "$LOG_FILE"
    else
        echo -e "${YELLOW}⚠️  No log file found at: $LOG_FILE${NC}"
    fi
}

# Function to show statistics
show_stats() {
    echo -e "${GREEN}📊 Showing digest statistics...${NC}"
    python3 "$PYTHON_SCRIPT" stats
}

# Function to show current crontab
show_crontab() {
    echo -e "${GREEN}📅 Current crontab:${NC}"
    crontab -l 2>/dev/null | grep -E "(daily_digest|#)" || echo "No daily digest cron jobs found"
}

# Function to remove cron job
remove_cron() {
    echo -e "${YELLOW}⚠️  Removing daily digest cron job...${NC}"
    (crontab -l 2>/dev/null | grep -v "daily_digest.py") | crontab -
    echo -e "${GREEN}✅ Cron job removed${NC}"
}

# Function to show help
show_help() {
    echo -e "${BLUE}Available commands:${NC}"
    echo ""
    echo -e "${GREEN}Setup & Configuration:${NC}"
    echo "  setup         - Setup daily digest cron job"
    echo "  remove-cron   - Remove daily digest cron job"
    echo "  crontab       - Show current crontab entries"
    echo ""
    echo -e "${GREEN}Testing & Monitoring:${NC}"
    echo "  test          - Run test digest (simulation)"
    echo "  health        - Run health check"
    echo "  stats         - Show digest statistics"
    echo "  logs          - Show recent logs"
    echo ""
    echo -e "${GREEN}Usage:${NC}"
    echo "  ./scripts/daily_digest_macos.sh [command]"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  ./scripts/daily_digest_macos.sh setup"
    echo "  ./scripts/daily_digest_macos.sh test"
    echo "  ./scripts/daily_digest_macos.sh logs"
}

# Main command handling
case "$1" in
    "setup")
        if check_python && check_python_packages && check_environment; then
            if setup_cron; then
                if test_system; then
                    echo ""
                    echo -e "${GREEN}🎉 Daily Digest System setup completed successfully!${NC}"
                    echo ""
                    echo -e "${BLUE}📝 Next steps:${NC}"
                    echo "1. Monitor the log file: tail -f $LOG_FILE"
                    echo "2. Test manually: ./scripts/daily_digest_macos.sh test"
                    echo "3. Check statistics: ./scripts/daily_digest_macos.sh stats"
                    echo "4. Run health check: ./scripts/daily_digest_macos.sh health"
                else
                    echo -e "${YELLOW}⚠️  Setup completed but system test failed.${NC}"
                    echo "Please check your configuration and run: ./scripts/daily_digest_macos.sh health"
                fi
            fi
        fi
        ;;
    
    "test")
        if check_python && check_environment; then
            run_test
        fi
        ;;
    
    "health")
        if check_python && check_environment; then
            python3 "$PYTHON_SCRIPT" health
        fi
        ;;
    
    "stats")
        if check_python && check_environment; then
            show_stats
        fi
        ;;
    
    "logs")
        show_logs
        ;;
    
    "crontab")
        show_crontab
        ;;
    
    "remove-cron")
        remove_cron
        ;;
    
    "help"|"")
        show_help
        ;;
    
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo "Run './scripts/daily_digest_macos.sh help' to see available commands."
        exit 1
        ;;
esac

