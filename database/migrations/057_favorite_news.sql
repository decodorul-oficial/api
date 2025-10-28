-- Migration: Create favorite_news table for user's favorite news articles
-- This table stores which news articles users have marked as favorites
-- Only available for users with active subscriptions or trials

-- Create favorite_news table
CREATE TABLE IF NOT EXISTS favorite_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    news_id TEXT NOT NULL, -- References the news article ID (string)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combination of user and news
    UNIQUE(user_id, news_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorite_news_user_id ON favorite_news(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_news_news_id ON favorite_news(news_id);
CREATE INDEX IF NOT EXISTS idx_favorite_news_created_at ON favorite_news(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE favorite_news ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own favorite news
CREATE POLICY "Users can view their own favorite news" ON favorite_news
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own favorite news
CREATE POLICY "Users can insert their own favorite news" ON favorite_news
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own favorite news
CREATE POLICY "Users can update their own favorite news" ON favorite_news
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own favorite news
CREATE POLICY "Users can delete their own favorite news" ON favorite_news
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_favorite_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_favorite_news_updated_at
    BEFORE UPDATE ON favorite_news
    FOR EACH ROW
    EXECUTE FUNCTION update_favorite_news_updated_at();

-- Add comment to table
COMMENT ON TABLE favorite_news IS 'Stores user favorite news articles. Only available for users with active subscriptions or trials.';
COMMENT ON COLUMN favorite_news.user_id IS 'Reference to the user who favorited the news';
COMMENT ON COLUMN favorite_news.news_id IS 'Reference to the news article ID (string)';
COMMENT ON COLUMN favorite_news.created_at IS 'When the news was added to favorites';
COMMENT ON COLUMN favorite_news.updated_at IS 'When the favorite record was last updated';
