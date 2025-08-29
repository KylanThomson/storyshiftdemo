-- Migration: Add brandId column to Chat table
-- This migration adds a brandId column to the Chat table to support company-specific chat history

ALTER TABLE "Chat" ADD COLUMN "brandId" VARCHAR(32) NOT NULL DEFAULT 'storyshift';

-- Update existing chats to have the default brandId
UPDATE "Chat" SET "brandId" = 'storyshift' WHERE "brandId" IS NULL;

-- Add an index on brandId for better query performance
CREATE INDEX IF NOT EXISTS "idx_chat_brand_id" ON "Chat" ("brandId");

-- Add a composite index on userId and brandId for efficient filtering
CREATE INDEX IF NOT EXISTS "idx_chat_user_brand" ON "Chat" ("userId", "brandId");
