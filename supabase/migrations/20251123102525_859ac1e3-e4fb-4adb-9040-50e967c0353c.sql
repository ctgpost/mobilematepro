-- Add model column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS model text;