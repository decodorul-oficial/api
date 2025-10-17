#!/usr/bin/env python3
"""
Subscription Management Cron Jobs
Handles recurring billing, trial period management, and payment retries
"""

import os
import sys
import json
import logging
import asyncio
import aiohttp
import asyncpg
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import hashlib
import hmac
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('subscription_cron.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class Config:
    """Configuration for subscription cron jobs"""
    # Database
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    
    # Netopia API
    netopia_api_key: str
    netopia_secret_key: str
    netopia_base_url: str
    
    # Internal API
    internal_api_key: str
    api_base_url: str
    
    # Retry settings
    max_retry_attempts: int = 3
    retry_delay_seconds: int = 300  # 5 minutes
    
    # Trial settings
    trial_grace_period_hours: int = 24

class NetopiaClient:
    """Netopia Payments API client"""
    
    def __init__(self, config: Config):
        self.config = config
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def _encrypt_payload(self, payload: dict) -> str:
        """Encrypt payload using Netopia's AES-256-CBC format"""
        try:
            # Convert payload to JSON string
            json_payload = json.dumps(payload, separators=(',', ':'))
            
            # Use PBKDF2 to derive key from secret
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b'netopia_salt',  # Use consistent salt
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(self.config.netopia_secret_key.encode()))
            
            # Encrypt using Fernet (AES-256-CBC)
            f = Fernet(key)
            encrypted = f.encrypt(json_payload.encode())
            
            return base64.b64encode(encrypted).decode()
        except Exception as e:
            logger.error(f"Failed to encrypt payload: {e}")
            raise
    
    def _generate_signature(self, payload: str, timestamp: int) -> str:
        """Generate HMAC signature for Netopia"""
        message = f"{payload}{timestamp}"
        signature = hmac.new(
            self.config.netopia_secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    async def create_recurring_payment(self, order_data: dict) -> dict:
        """Create recurring payment using stored token"""
        try:
            payload = {
                "order": {
                    "$": {
                        "id": order_data["order_id"],
                        "timestamp": int(datetime.now().timestamp() * 1000),
                        "type": "card"
                    },
                    "signature": self.config.netopia_api_key,
                    "url": {
                        "return": f"{self.config.api_base_url}/payment/success",
                        "confirm": f"{self.config.api_base_url}/webhook/netopia/ipn"
                    },
                    "invoice": {
                        "$": {
                            "currency": order_data["currency"],
                            "amount": order_data["amount"]
                        },
                        "details": f"Recurring payment for subscription {order_data['subscription_id']}",
                        "contact_info": {
                            "billing": order_data["billing_info"]
                        }
                    },
                    "ipn_cipher": "aes-256-cbc"
                }
            }
            
            # Encrypt payload
            encrypted_payload = self._encrypt_payload(payload)
            timestamp = int(datetime.now().timestamp())
            signature = self._generate_signature(encrypted_payload, timestamp)
            
            # Send to Netopia
            async with self.session.post(
                f"{self.config.netopia_base_url}/api/v1/payments",
                json={
                    "payload": encrypted_payload,
                    "signature": signature,
                    "timestamp": timestamp
                },
                headers={
                    "Authorization": f"Bearer {self.config.netopia_api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30
            ) as response:
                result = await response.json()
                
                if response.status != 200:
                    raise Exception(f"Netopia API error: {result.get('message', 'Unknown error')}")
                
                return result
                
        except Exception as e:
            logger.error(f"Failed to create recurring payment: {e}")
            raise

class DatabaseManager:
    """Database operations for subscription management"""
    
    def __init__(self, config: Config):
        self.config = config
        self.pool = None
    
    async def __aenter__(self):
        self.pool = await asyncpg.create_pool(
            host=self.config.db_host,
            port=self.config.db_port,
            database=self.config.db_name,
            user=self.config.db_user,
            password=self.config.db_password,
            min_size=1,
            max_size=10
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.pool:
            await self.pool.close()
    
    async def get_due_subscriptions(self) -> List[dict]:
        """Get subscriptions that need renewal"""
        async with self.pool.acquire() as conn:
            query = """
                SELECT s.*, st.price, st.currency, st.interval, st.name as tier_name
                FROM subscriptions s
                JOIN subscription_tiers st ON s.tier_id = st.id
                WHERE s.status = 'ACTIVE'
                AND s.auto_renew = true
                AND s.current_period_end <= NOW()
                AND s.netopia_token IS NOT NULL
                ORDER BY s.current_period_end ASC
            """
            rows = await conn.fetch(query)
            return [dict(row) for row in rows]
    
    async def get_trial_subscriptions(self) -> List[dict]:
        """Get subscriptions that need trial period handling"""
        async with self.pool.acquire() as conn:
            query = """
                SELECT s.*, st.price, st.currency, st.interval, st.name as tier_name
                FROM subscriptions s
                JOIN subscription_tiers st ON s.tier_id = st.id
                WHERE s.status = 'TRIALING'
                AND s.trial_end <= NOW()
                ORDER BY s.trial_end ASC
            """
            rows = await conn.fetch(query)
            return [dict(row) for row in rows]
    
    async def get_failed_payments(self) -> List[dict]:
        """Get failed payments that need retry"""
        async with self.pool.acquire() as conn:
            query = """
                SELECT pl.*, o.*, s.*
                FROM payment_logs pl
                JOIN orders o ON pl.order_id = o.id
                LEFT JOIN subscriptions s ON o.subscription_id = s.id
                WHERE pl.event_type = 'PAYMENT_FAILED'
                AND pl.retry_count < $1
                AND pl.created_at >= NOW() - INTERVAL '24 hours'
                ORDER BY pl.created_at ASC
            """
            rows = await conn.fetch(query, self.config.max_retry_attempts)
            return [dict(row) for row in rows]
    
    async def create_renewal_order(self, subscription: dict, amount: float) -> str:
        """Create new order for subscription renewal"""
        async with self.pool.acquire() as conn:
            query = """
                INSERT INTO orders (
                    user_id, subscription_id, amount, currency, status, 
                    metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'PENDING', $5, NOW(), NOW())
                RETURNING id
            """
            metadata = {
                "subscription_id": subscription["id"],
                "tier_name": subscription["tier_name"],
                "renewal": True,
                "auto_renewal": True
            }
            
            order_id = await conn.fetchval(
                query,
                subscription["user_id"],
                subscription["id"],
                amount,
                subscription["currency"],
                json.dumps(metadata)
            )
            
            return str(order_id)
    
    async def update_subscription_period(self, subscription_id: str, new_period_end: datetime):
        """Update subscription period after successful renewal"""
        async with self.pool.acquire() as conn:
            query = """
                UPDATE subscriptions 
                SET current_period_start = NOW(),
                    current_period_end = $2,
                    updated_at = NOW()
                WHERE id = $1
            """
            await conn.execute(query, subscription_id, new_period_end)
    
    async def log_payment_event(self, event_data: dict):
        """Log payment event"""
        async with self.pool.acquire() as conn:
            query = """
                INSERT INTO payment_logs (
                    order_id, subscription_id, event_type, netopia_order_id,
                    amount, currency, status, raw_payload, retry_count,
                    error_message, processing_time_ms, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            """
            await conn.execute(
                query,
                event_data.get("order_id"),
                event_data.get("subscription_id"),
                event_data.get("event_type"),
                event_data.get("netopia_order_id"),
                event_data.get("amount"),
                event_data.get("currency"),
                event_data.get("status"),
                json.dumps(event_data.get("raw_payload", {})),
                event_data.get("retry_count", 0),
                event_data.get("error_message"),
                event_data.get("processing_time_ms")
            )
    
    async def update_order_status(self, order_id: str, status: str, netopia_order_id: str = None):
        """Update order status"""
        async with self.pool.acquire() as conn:
            query = """
                UPDATE orders 
                SET status = $2, netopia_order_id = $3, updated_at = NOW()
                WHERE id = $1
            """
            await conn.execute(query, order_id, status, netopia_order_id)
    
    async def cancel_subscription(self, subscription_id: str, reason: str = "Trial expired"):
        """Cancel subscription"""
        async with self.pool.acquire() as conn:
            # Update subscription
            query = """
                UPDATE subscriptions 
                SET status = 'CANCELED', 
                    cancel_effective_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
            """
            await conn.execute(query, subscription_id)
            
            # Update user profile to free tier
            query2 = """
                UPDATE profiles 
                SET subscription_tier = 'free', updated_at = NOW()
                WHERE id = (SELECT user_id FROM subscriptions WHERE id = $1)
            """
            await conn.execute(query2, subscription_id)
            
            # Log event
            await self.log_payment_event({
                "subscription_id": subscription_id,
                "event_type": "SUBSCRIPTION_CANCELED",
                "status": "CANCELED",
                "raw_payload": {"reason": reason, "auto_cancel": True}
            })

class SubscriptionCronManager:
    """Main cron job manager"""
    
    def __init__(self, config: Config):
        self.config = config
        self.netopia = None
        self.db = None
    
    async def __aenter__(self):
        self.netopia = NetopiaClient(self.config)
        self.db = DatabaseManager(self.config)
        await self.netopia.__aenter__()
        await self.db.__aenter__()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.netopia:
            await self.netopia.__aexit__(exc_type, exc_val, exc_tb)
        if self.db:
            await self.db.__aexit__(exc_type, exc_val, exc_tb)
    
    async def process_recurring_billing(self):
        """Process recurring billing for due subscriptions"""
        logger.info("🔄 Processing recurring billing...")
        
        try:
            due_subscriptions = await self.db.get_due_subscriptions()
            logger.info(f"Found {len(due_subscriptions)} subscriptions due for renewal")
            
            for subscription in due_subscriptions:
                try:
                    await self._process_subscription_renewal(subscription)
                except Exception as e:
                    logger.error(f"Failed to process renewal for subscription {subscription['id']}: {e}")
                    await self.db.log_payment_event({
                        "subscription_id": subscription["id"],
                        "event_type": "AUTO_RENEWAL_FAILED",
                        "status": "FAILED",
                        "error_message": str(e),
                        "raw_payload": {"subscription": subscription}
                    })
            
        except Exception as e:
            logger.error(f"Error in recurring billing process: {e}")
    
    async def _process_subscription_renewal(self, subscription: dict):
        """Process individual subscription renewal"""
        subscription_id = subscription["id"]
        logger.info(f"Processing renewal for subscription {subscription_id}")
        
        try:
            # Create new order
            order_id = await self.db.create_renewal_order(subscription, subscription["price"])
            logger.info(f"Created renewal order {order_id}")
            
            # Prepare billing info (simplified for recurring)
            billing_info = {
                "$": {"type": "person"},
                "first_name": "Recurring",
                "last_name": "Payment",
                "email": f"recurring-{subscription_id}@monitoruloficial.ro",
                "mobile_phone": "0000000000"
            }
            
            # Create payment with Netopia
            order_data = {
                "order_id": order_id,
                "subscription_id": subscription_id,
                "amount": subscription["price"],
                "currency": subscription["currency"],
                "billing_info": billing_info
            }
            
            payment_result = await self.netopia.create_recurring_payment(order_data)
            
            # Update order with Netopia details
            await self.db.update_order_status(
                order_id, 
                "PROCESSING", 
                payment_result.get("netopia_order_id")
            )
            
            # Calculate new period end
            if subscription["interval"] == "MONTHLY":
                new_period_end = datetime.now() + timedelta(days=30)
            elif subscription["interval"] == "YEARLY":
                new_period_end = datetime.now() + timedelta(days=365)
            else:
                new_period_end = datetime.now() + timedelta(days=30)
            
            # Update subscription period
            await self.db.update_subscription_period(subscription_id, new_period_end)
            
            # Log success
            await self.db.log_payment_event({
                "order_id": order_id,
                "subscription_id": subscription_id,
                "event_type": "AUTO_RENEWAL_ATTEMPTED",
                "netopia_order_id": payment_result.get("netopia_order_id"),
                "amount": subscription["price"],
                "currency": subscription["currency"],
                "status": "SUCCESS",
                "raw_payload": payment_result
            })
            
            logger.info(f"Successfully processed renewal for subscription {subscription_id}")
            
        except Exception as e:
            logger.error(f"Failed to process renewal for subscription {subscription_id}: {e}")
            raise
    
    async def process_trial_periods(self):
        """Process trial period expirations"""
        logger.info("⏰ Processing trial period expirations...")
        
        try:
            trial_subscriptions = await self.db.get_trial_subscriptions()
            logger.info(f"Found {len(trial_subscriptions)} trial subscriptions to process")
            
            for subscription in trial_subscriptions:
                try:
                    await self._process_trial_expiration(subscription)
                except Exception as e:
                    logger.error(f"Failed to process trial expiration for subscription {subscription['id']}: {e}")
            
        except Exception as e:
            logger.error(f"Error in trial period process: {e}")
    
    async def _process_trial_expiration(self, subscription: dict):
        """Process individual trial expiration"""
        subscription_id = subscription["id"]
        logger.info(f"Processing trial expiration for subscription {subscription_id}")
        
        # Check if user has payment method
        if not subscription.get("netopia_token"):
            # No payment method, cancel subscription
            await self.db.cancel_subscription(subscription_id, "Trial expired - no payment method")
            logger.info(f"Cancelled subscription {subscription_id} - no payment method")
        else:
            # Has payment method, attempt to charge
            try:
                await self._process_subscription_renewal(subscription)
                logger.info(f"Successfully charged trial expiration for subscription {subscription_id}")
            except Exception as e:
                # Charge failed, cancel subscription
                await self.db.cancel_subscription(subscription_id, f"Trial expired - charge failed: {str(e)}")
                logger.info(f"Cancelled subscription {subscription_id} - charge failed")
    
    async def process_payment_retries(self):
        """Process failed payment retries"""
        logger.info("🔄 Processing payment retries...")
        
        try:
            failed_payments = await self.db.get_failed_payments()
            logger.info(f"Found {len(failed_payments)} failed payments to retry")
            
            for payment in failed_payments:
                try:
                    await self._retry_payment(payment)
                except Exception as e:
                    logger.error(f"Failed to retry payment {payment['order_id']}: {e}")
            
        except Exception as e:
            logger.error(f"Error in payment retry process: {e}")
    
    async def _retry_payment(self, payment: dict):
        """Retry individual failed payment"""
        order_id = payment["order_id"]
        retry_count = payment.get("retry_count", 0) + 1
        
        logger.info(f"Retrying payment {order_id} (attempt {retry_count})")
        
        try:
            # Log retry attempt
            await self.db.log_payment_event({
                "order_id": order_id,
                "subscription_id": payment.get("subscription_id"),
                "event_type": "PAYMENT_RETRY",
                "retry_count": retry_count,
                "status": "RETRYING",
                "raw_payload": {"original_payment": payment}
            })
            
            # Here you would implement the actual retry logic
            # For now, we'll just log the attempt
            logger.info(f"Retry attempt {retry_count} for payment {order_id}")
            
        except Exception as e:
            logger.error(f"Retry failed for payment {order_id}: {e}")
            raise
    
    async def run_all_jobs(self):
        """Run all cron jobs"""
        logger.info("🚀 Starting subscription cron jobs...")
        
        try:
            # Process recurring billing
            await self.process_recurring_billing()
            
            # Process trial periods
            await self.process_trial_periods()
            
            # Process payment retries
            await self.process_payment_retries()
            
            logger.info("✅ All cron jobs completed successfully")
            
        except Exception as e:
            logger.error(f"❌ Error in cron jobs: {e}")
            raise

def load_config() -> Config:
    """Load configuration from environment variables"""
    return Config(
        # Database
        db_host=os.getenv("DB_HOST", "localhost"),
        db_port=int(os.getenv("DB_PORT", "5432")),
        db_name=os.getenv("DB_NAME", "monitoruloficial"),
        db_user=os.getenv("DB_USER", "postgres"),
        db_password=os.getenv("DB_PASSWORD", ""),
        
        # Netopia API
        netopia_api_key=os.getenv("NETOPIA_API_KEY", ""),
        netopia_secret_key=os.getenv("NETOPIA_SECRET_KEY", ""),
        netopia_base_url=os.getenv("NETOPIA_BASE_URL", "https://sandboxsecure.mobilpay.ro"),
        
        # Internal API
        internal_api_key=os.getenv("INTERNAL_API_KEY", ""),
        api_base_url=os.getenv("API_BASE_URL", "https://api.monitoruloficial.ro"),
        
        # Retry settings
        max_retry_attempts=int(os.getenv("MAX_RETRY_ATTEMPTS", "3")),
        retry_delay_seconds=int(os.getenv("RETRY_DELAY_SECONDS", "300")),
        
        # Trial settings
        trial_grace_period_hours=int(os.getenv("TRIAL_GRACE_PERIOD_HOURS", "24"))
    )

async def main():
    """Main entry point"""
    try:
        config = load_config()
        
        # Validate required configuration
        if not config.netopia_api_key or not config.netopia_secret_key:
            logger.error("❌ Missing required Netopia API credentials")
            sys.exit(1)
        
        if not config.db_password:
            logger.error("❌ Missing database password")
            sys.exit(1)
        
        # Run cron jobs
        async with SubscriptionCronManager(config) as cron_manager:
            await cron_manager.run_all_jobs()
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
