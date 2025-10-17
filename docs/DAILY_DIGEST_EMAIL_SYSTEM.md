# Daily Digest Email System

## Overview

The Daily Digest Email System is a reworked version of the email notification system that sends consolidated daily emails to users instead of instant notifications. This prevents email spam by sending a single, comprehensive email per day summarizing all new articles that match a user's saved searches.

## Architecture

### Core Components

1. **Database Schema** - Tables and functions for managing digest data
2. **Email Template System** - Templates that support article lists and loops
3. **Daily Digest Service** - Core business logic for processing digests
4. **Cron Job Script** - Scheduled execution of digest processing
5. **GraphQL API** - Unchanged user-facing API

### Key Features

- **Once-daily processing** - Runs Monday to Friday at 8:00 AM
- **Consolidated emails** - Single email per user with all matching articles
- **Article deduplication** - Removes duplicate articles across multiple searches
- **Template-based emails** - HTML templates with article list support
- **Comprehensive logging** - Tracks all digest processing activities
- **Subscription limits** - Respects user subscription tier limits

## Database Schema

### Tables

#### `payments.email_templates`
Stores email templates for digest emails.

```sql
CREATE TABLE payments.email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

#### `payments.email_digest_logs`
Logs all digest processing activities.

```sql
CREATE TABLE payments.email_digest_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    articles_sent_count INTEGER DEFAULT 0,
    saved_searches_triggered JSONB DEFAULT '[]'::jsonb,
    template_id UUID NOT NULL REFERENCES payments.email_templates(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE(user_id, digest_date)
);
```

### Columns Added

#### `payments.subscription_tiers.max_email_notifications`
Maximum number of saved searches that can have email notifications enabled.

#### `saved_searches.email_notifications_enabled`
Boolean flag indicating whether email notifications are enabled for this search.

### Functions

#### `public.get_users_with_active_email_notifications()`
Returns all users with active email notifications and their saved searches.

#### `public.check_email_notification_limit(user_id)`
Checks if a user can enable more email notifications based on their subscription tier.

#### `public.get_user_email_notification_limit(user_id)`
Gets the maximum number of email notifications allowed for a user.

#### `public.get_user_current_email_notifications_count(user_id)`
Gets the current number of active email notifications for a user.

## Email Template System

### Template Variables

The daily digest template supports the following variables:

#### Single-use Variables
- `{userName}` - User's display name
- `{currentDate}` - Current date in Romanian format
- `{totalArticleCount}` - Total number of articles found

#### Article List Variable
- `{articleList}` - HTML-formatted list of articles

### Article Object Structure

Each article in the list contains:
```javascript
{
  id: "article-id",
  title: "Article Title",
  link: "https://monitoruloficial.ro/stiri/article-id",
  excerpt: "Article excerpt...",
  publishedAt: "01/01/2024",
  source: "Monitorul Oficial",
  category: "Politics",
  searchName: "My Saved Search"
}
```

### Template Processing

The `EmailTemplateService` processes templates by:
1. Replacing single-use variables with their values
2. Generating HTML for the article list
3. Handling empty article lists with appropriate messaging

## Daily Digest Service

### Core Methods

#### `processDailyDigest(digestDate)`
Main method that processes digests for all users with active notifications.

**Workflow:**
1. Fetches all users with active email notifications
2. For each user, finds new articles from the last 24 hours
3. Groups articles by user and removes duplicates
4. Sends consolidated email if articles are found
5. Logs the processing result

#### `processUserDigest(user, digestDate)`
Processes digest for a single user.

**Workflow:**
1. Checks if digest was already processed for the date
2. Finds new articles matching user's saved searches
3. Sends email if articles are found
4. Creates digest log entry

#### `findNewArticlesForUser(user, digestDate)`
Finds all new articles for a user's saved searches.

**Workflow:**
1. Gets all saved searches with notifications enabled
2. For each search, finds articles from the last 24 hours
3. Applies search filters (keywords, category, source)
4. Removes duplicate articles across searches

### Article Filtering

The system applies the following filters based on saved search parameters:

- **Keywords** - Searches in title and content
- **Category** - Filters by article category
- **Source** - Filters by article source
- **Date Range** - Last 24 hours from digest date

## Cron Job Script

### Location
`scripts/daily-digest-cron.js`

### Schedule
Runs Monday to Friday at 8:00 AM:
```bash
0 8 * * 1-5 /usr/bin/node /path/to/scripts/daily-digest-cron.js
```

### Commands

#### `process` (default)
Processes the daily digest for the current date.

#### `health`
Runs health checks to verify system functionality.

#### `stats`
Shows digest statistics for the last 7 days.

#### `test`
Runs test mode processing yesterday's digest.

### Setup

Use the provided setup script:
```bash
./scripts/setup-daily-digest-cron.sh
```

## GraphQL API

The user-facing GraphQL API remains unchanged. Users can still:

- Toggle email notifications on/off for saved searches
- View their email notification limits and current usage
- Manage their saved searches

### Unchanged Endpoints

- `toggleEmailNotifications` - Enable/disable notifications for a search
- `getEmailNotificationInfo` - Get user's notification limits and usage
- `getSavedSearches` - List saved searches with notification status

## Configuration

### Environment Variables

Required environment variables:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

Optional environment variables:
- `NODE_ENV` - Environment (default: 'production')
- `LOG_LEVEL` - Logging level (default: 'info')

### Subscription Limits

Default limits by subscription tier:
- **Free**: 0 notifications
- **Pro**: 5 notifications
- **Enterprise**: 20 notifications

## Monitoring and Logging

### Log Files
- Cron job logs: `/var/log/daily-digest-cron.log`
- Application logs: Console output with timestamps

### Digest Logs
All digest processing is logged in `payments.email_digest_logs` with:
- User ID and digest date
- Number of articles sent
- Which saved searches were triggered
- Processing status (SENT, FAILED, SKIPPED)
- Error messages (if any)
- Timestamp of email sending

### Statistics

The system tracks:
- Total users processed
- Emails sent successfully
- Emails failed
- Emails skipped (no articles or already processed)
- Total articles sent
- Processing time

## Testing

### Test Script
Run the comprehensive test:
```bash
node test-daily-digest.js
```

### Manual Testing
```bash
# Health check
node scripts/daily-digest-cron.js health

# Test mode (process yesterday)
node scripts/daily-digest-cron.js test

# View statistics
node scripts/daily-digest-cron.js stats
```

## Deployment

### Database Migrations

1. **Cleanup Migration (059)**
   ```bash
   # Remove all previous email notification artifacts
   psql -f database/migrations/059_cleanup_email_notification_system.sql
   ```

2. **Daily Digest Migration (060)**
   ```bash
   # Create new daily digest system
   psql -f database/migrations/060_daily_digest_email_system.sql
   ```

### Cron Job Setup

1. Run the setup script:
   ```bash
   ./scripts/setup-daily-digest-cron.sh
   ```

2. Verify the cron job:
   ```bash
   crontab -l | grep daily-digest
   ```

3. Monitor logs:
   ```bash
   tail -f /var/log/daily-digest-cron.log
   ```

## Troubleshooting

### Common Issues

#### Digest Not Processing
- Check cron job is installed: `crontab -l`
- Verify environment variables are set
- Check log file for errors: `tail -f /var/log/daily-digest-cron.log`

#### No Emails Being Sent
- Verify users have active saved searches with notifications enabled
- Check if articles exist in the last 24 hours
- Verify email template exists: `daily_article_digest`

#### Database Errors
- Ensure migrations 059 and 060 have been applied
- Check database permissions for service role
- Verify all required tables and functions exist

### Health Checks

Run health checks to diagnose issues:
```bash
node scripts/daily-digest-cron.js health
```

This will verify:
- Database connectivity
- Email template availability
- Service initialization

## Security Considerations

- All database functions use `SECURITY DEFINER` for proper access control
- Row Level Security (RLS) is enabled on all tables
- Service role key is required for digest processing
- User data is properly isolated and protected

## Performance Considerations

- Digest processing is limited to 50 articles per search for performance
- Duplicate articles are removed to reduce email size
- Processing is done sequentially to avoid overwhelming the email service
- Comprehensive logging allows for performance monitoring

## Future Enhancements

Potential improvements:
- Parallel processing for better performance
- Email preferences (frequency, format)
- Article ranking and relevance scoring
- A/B testing for email templates
- Advanced filtering options
- Digest preview functionality
