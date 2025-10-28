#!/usr/bin/env python3
"""
Test script for Subscription Management Cron Jobs
Tests all functionality without making actual API calls
"""

import os
import sys
import asyncio
import logging
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock

# Add the scripts directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from subscription_cron import SubscriptionCronManager, Config, DatabaseManager, NetopiaClient

# Configure logging for tests
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TestConfig(Config):
    """Test configuration with mock values"""
    def __init__(self):
        super().__init__(
            db_host="localhost",
            db_port=5432,
            db_name="test_db",
            db_user="test_user",
            db_password="test_password",
            netopia_api_key="test_api_key",
            netopia_secret_key="test_secret_key",
            netopia_base_url="https://test.mobilpay.ro",
            internal_api_key="test_internal_key",
            api_base_url="https://test.api.com"
        )

class MockDatabaseManager(DatabaseManager):
    """Mock database manager for testing"""
    
    def __init__(self, config: Config):
        self.config = config
        self.mock_data = {
            "due_subscriptions": [
                {
                    "id": "sub_1",
                    "user_id": "user_1",
                    "tier_id": "tier_1",
                    "price": 29.99,
                    "currency": "RON",
                    "interval": "MONTHLY",
                    "tier_name": "pro",
                    "netopia_token": "token_123",
                    "current_period_end": datetime.now() - timedelta(days=1)
                }
            ],
            "trial_subscriptions": [
                {
                    "id": "sub_2",
                    "user_id": "user_2",
                    "tier_id": "tier_1",
                    "price": 29.99,
                    "currency": "RON",
                    "interval": "MONTHLY",
                    "tier_name": "pro",
                    "netopia_token": None,
                    "trial_end": datetime.now() - timedelta(hours=1)
                }
            ],
            "failed_payments": [
                {
                    "order_id": "order_1",
                    "subscription_id": "sub_1",
                    "retry_count": 1,
                    "created_at": datetime.now() - timedelta(hours=2)
                }
            ]
        }
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
    
    async def get_due_subscriptions(self):
        """Mock get due subscriptions"""
        logger.info(f"Mock: Found {len(self.mock_data['due_subscriptions'])} due subscriptions")
        return self.mock_data["due_subscriptions"]
    
    async def get_trial_subscriptions(self):
        """Mock get trial subscriptions"""
        logger.info(f"Mock: Found {len(self.mock_data['trial_subscriptions'])} trial subscriptions")
        return self.mock_data["trial_subscriptions"]
    
    async def get_failed_payments(self):
        """Mock get failed payments"""
        logger.info(f"Mock: Found {len(self.mock_data['failed_payments'])} failed payments")
        return self.mock_data["failed_payments"]
    
    async def create_renewal_order(self, subscription, amount):
        """Mock create renewal order"""
        order_id = f"order_renewal_{subscription['id']}_{int(datetime.now().timestamp())}"
        logger.info(f"Mock: Created renewal order {order_id} for subscription {subscription['id']}")
        return order_id
    
    async def update_subscription_period(self, subscription_id, new_period_end):
        """Mock update subscription period"""
        logger.info(f"Mock: Updated subscription {subscription_id} period to {new_period_end}")
    
    async def log_payment_event(self, event_data):
        """Mock log payment event"""
        logger.info(f"Mock: Logged payment event: {event_data['event_type']}")
    
    async def update_order_status(self, order_id, status, netopia_order_id=None):
        """Mock update order status"""
        logger.info(f"Mock: Updated order {order_id} status to {status}")
    
    async def cancel_subscription(self, subscription_id, reason):
        """Mock cancel subscription"""
        logger.info(f"Mock: Cancelled subscription {subscription_id} - {reason}")

class MockNetopiaClient(NetopiaClient):
    """Mock Netopia client for testing"""
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
    
    async def create_recurring_payment(self, order_data):
        """Mock create recurring payment"""
        logger.info(f"Mock: Created recurring payment for order {order_data['order_id']}")
        return {
            "success": True,
            "netopia_order_id": f"netopia_{order_data['order_id']}",
            "status": "PROCESSING"
        }

class TestSubscriptionCronManager(SubscriptionCronManager):
    """Test subscription cron manager with mocked dependencies"""
    
    def __init__(self, config: Config):
        super().__init__(config)
        self.db = MockDatabaseManager(config)
        self.netopia = MockNetopiaClient(config)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

async def test_recurring_billing():
    """Test recurring billing functionality"""
    logger.info("🧪 Testing recurring billing...")
    
    config = TestConfig()
    async with TestSubscriptionCronManager(config) as cron_manager:
        await cron_manager.process_recurring_billing()
    
    logger.info("✅ Recurring billing test completed")

async def test_trial_processing():
    """Test trial processing functionality"""
    logger.info("🧪 Testing trial processing...")
    
    config = TestConfig()
    async with TestSubscriptionCronManager(config) as cron_manager:
        await cron_manager.process_trial_periods()
    
    logger.info("✅ Trial processing test completed")

async def test_payment_retries():
    """Test payment retry functionality"""
    logger.info("🧪 Testing payment retries...")
    
    config = TestConfig()
    async with TestSubscriptionCronManager(config) as cron_manager:
        await cron_manager.process_payment_retries()
    
    logger.info("✅ Payment retries test completed")

async def test_full_workflow():
    """Test complete workflow"""
    logger.info("🧪 Testing full workflow...")
    
    config = TestConfig()
    async with TestSubscriptionCronManager(config) as cron_manager:
        await cron_manager.run_all_jobs()
    
    logger.info("✅ Full workflow test completed")

def test_config_loading():
    """Test configuration loading"""
    logger.info("🧪 Testing configuration loading...")
    
    # Test with environment variables
    os.environ["DB_HOST"] = "test_host"
    os.environ["DB_PORT"] = "5433"
    os.environ["NETOPIA_API_KEY"] = "test_key"
    
    from subscription_cron import load_config
    config = load_config()
    
    assert config.db_host == "test_host"
    assert config.db_port == 5433
    assert config.netopia_api_key == "test_key"
    
    logger.info("✅ Configuration loading test completed")

def test_cron_schedule_generation():
    """Test cron schedule generation"""
    logger.info("🧪 Testing cron schedule generation...")
    
    from cron_config import CronConfig
    
    # Test crontab generation
    entries = CronConfig.get_cron_entries("production")
    assert len(entries) == 5  # Should have 5 different cron jobs
    
    # Test systemd generation
    timers = CronConfig.get_systemd_timers("production")
    assert len(timers) == 10  # Should have 5 timers + 5 services
    
    logger.info("✅ Cron schedule generation test completed")

async def run_all_tests():
    """Run all tests"""
    logger.info("🚀 Starting subscription cron tests...")
    
    try:
        # Test configuration
        test_config_loading()
        test_cron_schedule_generation()
        
        # Test individual components
        await test_recurring_billing()
        await test_trial_processing()
        await test_payment_retries()
        
        # Test full workflow
        await test_full_workflow()
        
        logger.info("🎉 All tests completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        raise

def main():
    """Main test function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test subscription cron functionality")
    parser.add_argument("--test", choices=["all", "recurring", "trial", "retries", "workflow", "config"],
                       default="all", help="Specific test to run")
    
    args = parser.parse_args()
    
    if args.test == "all":
        asyncio.run(run_all_tests())
    elif args.test == "recurring":
        asyncio.run(test_recurring_billing())
    elif args.test == "trial":
        asyncio.run(test_trial_processing())
    elif args.test == "retries":
        asyncio.run(test_payment_retries())
    elif args.test == "workflow":
        asyncio.run(test_full_workflow())
    elif args.test == "config":
        test_config_loading()
        test_cron_schedule_generation()

if __name__ == "__main__":
    main()
