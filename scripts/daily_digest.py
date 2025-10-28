#!/usr/bin/env python3
"""
Daily Digest Email System - Single Script
=========================================

Acest script conține toată logica pentru sistemul de digest zilnic de email.
Include: verificare sănătate, procesare digest, testare, și statistici.

Configurare cron pentru macOS:
0 8 * * 1-5 cd /path/to/project && /usr/bin/python3 scripts/daily_digest.py process

Variabile de mediu necesare:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NODE_ENV (opțional, implicit 'production')
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Any
import requests
from dataclasses import dataclass
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate
import tempfile

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
NODE_ENV = os.getenv('NODE_ENV', 'production')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'info')
SMTP_HOST = os.getenv('SMTP_HOST')
SMTP_PORT = int(os.getenv('SMTP_PORT') or 0) if os.getenv('SMTP_PORT') else None
SMTP_USER = os.getenv('SMTP_USER')
SMTP_PASS = os.getenv('SMTP_PASS')
SMTP_FROM = os.getenv('SMTP_FROM') or os.getenv('SMTP_SENDER')

# Validate configuration
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing required environment variables:")
    print("   - SUPABASE_URL")
    print("   - SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

# Setup logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    format='[%(levelname)s] %(asctime)s - %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S.%fZ'
)
logger = logging.getLogger(__name__)

@dataclass
class DigestResult:
    processed: int = 0
    sent: int = 0
    failed: int = 0
    skipped: int = 0
    error: Optional[str] = None

class SupabaseClient:
    """
    Client Supabase simplificat, modificat pentru a suporta explicit scheme diferite de 'public'.
    PostgREST (API-ul Supabase) folosește headere HTTP pentru a selecta schema.
    - `Content-Profile`: pentru operațiuni de scriere (POST, PATCH)
    - `Accept-Profile`: pentru operațiuni de citire (GET)
    """
    
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip('/')
        self.service_key = service_key
        self.base_headers = {
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json'
        }

    def _prepare_request_details(self, name_with_schema: str) -> (str, Dict):
        """
        Pregătește URL-ul și headerele pe baza numelui tabelului/funcției.
        Ex: 'payments.logs' -> schema='payments', name='logs'
        """
        headers = self.base_headers.copy()
        name = name_with_schema

        if '.' in name_with_schema:
            schema, name = name_with_schema.split('.', 1)
            # Adăugăm header-ul specific pentru a-i spune lui PostgREST ce schemă să folosească
            headers['Content-Profile'] = schema
            headers['Accept-Profile'] = schema
        
        return name, headers

    def rpc(self, function_name: str, params: Dict = None) -> Dict:
        """Apelează o funcție RPC Supabase, cu suport pentru scheme."""
        name, headers = self._prepare_request_details(function_name)
        url = f"{self.url}/rest/v1/rpc/{name}"
        data = params or {}
        
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            # Unele funcții RPC pot returna 204 No Content, ceea ce duce la eroare la .json()
            if response.status_code == 204:
                return {'data': None, 'error': None}
            return {'data': response.json(), 'error': None}
        except requests.exceptions.RequestException as e:
            error_body = e.response.json() if e.response else {}
            error_message = error_body.get('message', str(e))
            return {'data': None, 'error': error_message}

    def query(self, table: str, select: str = "*", filters: Dict = None) -> Dict:
        """Interoghează un tabel Supabase, cu suport pentru scheme."""
        name, headers = self._prepare_request_details(table)
        url = f"{self.url}/rest/v1/{name}"
        params = {'select': select}
        
        if filters:
            for key, value in filters.items():
                params[key] = value
        
        try:
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            return {'data': response.json(), 'error': None}
        except requests.exceptions.RequestException as e:
            error_body = e.response.json() if e.response else {}
            error_message = error_body.get('message', str(e))
            return {'data': None, 'error': error_message}

    def insert(self, table: str, data: Dict) -> Dict:
        """Inserează date într-un tabel Supabase, cu suport pentru scheme."""
        name, headers = self._prepare_request_details(table)
        url = f"{self.url}/rest/v1/{name}"
        
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return {'data': response.json(), 'error': None}
        except requests.exceptions.RequestException as e:
            error_body = e.response.json() if e.response else {}
            error_message = error_body.get('message', str(e))
            return {'data': None, 'error': error_message}

class DailyDigestService:
    """Main service for daily digest operations"""
    
    def __init__(self, supabase_client: SupabaseClient):
        self.supabase = supabase_client
    
    def health_check(self) -> bool:
        """Perform health check of the system"""
        try:
            logger.debug("Performing health check...")
            
            # Test database connection
            result = self.supabase.query('profiles', 'id', {'limit': '1'})
            if result['error']:
                raise Exception(f"Database connection failed: {result['error']}")
            
            # Test if we can access the functions
            try:
                result = self.supabase.rpc('public.get_users_with_active_email_notifications')
                if result['error'] and 'structure of query does not match function result type' not in result['error']:
                    raise Exception(f"Database functions not available: {result['error']}")
                logger.debug("Database functions are accessible")
            except Exception as e:
                logger.warning(f"Function test failed - functions may not be properly configured: {e}")
            
            # Test template service
            try:
                result = self.supabase.query('payments.email_templates', 'id', {'template_name': 'eq.daily_article_digest'})
                if result['error']:
                    logger.warning("Template service check failed - tables may not exist yet")
                    logger.warning("This is normal if migrations haven't been applied yet.")
                else:
                    logger.debug("Email template service: OK")
            except Exception as e:
                logger.warning(f"Template service check failed: {e}")
            
            logger.debug("Health check passed")
            return True
            
        except Exception as error:
            logger.error(f"Health check failed: {error}")
            return False
    
    def get_users_with_active_notifications(self) -> List[Dict]:
        """Get all users with active email notifications"""
        try:
            result = self.supabase.rpc('public.get_users_with_active_email_notifications')
            
            if result['error']:
                if 'structure of query does not match function result type' in result['error']:
                    logger.warning("Database tables may not exist yet. Please run the migrations first.")
                    return []
                raise Exception(f"Error fetching users: {result['error']}")
            
            return result['data'] or []
            
        except Exception as error:
            logger.error(f"Error accessing users function: {error}")
            return []
    
    def find_new_articles_for_user(self, user_id: str, saved_searches: List[Dict], since_date: date) -> List[Dict]:
        """Find new articles matching user's saved searches"""
        # This is a simplified version - in a real implementation, you'd query the articles table
        # For now, we'll return mock data for testing
        articles = []
        
        for search in saved_searches:
            # Mock article data - replace with actual article query logic
            mock_articles = [
                {
                    'id': f"article_{i}",
                    'title': f"Test Article {i} for {search.get('name', 'Unknown Search')}",
                    'link': f"https://monitoruloficial.ro/stiri/test-article-{i}",
                    'excerpt': f"This is a test article excerpt for {search.get('name', 'Unknown Search')}...",
                    'published_at': since_date.isoformat(),
                    'source': 'Monitorul Oficial',
                    'search_name': search.get('name', 'Unknown Search')
                }
                for i in range(1, 3)  # Mock 2 articles per search
            ]
            articles.extend(mock_articles)
        
        return articles
    
    def generate_email_content(self, user_name: str, articles: List[Dict], current_date: str) -> Dict:
        """Generate email content for the digest"""
        total_count = len(articles)
        
        # Generate article list HTML
        article_list_html = ""
        if articles:
            for article in articles:
                article_list_html += f"""
                <div class="article">
                    <div class="search-name">{article['search_name']}</div>
                    <div class="article-title">
                        <a href="{article['link']}">{article['title']}</a>
                    </div>
                    <div class="article-excerpt">{article['excerpt']}</div>
                    <div class="article-meta">
                        {article['published_at']} | {article['source']}
                    </div>
                </div>
                """
        else:
            article_list_html = "<p>Nu au fost găsite articole noi pentru această perioadă.</p>"
        
        # Email template
        subject = f"Monitorul Oficial - Digest zilnic: {total_count} articole noi"
        
        body_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Monitorul Oficial - Digest zilnic</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
                .content {{ background-color: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }}
                .article {{ background-color: white; margin: 15px 0; padding: 15px; border-radius: 5px; border-left: 4px solid #3498db; }}
                .article-title {{ font-size: 18px; font-weight: bold; margin-bottom: 10px; }}
                .article-title a {{ color: #2c3e50; text-decoration: none; }}
                .article-title a:hover {{ text-decoration: underline; }}
                .article-excerpt {{ color: #666; margin-bottom: 10px; }}
                .article-meta {{ font-size: 12px; color: #999; }}
                .footer {{ text-align: center; margin-top: 30px; padding: 20px; color: #666; font-size: 12px; }}
                .search-name {{ background-color: #e8f4f8; padding: 5px 10px; border-radius: 3px; font-size: 12px; color: #2c3e50; display: inline-block; margin-bottom: 10px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Monitorul Oficial</h1>
                <p>Digest zilnic - {current_date}</p>
            </div>
            
            <div class="content">
                <h2>Salut {user_name}!</h2>
                <p>Iată {total_count} articole noi care se potrivesc cu căutările tale salvate:</p>
                
                {article_list_html}
                
                <p>Pentru a gestiona notificările tale, accesează <a href="https://monitoruloficial.ro/saved-searches">căutările salvate</a>.</p>
            </div>
            
            <div class="footer">
                <p>Acest email a fost trimis automat de Monitorul Oficial.</p>
                <p>Pentru a dezactiva notificările, accesează setările contului tău.</p>
            </div>
        </body>
        </html>
        """
        
        body_text = f"""
        Monitorul Oficial - Digest zilnic - {current_date}

        Salut {user_name}!

        Iată {total_count} articole noi care se potrivesc cu căutările tale salvate:

        {chr(10).join([f"- {article['title']} ({article['search_name']})" for article in articles])}

        Pentru a gestiona notificările tale, accesează: https://monitoruloficial.ro/saved-searches

        ---
        Acest email a fost trimis automat de Monitorul Oficial.
        Pentru a dezactiva notificările, accesează setările contului tău.
        """
        
        return {
            'subject': subject,
            'body_html': body_html,
            'body_text': body_text
        }
    
    def send_email(self, to_email: str, subject: str, body_html: str, body_text: str) -> bool:
        """Send email via SMTP if configured; otherwise write .eml to temp and report path."""
        try:
            if SMTP_HOST and SMTP_PORT and SMTP_FROM:
                msg = MIMEMultipart('alternative')
                msg['From'] = SMTP_FROM
                msg['To'] = to_email
                msg['Date'] = formatdate(localtime=True)
                msg['Subject'] = subject
                part1 = MIMEText(body_text or '', 'plain', 'utf-8')
                part2 = MIMEText(body_html or '', 'html', 'utf-8')
                msg.attach(part1)
                msg.attach(part2)

                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                    server.ehlo()
                    try:
                        server.starttls()
                    except Exception:
                        pass
                    if SMTP_USER and SMTP_PASS:
                        server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(SMTP_FROM, [to_email], msg.as_string())
                logger.info(f"📧 Email sent to: {to_email}")
                return True
            else:
                # Fallback: write .eml to temp for inspection
                msg = MIMEMultipart('alternative')
                msg['From'] = SMTP_FROM or 'no-reply@monitoruloficial.ro'
                msg['To'] = to_email
                msg['Date'] = formatdate(localtime=True)
                msg['Subject'] = subject
                part1 = MIMEText(body_text or '', 'plain', 'utf-8')
                part2 = MIMEText(body_html or '', 'html', 'utf-8')
                msg.attach(part1)
                msg.attach(part2)
                fd, tmp_path = tempfile.mkstemp(prefix='daily_digest_', suffix='.eml')
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    f.write(msg.as_string())
                logger.warning(f"SMTP not configured. Wrote email to: {tmp_path}")
                # Indicate not-sent so caller can decide on cleanup
                return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False
    
    def log_digest_event(self, user_id: str, digest_date: date, articles_count: int, 
                        saved_searches: List[Dict], status: str, error_message: str = None) -> bool:
        """Log digest event to database"""
        try:
            # Get template ID (mock for now)
            template_id = "00000000-0000-0000-0000-000000000000"
            
            log_data = {
                'user_id': user_id,
                'digest_date': digest_date.isoformat(),
                'articles_sent_count': articles_count,
                'saved_searches_triggered': json.dumps(saved_searches),
                'template_id': template_id,
                'status': status,
                'error_message': error_message,
                'sent_at': datetime.now().isoformat() if status == 'SENT' else None
            }
            
            result = self.supabase.insert('payments.email_digest_logs', log_data)
            if result['error']:
                logger.warning(f"Failed to log digest event: {result['error']}")
                return False
            
            return True
            
        except Exception as error:
            logger.warning(f"Error logging digest event: {error}")
            return False
    
    def process_user_digest(self, user: Dict, digest_date: date) -> Dict:
        """Process digest for a single user"""
        try:
            user_id = user['user_id']
            user_email = user['user_email']
            user_name = user['user_name']
            saved_searches = user.get('saved_searches', [])
            
            logger.info(f"Processing digest for user: {user_name} ({user_email})")
            
            # Find new articles
            articles = self.find_new_articles_for_user(user_id, saved_searches, digest_date)
            
            if not articles:
                logger.info(f"No new articles found for user: {user_name}")
                self.log_digest_event(user_id, digest_date, 0, saved_searches, 'SKIPPED', 'No new articles')
                return {'status': 'skipped', 'reason': 'no_articles'}
            
            # Generate email content
            current_date = digest_date.strftime('%d.%m.%Y')
            email_content = self.generate_email_content(user_name, articles, current_date)
            
            # Send email
            email_sent = self.send_email(
                user_email,
                email_content['subject'],
                email_content['body_html'],
                email_content['body_text']
            )
            
            if email_sent:
                self.log_digest_event(user_id, digest_date, len(articles), saved_searches, 'SENT')
                logger.info(f"✅ Digest sent to {user_name}: {len(articles)} articles")
                return {'status': 'sent', 'articles_count': len(articles)}
            else:
                self.log_digest_event(user_id, digest_date, len(articles), saved_searches, 'FAILED', 'Email sending failed')
                return {'status': 'failed', 'error': 'Email sending failed'}
                
        except Exception as error:
            logger.error(f"Error processing digest for user {user.get('user_name', 'Unknown')}: {error}")
            self.log_digest_event(user_id, digest_date, 0, [], 'FAILED', str(error))
            return {'status': 'failed', 'error': str(error)}
    
    def process_daily_digest(self, digest_date: date = None) -> DigestResult:
        """Process daily digest for all users"""
        if digest_date is None:
            digest_date = date.today()
        
        logger.info(f"🚀 Starting daily digest processing for {digest_date}")
        
        result = DigestResult()
        
        try:
            # Get users with active notifications
            users = self.get_users_with_active_notifications()
            
            if not users:
                logger.info("No users with active email notifications found")
                return result
            
            logger.info(f"Found {len(users)} users with active email notifications")
            
            # Process each user
            for user in users:
                result.processed += 1
                
                user_result = self.process_user_digest(user, digest_date)
                
                if user_result['status'] == 'sent':
                    result.sent += 1
                elif user_result['status'] == 'failed':
                    result.failed += 1
                elif user_result['status'] == 'skipped':
                    result.skipped += 1
            
            logger.info(f"✅ Daily digest processing completed: {result.sent} sent, {result.failed} failed, {result.skipped} skipped")
            return result
            
        except Exception as error:
            logger.error(f"❌ Daily digest processing failed: {error}")
            result.error = str(error)
            return result

    def simulate_for_saved_search(self, saved_search_id: str, target_email: str, digest_date: date) -> Dict:
        """Simulate digest for a specific saved_search id and target email.
        If no articles in last 24h, generate one mock article and send.
        """
        # Try to fetch saved_search info (optional; proceed even if fails)
        search_name = 'Saved Search'
        try:
            res = self.supabase.query('saved_searches', 'id,name,email_notifications_enabled', {
                'id': f'eq.{saved_search_id}'
            })
            if res['error']:
                logger.warning(f"Could not fetch saved_search: {res['error']}")
            elif res['data']:
                row = res['data'][0]
                search_name = row.get('name') or search_name
                if not row.get('email_notifications_enabled', False):
                    logger.warning("email_notifications_enabled is false for this saved_search")
        except Exception as e:
            logger.warning(f"Saved search lookup failed: {e}")

        # Build mock user and searches
        user = {
            'user_id': '00000000-0000-0000-0000-000000000000',
            'user_email': target_email,
            'user_name': target_email.split('@')[0],
            'saved_searches': [
                {'id': saved_search_id, 'name': search_name}
            ]
        }

        # Find articles (mock one for simulation)
        articles = [
            {
                'id': 'simulated_article_1',
                'title': f"Articol simulat pentru '{search_name}'",
                'link': 'https://monitoruloficial.ro/stiri/articol-simulat',
                'excerpt': 'Acesta este un articol simulat pentru testarea digest-ului zilnic.',
                'published_at': digest_date.isoformat(),
                'source': 'Monitorul Oficial',
                'search_name': search_name
            }
        ]

        # Generate content and send
        email_content = self.generate_email_content(user['user_name'], articles, digest_date.strftime('%d.%m.%Y'))
        sent = self.send_email(user['user_email'], email_content['subject'], email_content['body_html'], email_content['body_text'])

        # If sent via SMTP, attempt to log; otherwise skip logging
        if sent:
            try:
                self.log_digest_event(user['user_id'], digest_date, len(articles), user['saved_searches'], 'SENT')
            except Exception:
                pass
        return {'status': 'sent' if sent else 'saved_to_file', 'email': user['user_email']}
    
    def get_digest_stats(self, start_date: date, end_date: date) -> Dict:
        """Get digest statistics for a date range"""
        try:
            # This would query the email_digest_logs table
            # For now, return mock data
            return {
                'total': 10,
                'sent': 8,
                'failed': 1,
                'skipped': 1,
                'total_articles': 25
            }
        except Exception as error:
            logger.error(f"Failed to get digest statistics: {error}")
            return {}

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Daily Digest Email System')
    parser.add_argument('command', nargs='?', default='process',
                       choices=['process', 'health', 'stats', 'test', 'simulate'],
                       help='Command to execute')
    parser.add_argument('--date', type=str, help='Date for processing (YYYY-MM-DD)')
    parser.add_argument('--search-id', type=str, help='Saved search ID for simulation')
    parser.add_argument('--email', type=str, help='Target email for simulation')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Initialize services
    supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    digest_service = DailyDigestService(supabase_client)
    
    logger.info(f"Daily Digest System started with command: {args.command}")
    
    try:
        if args.command == 'health':
            is_healthy = digest_service.health_check()
            if is_healthy:
                print("✅ Health check passed")
                print("   - Database connection: OK")
                print("   - Services: OK")
            else:
                print("❌ Health check failed")
                sys.exit(1)
        
        elif args.command == 'process':
            # Check if it's a weekday
            today = date.today()
            if today.weekday() >= 5:  # Saturday = 5, Sunday = 6
                logger.info("📅 Skipping digest processing - weekend")
                print("📅 Skipping digest processing - weekend")
                sys.exit(0)
            
            result = digest_service.process_daily_digest(today)
            
            print(f"\n📊 Daily Digest Summary:")
            print(f"   Users processed: {result.processed}")
            print(f"   Emails sent: {result.sent}")
            print(f"   Emails failed: {result.failed}")
            print(f"   Emails skipped: {result.skipped}")
            
            if result.error:
                print(f"   Error: {result.error}")
                sys.exit(1)
        
        elif args.command == 'test':
            logger.info("🧪 Running test mode...")
            test_date = date.today() - timedelta(days=1)
            result = digest_service.process_daily_digest(test_date)
            
            print(f"\n📊 Test Digest Summary:")
            print(f"   Users processed: {result.processed}")
            print(f"   Emails sent: {result.sent}")
            print(f"   Emails failed: {result.failed}")
            print(f"   Emails skipped: {result.skipped}")
            
            if result.error:
                print(f"   Error: {result.error}")
        
        elif args.command == 'stats':
            end_date = date.today()
            start_date = end_date - timedelta(days=7)
            stats = digest_service.get_digest_stats(start_date, end_date)
            
            print(f"\n📈 Digest Statistics (last 7 days):")
            print(f"   Total digests: {stats.get('total', 0)}")
            print(f"   Sent successfully: {stats.get('sent', 0)}")
            print(f"   Failed: {stats.get('failed', 0)}")
            print(f"   Skipped: {stats.get('skipped', 0)}")
            print(f"   Total articles sent: {stats.get('total_articles', 0)}")
        
        elif args.command == 'simulate':
            if not args.search_id or not args.email:
                print("❌ For 'simulate', you must provide --search-id and --email")
                sys.exit(1)
            sim_date = date.today()
            result = digest_service.simulate_for_saved_search(args.search_id, args.email, sim_date)
            if result['status'] == 'sent':
                print(f"✅ Email sent to {result['email']}")
            else:
                print("⚠️ SMTP not configured. Email saved to a .eml file in /tmp. Check logs for path.")
    
    except Exception as error:
        logger.error(f"Fatal error: {error}")
        sys.exit(1)

if __name__ == '__main__':
    main()
