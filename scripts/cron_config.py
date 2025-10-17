#!/usr/bin/env python3
"""
Cron Configuration for Subscription Management
Provides different cron schedules for different subscription tasks
"""

import os
from typing import Dict, List

class CronConfig:
    """Configuration for subscription cron jobs"""
    
    # Cron schedules (using standard cron format)
    SCHEDULES = {
        # Recurring billing - every 6 hours
        "recurring_billing": "0 */6 * * *",
        
        # Trial period processing - every hour
        "trial_processing": "0 * * * *",
        
        # Payment retries - every 2 hours
        "payment_retries": "0 */2 * * *",
        
        # Full cleanup - daily at 2 AM
        "full_cleanup": "0 2 * * *",
        
        # Monitoring and alerts - every 15 minutes
        "monitoring": "*/15 * * * *"
    }
    
    # Environment-specific configurations
    ENVIRONMENTS = {
        "development": {
            "log_level": "DEBUG",
            "dry_run": True,
            "notifications": False
        },
        "staging": {
            "log_level": "INFO",
            "dry_run": False,
            "notifications": True
        },
        "production": {
            "log_level": "WARNING",
            "dry_run": False,
            "notifications": True
        }
    }
    
    @classmethod
    def get_cron_entries(cls, environment: str = "production") -> List[str]:
        """Get cron entries for all subscription jobs"""
        base_path = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(base_path, "subscription_cron.py")
        python_path = os.getenv("PYTHON_PATH", "python3")
        
        entries = []
        
        for job_name, schedule in cls.SCHEDULES.items():
            # Different schedules for different environments
            if environment == "development":
                # In development, run less frequently
                if job_name == "recurring_billing":
                    schedule = "0 */12 * * *"  # Every 12 hours
                elif job_name == "trial_processing":
                    schedule = "0 */2 * * *"   # Every 2 hours
                elif job_name == "payment_retries":
                    schedule = "0 */4 * * *"   # Every 4 hours
                elif job_name == "monitoring":
                    schedule = "0 */30 * * *"  # Every 30 minutes
            
            # Create cron entry
            cron_entry = f"{schedule} {python_path} {script_path} --job={job_name} --env={environment} >> /var/log/subscription_cron.log 2>&1"
            entries.append(cron_entry)
        
        return entries
    
    @classmethod
    def get_systemd_timers(cls, environment: str = "production") -> Dict[str, str]:
        """Get systemd timer configurations for subscription jobs"""
        base_path = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(base_path, "subscription_cron.py")
        python_path = os.getenv("PYTHON_PATH", "python3")
        
        timers = {}
        
        for job_name, schedule in cls.SCHEDULES.items():
            # Convert cron to systemd format
            systemd_schedule = cls._cron_to_systemd(schedule)
            
            timer_content = f"""[Unit]
Description=Subscription {job_name.replace('_', ' ').title()}
Requires=subscription-{job_name}.service

[Timer]
OnCalendar={systemd_schedule}
Persistent=true

[Install]
WantedBy=timers.target
"""
            
            service_content = f"""[Unit]
Description=Subscription {job_name.replace('_', ' ').title()}
After=network.target

[Service]
Type=oneshot
User=www-data
Group=www-data
WorkingDirectory={base_path}
Environment=PYTHONPATH={base_path}
ExecStart={python_path} {script_path} --job={job_name} --env={environment}
StandardOutput=journal
StandardError=journal
"""
            
            timers[f"subscription-{job_name}.timer"] = timer_content
            timers[f"subscription-{job_name}.service"] = service_content
        
        return timers
    
    @classmethod
    def _cron_to_systemd(cls, cron_schedule: str) -> str:
        """Convert cron schedule to systemd calendar format"""
        parts = cron_schedule.split()
        minute, hour, day, month, weekday = parts
        
        # Handle special cases
        if minute == "*/15":
            return "*-*-* *:0/15:00"
        elif minute == "*/30":
            return "*-*-* *:0/30:00"
        elif hour == "*/2":
            return "*-*-* 0/2:00:00"
        elif hour == "*/4":
            return "*-*-* 0/4:00:00"
        elif hour == "*/6":
            return "*-*-* 0/6:00:00"
        elif hour == "*/12":
            return "*-*-* 0/12:00:00"
        elif hour == "*" and minute == "0":
            return "*-*-* *:00:00"
        elif hour == "2" and minute == "0":
            return "*-*-* 02:00:00"
        else:
            # Default to hourly
            return "*-*-* *:00:00"

def generate_crontab(environment: str = "production") -> str:
    """Generate crontab entries for subscription management"""
    config = CronConfig()
    entries = config.get_cron_entries(environment)
    
    crontab_content = f"""# Subscription Management Cron Jobs - {environment.upper()}
# Generated automatically - do not edit manually

# Environment variables
SUPABASE_URL={os.getenv('SUPABASE_URL', '')}
SUPABASE_SERVICE_ROLE_KEY={os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')}
NETOPIA_API_KEY={os.getenv('NETOPIA_API_KEY', '')}
NETOPIA_SECRET_KEY={os.getenv('NETOPIA_SECRET_KEY', '')}
INTERNAL_API_KEY={os.getenv('INTERNAL_API_KEY', '')}
API_BASE_URL={os.getenv('API_BASE_URL', 'https://api.monitoruloficial.ro')}
DB_HOST={os.getenv('DB_HOST', 'localhost')}
DB_PORT={os.getenv('DB_PORT', '5432')}
DB_NAME={os.getenv('DB_NAME', 'monitoruloficial')}
DB_USER={os.getenv('DB_USER', 'postgres')}
DB_PASSWORD={os.getenv('DB_PASSWORD', '')}

# Cron jobs
"""
    
    for entry in entries:
        crontab_content += f"{entry}\n"
    
    return crontab_content

def generate_systemd_files(environment: str = "production") -> None:
    """Generate systemd timer and service files"""
    config = CronConfig()
    timers = config.get_systemd_timers(environment)
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    systemd_path = os.path.join(base_path, "systemd")
    
    # Create systemd directory
    os.makedirs(systemd_path, exist_ok=True)
    
    # Write timer and service files
    for filename, content in timers.items():
        file_path = os.path.join(systemd_path, filename)
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Generated: {file_path}")

def main():
    """Main function to generate cron configurations"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate cron configurations for subscription management")
    parser.add_argument("--env", default="production", choices=["development", "staging", "production"],
                       help="Environment to generate configuration for")
    parser.add_argument("--format", default="crontab", choices=["crontab", "systemd"],
                       help="Output format")
    parser.add_argument("--output", help="Output file path (default: stdout)")
    
    args = parser.parse_args()
    
    if args.format == "crontab":
        content = generate_crontab(args.env)
    elif args.format == "systemd":
        generate_systemd_files(args.env)
        print("Systemd files generated in ./systemd/ directory")
        return
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(content)
        print(f"Configuration written to {args.output}")
    else:
        print(content)

if __name__ == "__main__":
    main()
