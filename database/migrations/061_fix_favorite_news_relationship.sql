-- Migration: Fix favorite_news.news_id data type and add foreign key relationship
-- Date: 2025-01-27
-- Description: Converts news_id from text to bigint and creates proper relationship with stiri table
-- This enables JOIN queries between favorite_news and stiri tables

-- Step 1: Add a new column with correct data type
ALTER TABLE favorite_news 
ADD COLUMN news_id_bigint bigint;

-- Step 2: Convert existing text news_id values to bigint
UPDATE favorite_news 
SET news_id_bigint = news_id::bigint 
WHERE news_id ~ '^[0-9]+$';

-- Step 3: Drop the old text column
ALTER TABLE favorite_news 
DROP COLUMN news_id;

-- Step 4: Rename the new column to news_id
ALTER TABLE favorite_news 
RENAME COLUMN news_id_bigint TO news_id;

-- Step 5: Make news_id NOT NULL
ALTER TABLE favorite_news 
ALTER COLUMN news_id SET NOT NULL;

-- Step 6: Add foreign key constraint
ALTER TABLE favorite_news 
ADD CONSTRAINT favorite_news_news_id_fkey 
FOREIGN KEY (news_id) REFERENCES stiri(id) ON DELETE CASCADE;

-- Step 7: Add unique constraint to prevent duplicate favorites
ALTER TABLE favorite_news 
ADD CONSTRAINT favorite_news_user_news_unique 
UNIQUE (user_id, news_id);

-- Step 8: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorite_news_user_id ON favorite_news(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_news_news_id ON favorite_news(news_id);
CREATE INDEX IF NOT EXISTS idx_favorite_news_created_at ON favorite_news(created_at);

-- Add comment to document the change
COMMENT ON COLUMN favorite_news.news_id IS 'Reference to stiri.id (bigint) - changed from text to enable proper JOIN relationships';
